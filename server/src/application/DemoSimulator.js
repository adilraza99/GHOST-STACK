/**
 * DemoSimulator — Application Service
 *
 * Deterministic demo scenarios for GhostStack.
 * NO Math.random(). All events use fixed timestamps relative to a base time.
 *
 * Reuses existing application services:
 *   - TelemetryProcessingService (ingestion + dependency graph building)
 *   - DeploymentService (deployment creation)
 *   - DeploymentAnalysisService (deployment impact)
 *   - IncidentDetectionService (incident detection)
 *   - BlastRadiusService (blast radius)
 *   - DependencyGraphService (graph queries)
 *
 * Topology:
 *   frontend
 *     → api-gateway
 *         → auth-service
 *         → checkout-service
 *             → payment-service
 *                 → external-payment-provider
 *             → orders-service
 *                 → mongodb
 *                 → notification-service
 *         → analytics-service
 */

/** Fixed base time: all demo events are relative to this. */
const BASE_TIME = new Date('2026-01-15T10:00:00.000Z');

/** Millisecond offset helper */
const t = (offsetSeconds) => new Date(BASE_TIME.getTime() + offsetSeconds * 1000);

/** Topology: [ [source, target, dependencyType] ] */
const TOPOLOGY = [
  ['frontend', 'api-gateway', 'sync'],
  ['api-gateway', 'auth-service', 'sync'],
  ['api-gateway', 'checkout-service', 'sync'],
  ['checkout-service', 'payment-service', 'sync'],
  ['payment-service', 'external-payment-provider', 'external'],
  ['checkout-service', 'orders-service', 'sync'],
  ['orders-service', 'mongodb', 'database'],
  ['orders-service', 'notification-service', 'async'],
  ['api-gateway', 'analytics-service', 'async'],
];

/** Scenarios metadata — listed for GET /api/demo/scenarios */
const SCENARIOS = [
  {
    id: 'normal-traffic',
    name: 'Normal Traffic',
    description: 'Healthy telemetry across all services in the topology.',
  },
  {
    id: 'payment-deployment',
    name: 'Payment Service Deployment',
    description: 'Simulates a deployment of payment-service with deterministic impact analysis.',
  },
  {
    id: 'payment-latency',
    name: 'Payment Service Latency',
    description: 'payment-service develops high latency showing downstream impact on checkout.',
  },
  {
    id: 'payment-failure',
    name: 'Payment Service Failure',
    description: 'payment-service returns failures triggering incident detection.',
  },
  {
    id: 'complete-incident',
    name: 'Complete Incident Cascade',
    description: 'Full cascade: deployment → latency → failures → incident detection → blast radius.',
  },
];

/**
 * Build a deterministic normal-traffic event sequence.
 * Healthy: statusCode 200, low latency.
 */
function buildNormalTrafficEvents() {
  const events = [];
  let sec = 0;

  for (const [src, tgt, depType] of TOPOLOGY) {
    events.push({
      sourceService: src,
      targetService: tgt,
      statusCode: 200,
      latencyMs: 45,
      method: 'GET',
      endpoint: '/healthcheck',
      dependencyType: depType,
      timestamp: t(sec),
    });
    sec += 2;
  }
  return events;
}

/**
 * Build telemetry for payment-deployment scenario.
 * Simulates normal traffic, then a deployment event, then post-deployment traffic.
 */
function buildPaymentDeploymentEvents() {
  const events = [];
  let sec = 0;

  // Pre-deployment healthy traffic
  for (const [src, tgt, depType] of TOPOLOGY) {
    events.push({
      sourceService: src,
      targetService: tgt,
      statusCode: 200,
      latencyMs: 45,
      dependencyType: depType,
      timestamp: t(sec),
    });
    sec += 1;
  }

  // Post-deployment traffic — slightly elevated latency as service restarts
  const paymentEdges = TOPOLOGY.filter(([, tgt]) => tgt === 'payment-service' || tgt === 'external-payment-provider');
  for (const [src, tgt, depType] of paymentEdges) {
    for (let i = 0; i < 5; i++) {
      events.push({
        sourceService: src,
        targetService: tgt,
        statusCode: 200,
        latencyMs: 350 + i * 30,
        dependencyType: depType,
        timestamp: t(sec),
      });
      sec += 2;
    }
  }

  return events;
}

/**
 * Build telemetry for payment-latency scenario.
 * payment-service returns 200 but with high latency (> threshold).
 */
