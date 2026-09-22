const Incident = require('../domain/entities/Incident');
const IncidentEvent = require('../domain/entities/IncidentEvent');
const IncidentDetectionPolicy = require('../domain/entities/IncidentDetectionPolicy');

/**
 * IncidentDetectionService
 *
 * Configurable, deterministic incident detection and continuous monitoring.
 *
 * Capabilities:
 * 1. Event-driven processing of telemetry events (`processTelemetryEvent`).
 * 2. Continuous deduplication: ongoing anomalies update active incidents rather than spawning duplicates.
 * 3. Automatic resolution: active incidents are resolved when metrics recover over the observation window.
 * 4. Terminal resolution rule: resolved incidents are never reopened; subsequent anomalies create new incidents.
 * 5. Strict multi-tenant and environment isolation: scoped by (projectId, environment).
 */
class IncidentDetectionService {
  /**
   * @param {object} deps
   * @param {import('../../infrastructure/repositories/TelemetryRepository')} deps.telemetryRepository
   * @param {import('../../infrastructure/repositories/IncidentRepository')} deps.incidentRepository
   * @param {import('../../infrastructure/repositories/IncidentEventRepository')} deps.incidentEventRepository
   * @param {import('./BlastRadiusService')} deps.blastRadiusService
   * @param {object} [deps.config] - Detection thresholds
   * @param {IncidentDetectionPolicy} [deps.policy] - Detection policy instance
   */
  constructor({
    telemetryRepository,
    incidentRepository,
    incidentEventRepository,
    blastRadiusService,
    config = {},
    policy,
  }) {
    this.telemetryRepository = telemetryRepository;
    this.incidentRepository = incidentRepository;
    this.incidentEventRepository = incidentEventRepository;
    this.blastRadiusService = blastRadiusService;
    this.config = config;
    this.policy = policy || new IncidentDetectionPolicy(config);
  }

