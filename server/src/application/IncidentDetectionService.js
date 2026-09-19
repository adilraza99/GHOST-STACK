const Incident = require('../domain/entities/Incident');
const IncidentEvent = require('../domain/entities/IncidentEvent');

/**
 * IncidentDetectionService
 *
 * Configurable, deterministic incident detection.
 *
 * Detection rules:
 * 1. Query recent telemetry within the configured time window.
 * 2. Group events by sourceService.
 * 3. For each service group with >= minimumEvents:
 *    a. Calculate error rate = count(statusCode >= 500) / totalEvents
 *    b. Calculate average latency from events with latencyMs values
 *    c. If errorRate > errorRateThreshold OR avgLatency > latencyThresholdMs:
 *       → create an incident
 *
 * What counts as an error:
 *   statusCode >= 500 (server errors only).
 *   4xx are client errors and do NOT trigger incident detection.
 *   Events without statusCode are ignored in error rate calculation.
 *
 * How error rate is calculated:
 *   errorRate = errorCount / totalEventsWithStatusCode
 *   Events without statusCode are excluded from the denominator.
 *   If no events have a statusCode, errorRate = 0.
 *
 * How latency threshold is evaluated:
 *   Average of all events that have a latencyMs value.
 *   Events without latencyMs are excluded.
 *   If no events have latencyMs, latency threshold is not triggered.
 *
 * How minimumEvents affects detection:
 *   A service must have >= minimumEvents total events in the time window
 *   before any threshold evaluation occurs. This prevents false positives
 *   from small sample sizes.
 *
 * What happens when no threshold is exceeded:
 *   No incident is created. The method returns null.
 */
class IncidentDetectionService {
  /**
   * @param {object} deps
   * @param {import('../../infrastructure/repositories/TelemetryRepository')} deps.telemetryRepository
   * @param {import('../../infrastructure/repositories/IncidentRepository')} deps.incidentRepository
   * @param {import('../../infrastructure/repositories/IncidentEventRepository')} deps.incidentEventRepository
   * @param {import('./BlastRadiusService')} deps.blastRadiusService
   * @param {object} deps.config - Detection thresholds
   * @param {number} deps.config.errorRateThreshold
   * @param {number} deps.config.latencyThresholdMs
   * @param {number} deps.config.minimumEvents
   * @param {number} deps.config.timeWindowMs
   */
  constructor({
    telemetryRepository,
    incidentRepository,
    incidentEventRepository,
    blastRadiusService,
    config,
  }) {
    this.telemetryRepository = telemetryRepository;
    this.incidentRepository = incidentRepository;
    this.incidentEventRepository = incidentEventRepository;
    this.blastRadiusService = blastRadiusService;
    this.config = config;
  }

  /**
   * Runs detection against recent telemetry.
   *
   * @param {object} [options]
   * @param {Date} [options.now] - Reference time (defaults to current time). Enables deterministic testing.
   * @returns {Promise<Incident[]>} array of created incidents (may be empty)
   */
  async detect(options = {}) {
    const now = options.now || new Date();
    const windowStart = new Date(now.getTime() - this.config.timeWindowMs);

    // 1. Fetch recent telemetry
    const events = await this.telemetryRepository.findByTimeRange(windowStart, now);

    // 2. Group by sourceService
    const serviceGroups = this._groupByService(events);

    // 3. Evaluate each service group
    const incidents = [];
    for (const [serviceName, serviceEvents] of serviceGroups.entries()) {
      // Skip groups below minimum event threshold
      if (serviceEvents.length < this.config.minimumEvents) {
        continue;
      }

      const analysis = this._analyzeServiceEvents(serviceEvents);

      const triggers = [];
      if (analysis.errorRate > this.config.errorRateThreshold) {
        triggers.push('error_rate');
      }
      if (analysis.avgLatency !== null && analysis.avgLatency > this.config.latencyThresholdMs) {
        triggers.push('latency');
      }

      if (triggers.length === 0) continue;

      // 4. Determine severity
      const severity = this._calculateSeverity(analysis, triggers);

      // 5. Create incident
      const incident = new Incident({
        title: `Anomaly detected: ${serviceName}`,
        severity,
        trigger: {
          serviceName,
          triggers,
          errorRate: analysis.errorRate,
          avgLatency: analysis.avgLatency,
          eventCount: serviceEvents.length,
          errorCount: analysis.errorCount,
        },
      });

      // 6. Calculate blast radius and add affected services
      let blastRadius = null;
      try {
        blastRadius = this.blastRadiusService.analyze(serviceName);
        for (const affectedId of blastRadius.directlyAffected) {
          incident.addAffectedService(affectedId);
        }
        for (const affectedId of blastRadius.indirectlyAffected) {
          incident.addAffectedService(affectedId);
        }
      } catch {
        // BlastRadius failure should not prevent incident creation
      }

      // 7. Persist incident
      await this.incidentRepository.save(incident);

      // 8. Create ordered IncidentEvents from triggering telemetry
      const incidentEvents = this._createIncidentEvents(incident, serviceEvents, analysis);
      for (const ie of incidentEvents) {
        await this.incidentEventRepository.save(ie);
        incident.addEvent(ie.eventId);
      }

      // 9. Update incident with event references
      await this.incidentRepository.update(incident);

      incidents.push(incident);
    }

    return incidents;
  }