function buildPaymentLatencyEvents() {
  const events = [];
  let sec = 0;

  // Normal edges stay healthy
  for (const [src, tgt, depType] of TOPOLOGY) {
    if (tgt === 'payment-service' || tgt === 'external-payment-provider') continue;
    events.push({
      sourceService: src,
      targetService: tgt,
      statusCode: 200,
      latencyMs: 45,
      dependencyType: depType,
      timestamp: t(sec),
    });
    sec += 1;
  }

  // payment-service latency spike (avg 6200ms — above 5000ms threshold)
  const highLatencies = [5800, 6000, 6200, 6400, 6600, 6800];
  for (let i = 0; i < highLatencies.length; i++) {
    events.push({
      sourceService: 'checkout-service',
      targetService: 'payment-service',
      statusCode: 200,
      latencyMs: highLatencies[i],
      dependencyType: 'sync',
      timestamp: t(sec),
    });
    sec += 5;
  }

  // Downstream: checkout slows because payment is slow
  for (let i = 0; i < 6; i++) {
    events.push({
      sourceService: 'api-gateway',
      targetService: 'checkout-service',
      statusCode: 200,
      latencyMs: 3000 + i * 200,
      dependencyType: 'sync',
      timestamp: t(sec),
    });
    sec += 5;
  }

  return events;
}

/**
 * Build the core payment failure events only (no topology baseline).
 * 8 checkout→payment events: 6 failures + 2 successes = 75% error rate.
 * All timestamps fall within 60s before `now`.
 */
function buildPaymentFailureCoreEvents(now) {
  const events = [];
  const windowMs = 60000;
  const count = 8; // > minimumEvents(5), yields 75% error rate

  for (let i = 0; i < count; i++) {
    const isFailed = i < 6;
    const offsetMs = -windowMs + i * Math.floor(windowMs / count);
    events.push({
      sourceService: 'checkout-service',
      targetService: 'payment-service',
      statusCode: isFailed ? 500 : 200,
      latencyMs: isFailed ? 2000 : 80,
      dependencyType: 'sync',
      timestamp: new Date(now.getTime() + offsetMs),
    });
  }
  return events;
}

/**
 * Build telemetry for payment-failure scenario.
 * payment-service returns 500 on > 50% of calls — enough for incident detection.
 * Generates at least minimumEvents (5) within the detection time window.
 */
function buildPaymentFailureEvents(now) {
  const events = [];

  // Core failure events (checkout→payment, 75% error rate, within window)
  for (const e of buildPaymentFailureCoreEvents(now)) {
    events.push(e);
  }

  // Add healthy baseline on other edges to establish topology
  // Use timestamps > 65s before `now` (outside 60s detection window)
  let sec = -75;
  for (const [src, tgt, depType] of TOPOLOGY) {
    if (tgt === 'payment-service') continue;
    events.push({
      sourceService: src,
      targetService: tgt,
      statusCode: 200,
      latencyMs: 45,
      dependencyType: depType,
      timestamp: new Date(now.getTime() + sec * 1000),
    });
    sec -= 2; // Go further back in time (guaranteed outside window)
  }

  return events;
}

/**
 * Build the complete-incident cascade event sequence.
 * Phase 1: Normal traffic (topology established)
 * Phase 2: Payment deployment
 * Phase 3: Latency spike
 * Phase 4: Failures (within detection window of `now`)
 */