  /**
   * Handles an incoming processed telemetry event from the event bus.
   * Performs continuous real-time incident detection, update, or auto-resolution.
   *
   * @param {object} payload
   * @param {object} payload.event - TelemetryEvent JSON
   * @param {string} [payload.projectId]
   * @returns {Promise<{action: 'created'|'updated'|'resolved'|'none', incident: Incident|null}>}
   */
  async processTelemetryEvent(payload) {
    if (!payload || !payload.event) {
      return { action: 'none', incident: null };
    }

    const teData = payload.event;
    const projectId = payload.projectId || teData.projectId || 'project-default';
    const environment = teData.environment || 'production';
    const serviceName = teData.sourceService;

    if (!serviceName) {
      return { action: 'none', incident: null };
    }

    const eventTimestamp = teData.timestamp ? new Date(teData.timestamp) : new Date();

    // 1. Check if there is an active (detected or investigating) incident for this service
    const activeIncident = await this.incidentRepository.findActiveByService(
      projectId,
      environment,
      serviceName
    );

    if (activeIncident) {
      // Check for recovery over observation window
      const recoveryWindowStart = new Date(eventTimestamp.getTime() - this.policy.recoveryObservationWindowMs);
      const recoveryEvents = await this.telemetryRepository.findByTimeRange(
        recoveryWindowStart,
        eventTimestamp,
        { projectId, environment, sourceService: serviceName }
      );

      const recoveryEval = this.policy.evaluateRecovery(recoveryEvents);
      if (recoveryEval.recovered) {
        activeIncident.transitionTo('resolved', eventTimestamp);
        await this.incidentRepository.update(activeIncident);
        return { action: 'resolved', incident: activeIncident };
      }

      // If still ongoing, update trigger metrics from current time window
      const windowStart = new Date(eventTimestamp.getTime() - this.policy.timeWindowMs);
      const currentEvents = await this.telemetryRepository.findByTimeRange(
        windowStart,
        eventTimestamp,
        { projectId, environment, sourceService: serviceName }
      );
      const anomalyEval = this.policy.evaluateAnomaly(currentEvents);

      if (anomalyEval.isAnomaly) {
        const severity = this.policy.calculateSeverity(anomalyEval.analysis, anomalyEval.triggers);
        activeIncident.severity = severity;
        activeIncident.updateTrigger({
          serviceName,
          triggers: anomalyEval.triggers,
          errorRate: anomalyEval.analysis.errorRate,
          avgLatency: anomalyEval.analysis.avgLatency,
          eventCount: currentEvents.length,
          errorCount: anomalyEval.analysis.errorCount,
        });
      }

      // Check if this telemetry event itself is anomalous and not already in timeline (idempotency)
      const isAnomalous =
        (teData.statusCode !== null && teData.statusCode >= 500) ||
        (teData.latencyMs !== null && teData.latencyMs > this.policy.latencyThresholdMs);

      if (isAnomalous && teData.eventId) {
        const existingEvent = await this.incidentEventRepository.findByTelemetryEventId(
          activeIncident.incidentId,
          teData.eventId
        );

        if (!existingEvent) {
          const type = (teData.statusCode !== null && teData.statusCode >= 500)
            ? 'error'
            : 'latency_spike';
          const message = type === 'error'
            ? `HTTP ${teData.statusCode} from ${serviceName}${teData.endpoint ? ` at ${teData.endpoint}` : ''}`
            : `Latency ${teData.latencyMs}ms from ${serviceName}${teData.endpoint ? ` at ${teData.endpoint}` : ''}`;

          const newIncidentEvent = new IncidentEvent({
            incidentId: activeIncident.incidentId,
            projectId,
            timestamp: eventTimestamp,
            serviceId: serviceName,
            type,
            message,
            metadata: {
              telemetryEventId: teData.eventId,
              endpoint: teData.endpoint,
              statusCode: teData.statusCode,
              latencyMs: teData.latencyMs,
            },
          });

          await this.incidentEventRepository.save(newIncidentEvent);
          activeIncident.addEvent(newIncidentEvent.eventId);
        }
      }

      await this.incidentRepository.update(activeIncident);
      return { action: 'updated', incident: activeIncident };
    }

    // No active incident: check if new anomaly should be triggered
    const windowStart = new Date(eventTimestamp.getTime() - this.policy.timeWindowMs);
    const windowEvents = await this.telemetryRepository.findByTimeRange(
      windowStart,
      eventTimestamp,
      { projectId, environment, sourceService: serviceName }
    );

    const anomalyEval = this.policy.evaluateAnomaly(windowEvents);
    if (!anomalyEval.isAnomaly) {
      return { action: 'none', incident: null };
    }

    // Create a fresh incident
    const severity = this.policy.calculateSeverity(anomalyEval.analysis, anomalyEval.triggers);
    const incident = new Incident({
      projectId,
      environment,
      title: `Anomaly detected: ${serviceName}`,
      severity,
      startedAt: eventTimestamp,
      trigger: {
        serviceName,
        triggers: anomalyEval.triggers,
        errorRate: anomalyEval.analysis.errorRate,
        avgLatency: anomalyEval.analysis.avgLatency,
        eventCount: windowEvents.length,
        errorCount: anomalyEval.analysis.errorCount,
      },
    });

    // Calculate blast radius and add affected services
    try {
      if (this.blastRadiusService) {
        const blastRadius = this.blastRadiusService.analyze(serviceName);
        for (const affectedId of blastRadius.directlyAffected || []) {
          incident.addAffectedService(affectedId);
        }
        for (const affectedId of blastRadius.indirectlyAffected || []) {
          incident.addAffectedService(affectedId);
        }
      }
    } catch {
      // BlastRadius failure should not prevent incident creation
    }

    await this.incidentRepository.save(incident);

    // Create ordered IncidentEvents from triggering telemetry
    const incidentEvents = this._createIncidentEvents(incident, windowEvents, anomalyEval.analysis);
    for (const ie of incidentEvents) {
      await this.incidentEventRepository.save(ie);
      incident.addEvent(ie.eventId);
    }

    await this.incidentRepository.update(incident);
    return { action: 'created', incident };
  }