  /**
   * Groups telemetry events by sourceService.
   * @param {import('../../domain/entities/TelemetryEvent')[]} events
   * @returns {Map<string, import('../../domain/entities/TelemetryEvent')[]>}
   */
  _groupByService(events) {
    const groups = new Map();
    for (const event of events) {
      if (!groups.has(event.sourceService)) {
        groups.set(event.sourceService, []);
      }
      groups.get(event.sourceService).push(event);
    }
    return groups;
  }

  /**
   * Analyzes a group of events for a single service.
   * @param {import('../../domain/entities/TelemetryEvent')[]} events
   * @returns {{ errorCount: number, eventsWithStatus: number, errorRate: number, avgLatency: number|null }}
   */
  _analyzeServiceEvents(events) {
    let errorCount = 0;
    let eventsWithStatus = 0;
    let latencySum = 0;
    let latencyCount = 0;

    for (const event of events) {
      if (event.statusCode !== null) {
        eventsWithStatus++;
        if (event.statusCode >= 500) {
          errorCount++;
        }
      }
      if (event.latencyMs !== null) {
        latencySum += event.latencyMs;
        latencyCount++;
      }
    }

    return {
      errorCount,
      eventsWithStatus,
      errorRate: eventsWithStatus > 0 ? errorCount / eventsWithStatus : 0,
      avgLatency: latencyCount > 0 ? latencySum / latencyCount : null,
    };
  }

  /**
   * Calculates incident severity based on analysis results.
   */
  _calculateSeverity(analysis, triggers) {
    const hasBothTriggers = triggers.includes('error_rate') && triggers.includes('latency');

    if (hasBothTriggers && analysis.errorRate > 0.8) return 'critical';
    if (hasBothTriggers) return 'high';
    if (analysis.errorRate > 0.8) return 'high';
    if (triggers.includes('error_rate')) return 'medium';
    return 'medium';
  }

  /**
   * Creates ordered IncidentEvents from telemetry events.
   * Events are sorted chronologically.
   */
  _createIncidentEvents(incident, telemetryEvents, analysis) {
    // Sort by timestamp for chronological ordering
    const sorted = [...telemetryEvents].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const incidentEvents = [];

    for (const te of sorted) {
      let type = 'error';
      let message = '';

      if (te.statusCode !== null && te.statusCode >= 500) {
        type = 'error';
        message = `HTTP ${te.statusCode} from ${te.sourceService}${te.endpoint ? ` at ${te.endpoint}` : ''}`;
      } else if (te.latencyMs !== null && te.latencyMs > this.config.latencyThresholdMs) {
        type = 'latency_spike';
        message = `Latency ${te.latencyMs}ms from ${te.sourceService}${te.endpoint ? ` at ${te.endpoint}` : ''}`;
      } else {
        continue; // skip non-anomalous events
      }

      incidentEvents.push(
        new IncidentEvent({
          incidentId: incident.incidentId,
          timestamp: te.timestamp,
          serviceId: te.sourceService,
          type,
          message,
        })
      );
    }

    return incidentEvents;
  }
}

module.exports = IncidentDetectionService;