function buildCompleteIncidentEvents(now) {
  const events = [];

  // Phase 1: Normal traffic (120s before now)
  let baseOffset = now.getTime() - 120000;
  let sec = 0;
  for (const [src, tgt, depType] of TOPOLOGY) {
    events.push({
      sourceService: src,
      targetService: tgt,
      statusCode: 200,
      latencyMs: 45,
      dependencyType: depType,
      timestamp: new Date(baseOffset + sec * 1000),
    });
    sec += 2;
  }

  // Phase 2: Post-deployment elevated latency (90s–60s before now)
  const paymentEdges = TOPOLOGY.filter(([, tgt]) => tgt === 'payment-service');
  baseOffset = now.getTime() - 90000;
  sec = 0;
  for (const [src, tgt, depType] of paymentEdges) {
    for (let i = 0; i < 3; i++) {
      events.push({
        sourceService: src,
        targetService: tgt,
        statusCode: 200,
        latencyMs: 800 + i * 200,
        dependencyType: depType,
        timestamp: new Date(baseOffset + sec * 1000),
      });
      sec += 5;
    }
  }

  // Phase 3: Latency escalation (65s–33s before now — just outside detection window)
  // Kept outside the 60s detection window so these healthy 200s don't dilute
  // the failure ratio computed by IncidentDetectionService.
  baseOffset = now.getTime() - 65000;
  sec = 0;
  for (let i = 0; i < 4; i++) {
    events.push({
      sourceService: 'checkout-service',
      targetService: 'payment-service',
      statusCode: 200,
      latencyMs: 5200 + i * 400,
      dependencyType: 'sync',
      timestamp: new Date(baseOffset + sec * 1000),
    });
    sec += 8;
  }


  // Phase 4: Failures only (within 60s window of now) — no topology baseline
  //   (topology was established in Phase 1, no need to re-add healthy events
  //   which would dilute checkout-service error rate below the threshold)
  const failureOnlyEvents = buildPaymentFailureCoreEvents(now);
  for (const e of failureOnlyEvents) {

    events.push(e);
  }

  return events;
}

class DemoSimulator {
  /**
   * @param {object} deps
   * @param {import('./TelemetryProcessingService')} deps.telemetryProcessingService
   * @param {import('./DeploymentService')} deps.deploymentService
   * @param {import('./DeploymentAnalysisService')} deps.deploymentAnalysisService
   * @param {import('./IncidentDetectionService')} deps.incidentDetectionService
   * @param {import('./BlastRadiusService')} deps.blastRadiusService
   * @param {import('./DependencyGraphService')} deps.graphService
   * @param {object} deps.serviceRepository
   * @param {object} deps.dependencyRepository
   * @param {object} deps.telemetryRepository
   * @param {object} deps.incidentRepository
   * @param {object} deps.incidentEventRepository
   * @param {object} deps.deploymentRepository
   */
  constructor(deps) {
    this.telemetryProcessingService = deps.telemetryProcessingService;
    this.deploymentService = deps.deploymentService;
    this.deploymentAnalysisService = deps.deploymentAnalysisService;
    this.incidentDetectionService = deps.incidentDetectionService;
    this.blastRadiusService = deps.blastRadiusService;
    this.graphService = deps.graphService;
    this.serviceRepository = deps.serviceRepository;
    this.dependencyRepository = deps.dependencyRepository;
    this.telemetryRepository = deps.telemetryRepository;
    this.incidentRepository = deps.incidentRepository;
    this.incidentEventRepository = deps.incidentEventRepository;
    this.deploymentRepository = deps.deploymentRepository;
  }

  /** Return the static scenario list. */
  listScenarios() {
    return SCENARIOS;
  }

  /** Clear all data. */
  async reset() {
    await this.serviceRepository.deleteAll();
    await this.dependencyRepository.deleteAll();
    await this.telemetryRepository.deleteAll();
    await this.incidentRepository.deleteAll();
    await this.incidentEventRepository.deleteAll();
    await this.deploymentRepository.deleteAll();
  }

  /**
   * Run a named scenario.
   * @param {string} scenarioId
   * @param {Date} [now=new Date()] — injectable for determinism in tests
   * @returns {Promise<object>} scenario result
   */
  async run(scenarioId, now = new Date()) {
    const found = SCENARIOS.find((s) => s.id === scenarioId);
    if (!found) {
      const err = new Error(`Scenario not found: ${scenarioId}`);
      err.statusCode = 404;
      err.errorCode = 'NOT_FOUND';
      throw err;
    }

    switch (scenarioId) {
      case 'normal-traffic':
        return this._runNormalTraffic();
      case 'payment-deployment':
        return this._runPaymentDeployment();
      case 'payment-latency':
        return this._runPaymentLatency(now);
      case 'payment-failure':
        return this._runPaymentFailure(now);
      case 'complete-incident':
        return this._runCompleteIncident(now);
      default:
        throw new Error(`Unhandled scenario: ${scenarioId}`);
    }
  }

  // ─── Private scenario implementations ─────────────────────────────────────

  async _runNormalTraffic() {
    const events = buildNormalTrafficEvents();
    const processed = await this._ingestEvents(events);
    await this.graphService.build();
    const stats = this.graphService.getStats();

    return {
      scenario: 'normal-traffic',
      eventsProcessed: processed.length,
      topology: stats,
      servicesDiscovered: (await this.serviceRepository.findAll()).map((s) => s.name),
    };
  }