  /**
   * Runs detection against recent telemetry.
   *
   * @param {object} [options]
   * @param {Date} [options.now] - Reference time (defaults to current time). Enables deterministic testing.
   * @param {string} [options.projectId] - Optional project scoping
   * @param {string} [options.environment] - Optional environment scoping
   * @returns {Promise<Incident[]>} array of created or updated incidents
   */
  async detect(options = {}) {
    const now = options.now || new Date();
    const projectId = options.projectId;
    const environment = options.environment;
    const windowStart = new Date(now.getTime() - this.policy.timeWindowMs);

    // 1. Fetch recent telemetry
    const repoOptions = {};
    if (projectId !== undefined) repoOptions.projectId = projectId;
    if (environment !== undefined) repoOptions.environment = environment;
    const events = await this.telemetryRepository.findByTimeRange(windowStart, now, repoOptions);

    // 2. Group by (projectId, environment, sourceService)
    const serviceGroups = this._groupByService(events);

    // 3. Evaluate each service group
    const incidents = [];
    for (const group of serviceGroups.values()) {
      const { projectId: groupProjectId, environment: groupEnv, serviceName, events: serviceEvents } = group;

      // Check if an active incident exists
      const activeIncident = await this.incidentRepository.findActiveByService(
        groupProjectId,
        groupEnv,
        serviceName
      );

      // If active incident exists, check recovery first
      if (activeIncident) {
        const recStart = new Date(now.getTime() - this.policy.recoveryObservationWindowMs);
        const recEvents = await this.telemetryRepository.findByTimeRange(recStart, now, {
          projectId: groupProjectId,
          environment: groupEnv,
          sourceService: serviceName,
        });
        const recoveryEval = this.policy.evaluateRecovery(recEvents);
        if (recoveryEval.recovered) {
          activeIncident.transitionTo('resolved', now);
          await this.incidentRepository.update(activeIncident);
          continue;
        }
      }

      // Check anomaly
      const anomalyEval = this.policy.evaluateAnomaly(serviceEvents);
      if (!anomalyEval.isAnomaly) {
        continue;
      }

      if (activeIncident) {
        // Deduplicate: update active incident
        activeIncident.severity = this.policy.calculateSeverity(anomalyEval.analysis, anomalyEval.triggers);
        activeIncident.updateTrigger({
          serviceName,
          triggers: anomalyEval.triggers,
          errorRate: anomalyEval.analysis.errorRate,
          avgLatency: anomalyEval.analysis.avgLatency,
          eventCount: serviceEvents.length,
          errorCount: anomalyEval.analysis.errorCount,
        });

        // Add any new events idempotently
        const newEvents = this._createIncidentEvents(activeIncident, serviceEvents, anomalyEval.analysis);
        for (const ie of newEvents) {
          const teId = ie.metadata?.telemetryEventId;
          let exists = false;
          if (teId) {
            const found = await this.incidentEventRepository.findByTelemetryEventId(activeIncident.incidentId, teId);
            if (found) exists = true;
          }
          if (!exists) {
            await this.incidentEventRepository.save(ie);
            activeIncident.addEvent(ie.eventId);
          }
        }
        await this.incidentRepository.update(activeIncident);
        incidents.push(activeIncident);
      } else {
        // Create new incident
        const severity = this.policy.calculateSeverity(anomalyEval.analysis, anomalyEval.triggers);
        const incident = new Incident({
          projectId: groupProjectId,
          environment: groupEnv,
          title: `Anomaly detected: ${serviceName}`,
          severity,
          startedAt: now,
          trigger: {
            serviceName,
            triggers: anomalyEval.triggers,
            errorRate: anomalyEval.analysis.errorRate,
            avgLatency: anomalyEval.analysis.avgLatency,
            eventCount: serviceEvents.length,
            errorCount: anomalyEval.analysis.errorCount,
          },
        });

        try {
          if (this.blastRadiusService) {
            const blastRadius = this.blastRadiusService.analyze(serviceName);
            for (const affectedId of blastRadius.directlyAffected || []) {
              incident.addAffectedService(affectedId);
            }
            for (const affectedId of blastRadius.indirectlyAffected || []) {
              incident.addAffectedService(affectedId);
            }
          }
        } catch {
          // BlastRadius failure should not prevent incident creation
        }

        await this.incidentRepository.save(incident);

        const incidentEvents = this._createIncidentEvents(incident, serviceEvents, anomalyEval.analysis);
        for (const ie of incidentEvents) {
          await this.incidentEventRepository.save(ie);
          incident.addEvent(ie.eventId);
        }

        await this.incidentRepository.update(incident);
        incidents.push(incident);
      }
    }

    return incidents;
  }

  /**
   * Groups telemetry events by (projectId, environment, sourceService).
   * @param {import('../../domain/entities/TelemetryEvent')[]} events
   * @returns {Map<string, { projectId: string, environment: string, serviceName: string, events: import('../../domain/entities/TelemetryEvent')[] }>}
   */
  _groupByService(events) {
    const groups = new Map();
    for (const event of events) {
      const proj = event.projectId || 'project-default';
      const env = event.environment || 'production';
      const svc = event.sourceService;
      if (!svc) continue;

      const key = `${proj}:::${env}:::${svc}`;
      if (!groups.has(key)) {
        groups.set(key, {
          projectId: proj,
          environment: env,
          serviceName: svc,
          events: [],
        });
      }
      groups.get(key).events.push(event);
    }
    return groups;
  }

  /**
   * Analyzes a group of events for a single service.
   */
  _analyzeServiceEvents(events) {
    return this.policy.analyzeEvents(events);
  }

  /**
   * Calculates incident severity based on analysis results.
   */
  _calculateSeverity(analysis, triggers) {
    return this.policy.calculateSeverity(analysis, triggers);
  }

  /**
   * Creates ordered IncidentEvents from telemetry events.
   */
  _createIncidentEvents(incident, telemetryEvents, analysis) {
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
      } else if (te.latencyMs !== null && te.latencyMs > this.policy.latencyThresholdMs) {
        type = 'latency_spike';
        message = `Latency ${te.latencyMs}ms from ${te.sourceService}${te.endpoint ? ` at ${te.endpoint}` : ''}`;
      } else {
        continue;
      }

      incidentEvents.push(
        new IncidentEvent({
          incidentId: incident.incidentId,
          projectId: incident.projectId || 'project-default',
          timestamp: te.timestamp,
          serviceId: te.sourceService,
          type,
          message,
          metadata: {
            telemetryEventId: te.eventId,
            endpoint: te.endpoint,
            statusCode: te.statusCode,
            latencyMs: te.latencyMs,
          },
        })
      );
    }

    return incidentEvents;
  }
}

module.exports = IncidentDetectionService;