  async _runPaymentDeployment() {
    const events = buildPaymentDeploymentEvents();
    const processed = await this._ingestEvents(events);

    // Find payment-service
    await this.graphService.build();
    const paymentService = await this.serviceRepository.findByName('payment-service');

    let deployment = null;
    let analysis = null;

    if (paymentService) {
      deployment = await this.deploymentService.create({
        serviceId: paymentService.serviceId,
        previousVersion: '1.2.0',
        newVersion: '1.3.0',
        environment: 'production',
      });

      analysis = await this.deploymentAnalysisService.analyze({
        serviceId: paymentService.serviceId,
        newVersion: '1.3.0',
      });
    }

    return {
      scenario: 'payment-deployment',
      eventsProcessed: processed.length,
      deployment: deployment ? deployment.toJSON() : null,
      impactAnalysis: analysis,
    };
  }

  async _runPaymentLatency(now) {
    const events = buildPaymentLatencyEvents();
    const processed = await this._ingestEvents(events);

    await this.graphService.build();

    // Detect incidents using the actual detection window anchored to the last event's time
    const lastEvent = events[events.length - 1];
    const incidents = await this.incidentDetectionService.detect({ now: lastEvent.timestamp });

    // Blast radius on payment-service if it exists
    const paymentService = await this.serviceRepository.findByName('payment-service');
    let blastRadius = null;
    if (paymentService) {
      blastRadius = this.blastRadiusService.analyze(paymentService.serviceId);
    }

    return {
      scenario: 'payment-latency',
      eventsProcessed: processed.length,
      incidentsDetected: incidents.length,
      incidents: incidents.map((i) => i.toJSON()),
      blastRadius,
    };
  }

  async _runPaymentFailure(now) {
    const events = buildPaymentFailureEvents(now);
    const processed = await this._ingestEvents(events);

    await this.graphService.build();

    const incidents = await this.incidentDetectionService.detect({ now });

    const paymentService = await this.serviceRepository.findByName('payment-service');
    let blastRadius = null;
    if (paymentService) {
      blastRadius = this.blastRadiusService.analyze(paymentService.serviceId);
    }

    return {
      scenario: 'payment-failure',
      eventsProcessed: processed.length,
      incidentsDetected: incidents.length,
      incidents: incidents.map((i) => i.toJSON()),
      blastRadius,
    };
  }

  async _runCompleteIncident(now) {
    const events = buildCompleteIncidentEvents(now);
    const processed = await this._ingestEvents(events);

    // Deployment
    await this.graphService.build();
    const paymentService = await this.serviceRepository.findByName('payment-service');

    let deployment = null;
    let impactAnalysis = null;
    if (paymentService) {
      deployment = await this.deploymentService.create({
        serviceId: paymentService.serviceId,
        previousVersion: '1.2.0',
        newVersion: '1.3.0',
        environment: 'production',
      });

      impactAnalysis = await this.deploymentAnalysisService.analyze({
        serviceId: paymentService.serviceId,
        newVersion: '1.3.0',
      });
    }

    // Incident detection
    const incidents = await this.incidentDetectionService.detect({ now });

    // Blast radius
    let blastRadius = null;
    if (paymentService) {
      blastRadius = this.blastRadiusService.analyze(paymentService.serviceId);
    }

    return {
      scenario: 'complete-incident',
      eventsProcessed: processed.length,
      deployment: deployment ? deployment.toJSON() : null,
      impactAnalysis,
      incidentsDetected: incidents.length,
      incidents: incidents.map((i) => i.toJSON()),
      blastRadius,
    };
  }

  /**
   * Ingest a list of raw event objects through TelemetryProcessingService.
   * @param {object[]} events
   * @returns {Promise<object[]>} Processed event results
   */
  async _ingestEvents(events) {
    const results = [];
    for (const eventData of events) {
      const result = await this.telemetryProcessingService.process(eventData);
      results.push(result);
    }
    return results;
  }
}

module.exports = {
  DemoSimulator,
  SCENARIOS,
  // Exported for deterministic testing
  buildNormalTrafficEvents,
  buildPaymentDeploymentEvents,
  buildPaymentLatencyEvents,
  buildPaymentFailureEvents,
  buildCompleteIncidentEvents,
};
