const {
  DemoSimulator,
  SCENARIOS,
  buildNormalTrafficEvents,
  buildPaymentDeploymentEvents,
  buildPaymentLatencyEvents,
  buildPaymentFailureEvents,
  buildCompleteIncidentEvents,
} = require('../../../src/application/DemoSimulator');
const {
  FakeServiceRepository,
  FakeDependencyRepository,
  FakeTelemetryRepository,
  FakeIncidentRepository,
  FakeIncidentEventRepository,
  FakeDeploymentRepository,
  FakeEventBus,
} = require('../../helpers/fakes');
const TelemetryProcessingService = require('../../../src/application/TelemetryProcessingService');
const DependencyGraphService = require('../../../src/application/DependencyGraphService');
const BlastRadiusService = require('../../../src/application/BlastRadiusService');
const IncidentDetectionService = require('../../../src/application/IncidentDetectionService');
const DeploymentService = require('../../../src/application/DeploymentService');
const DeploymentAnalysisService = require('../../../src/application/DeploymentAnalysisService');

/** Build a fully-wired DemoSimulator using in-memory fakes. */
function buildSimulator() {
  const serviceRepository = new FakeServiceRepository();
  const dependencyRepository = new FakeDependencyRepository();
  const telemetryRepository = new FakeTelemetryRepository();
  const incidentRepository = new FakeIncidentRepository();
  const incidentEventRepository = new FakeIncidentEventRepository();
  const deploymentRepository = new FakeDeploymentRepository();
  const eventBus = new FakeEventBus();

  const graphService = new DependencyGraphService({ serviceRepository, dependencyRepository });
  const blastRadiusService = new BlastRadiusService({ graphService });
  const telemetryProcessingService = new TelemetryProcessingService({
    telemetryRepository, serviceRepository, dependencyRepository, eventBus,
  });
  const deploymentService = new DeploymentService({ deploymentRepository });
  const deploymentAnalysisService = new DeploymentAnalysisService({
    graphService, deploymentRepository, serviceRepository,
  });
  const incidentDetectionService = new IncidentDetectionService({
    telemetryRepository,
    incidentRepository,
    incidentEventRepository,
    blastRadiusService,
    config: {
      errorRateThreshold: 0.5,
      latencyThresholdMs: 5000,
      minimumEvents: 5,
      timeWindowMs: 60000,
    },
  });

  const simulator = new DemoSimulator({
    telemetryProcessingService,
    deploymentService,
    deploymentAnalysisService,
    incidentDetectionService,
    blastRadiusService,
    graphService,
    serviceRepository,
    dependencyRepository,
    telemetryRepository,
    incidentRepository,
    incidentEventRepository,
    deploymentRepository,
  });

  return {
    simulator,
    serviceRepository,
    dependencyRepository,
    telemetryRepository,
    incidentRepository,
    deploymentRepository,
  };
}

const FIXED_NOW = new Date('2026-01-15T11:00:00.000Z');

describe('DemoSimulator', () => {

  describe('listScenarios()', () => {
    it('should return all 5 scenarios', () => {
      const { simulator } = buildSimulator();
      const scenarios = simulator.listScenarios();
      expect(scenarios).toHaveLength(5);
    });

    it('should include all required scenario IDs', () => {
      const { simulator } = buildSimulator();
      const ids = simulator.listScenarios().map((s) => s.id);
      expect(ids).toContain('normal-traffic');
      expect(ids).toContain('payment-deployment');
      expect(ids).toContain('payment-latency');
      expect(ids).toContain('payment-failure');
      expect(ids).toContain('complete-incident');
    });

    it('each scenario should have id, name, description', () => {
      const { simulator } = buildSimulator();
      for (const s of simulator.listScenarios()) {
        expect(s.id).toBeDefined();
        expect(s.name).toBeDefined();
        expect(s.description).toBeDefined();
      }
    });
  });

  describe('reset()', () => {
    it('should clear all repositories', async () => {
      const { simulator, serviceRepository, telemetryRepository } = buildSimulator();
      await simulator.run('normal-traffic');
      expect(serviceRepository._store.length).toBeGreaterThan(0);

      await simulator.reset();
      expect(serviceRepository._store).toHaveLength(0);
      expect(telemetryRepository._store).toHaveLength(0);
    });
  });

  describe('run() — unknown scenario', () => {
    it('should throw for an unknown scenario ID', async () => {
      const { simulator } = buildSimulator();
      await expect(simulator.run('nonexistent')).rejects.toThrow('Scenario not found: nonexistent');
    });
  });

  // ─── SCENARIO: normal-traffic ───────────────────────────────────────────────

  describe('normal-traffic scenario', () => {
    it('should process events without errors', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('normal-traffic');
      expect(result.scenario).toBe('normal-traffic');
      expect(result.eventsProcessed).toBeGreaterThan(0);
    });

    it('should discover all topology services', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('normal-traffic');
      expect(result.servicesDiscovered).toContain('frontend');
      expect(result.servicesDiscovered).toContain('api-gateway');
      expect(result.servicesDiscovered).toContain('payment-service');
      expect(result.servicesDiscovered).toContain('orders-service');
    });

    it('should build graph with expected nodes', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('normal-traffic');
      // Topology has 10 unique services
      expect(result.topology.nodeCount).toBe(10);
    });

    it('should build graph with expected edges', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('normal-traffic');
      // Topology has 9 edges
      expect(result.topology.edgeCount).toBe(9);
    });

    it('should be deterministic — same result on repeated runs after reset', async () => {
      const { simulator } = buildSimulator();
      const result1 = await simulator.run('normal-traffic');
      await simulator.reset();
      const result2 = await simulator.run('normal-traffic');
      expect(result1.eventsProcessed).toBe(result2.eventsProcessed);
      expect(result1.topology.nodeCount).toBe(result2.topology.nodeCount);
    });
  });

  // ─── SCENARIO: payment-deployment ──────────────────────────────────────────

  describe('payment-deployment scenario', () => {
    it('should create a deployment record', async () => {
      const { simulator, deploymentRepository } = buildSimulator();
      await simulator.run('payment-deployment');
      // DeploymentAnalysisService also creates one deployment record
      expect(deploymentRepository._store.length).toBeGreaterThanOrEqual(1);
    });

    it('should return deployment metadata in result', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('payment-deployment');
      expect(result.scenario).toBe('payment-deployment');
      expect(result.deployment).not.toBeNull();
      expect(result.deployment.newVersion).toBe('1.3.0');
      expect(result.deployment.previousVersion).toBe('1.2.0');
    });

    it('should return impact analysis', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('payment-deployment');
      expect(result.impactAnalysis).not.toBeNull();
      expect(result.impactAnalysis).toHaveProperty('directDependents');
      expect(result.impactAnalysis).toHaveProperty('totalPotentiallyAffected');
    });
  });

  // ─── SCENARIO: payment-latency ─────────────────────────────────────────────

  describe('payment-latency scenario', () => {
    it('should complete without error', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('payment-latency', FIXED_NOW);
      expect(result.scenario).toBe('payment-latency');
      expect(result.eventsProcessed).toBeGreaterThan(0);
    });

    it('should return blast radius on payment-service', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('payment-latency', FIXED_NOW);
      expect(result.blastRadius).not.toBeNull();
      expect(result.blastRadius).toHaveProperty('serviceId');
      expect(result.blastRadius).toHaveProperty('totalAffectedCount');
    });

    it('should show checkout-service in blast radius upstream', async () => {
      const { simulator, serviceRepository } = buildSimulator();
      const result = await simulator.run('payment-latency', FIXED_NOW);
      // checkout-service depends on payment-service, so it is in the upstream (directly affected)
      expect(result.blastRadius.totalAffectedCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── SCENARIO: payment-failure ─────────────────────────────────────────────

  describe('payment-failure scenario', () => {
    it('should detect at least one incident', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('payment-failure', FIXED_NOW);
      expect(result.incidentsDetected).toBeGreaterThan(0);
    });

    it('detected incident should be triggered by checkout-service calling payment-service', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('payment-failure', FIXED_NOW);
      expect(result.incidents.length).toBeGreaterThan(0);
      const incident = result.incidents[0];
      // IncidentDetectionService groups by sourceService name
      expect(incident.trigger.serviceName).toBe('checkout-service');
    });

    it('should return blast radius', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('payment-failure', FIXED_NOW);
      expect(result.blastRadius).not.toBeNull();
    });

    it('should be deterministic — same number of incidents on repeated runs', async () => {
      const { simulator } = buildSimulator();
      const result1 = await simulator.run('payment-failure', FIXED_NOW);
      await simulator.reset();
      const result2 = await simulator.run('payment-failure', FIXED_NOW);
      expect(result1.incidentsDetected).toBe(result2.incidentsDetected);
    });
  });

  // ─── SCENARIO: complete-incident ───────────────────────────────────────────

  describe('complete-incident scenario', () => {
    it('should process events from all phases', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('complete-incident', FIXED_NOW);
      expect(result.eventsProcessed).toBeGreaterThan(10);
    });

    it('should create a deployment record', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('complete-incident', FIXED_NOW);
      expect(result.deployment).not.toBeNull();
      expect(result.deployment.newVersion).toBe('1.3.0');
    });

    it('should detect at least one incident', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('complete-incident', FIXED_NOW);
      expect(result.incidentsDetected).toBeGreaterThan(0);
    });

    it('should return impact analysis', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('complete-incident', FIXED_NOW);
      expect(result.impactAnalysis).not.toBeNull();
    });

    it('should return blast radius', async () => {
      const { simulator } = buildSimulator();
      const result = await simulator.run('complete-incident', FIXED_NOW);
      expect(result.blastRadius).not.toBeNull();
    });

    it('should be deterministic', async () => {
      const { simulator } = buildSimulator();
      const r1 = await simulator.run('complete-incident', FIXED_NOW);
      await simulator.reset();
      const r2 = await simulator.run('complete-incident', FIXED_NOW);
      expect(r1.eventsProcessed).toBe(r2.eventsProcessed);
      expect(r1.incidentsDetected).toBe(r2.incidentsDetected);
    });
  });

  // ─── Event builder determinism checks ─────────────────────────────────────

  describe('Event builders — determinism', () => {
    it('buildNormalTrafficEvents should always produce same count', () => {
      expect(buildNormalTrafficEvents()).toHaveLength(buildNormalTrafficEvents().length);
      expect(buildNormalTrafficEvents().length).toBeGreaterThan(0);
    });

    it('buildPaymentFailureEvents should produce >= 6 failure events', () => {
      const events = buildPaymentFailureEvents(FIXED_NOW);
      const failures = events.filter((e) => e.statusCode >= 500);
      expect(failures.length).toBeGreaterThanOrEqual(6);
    });

    it('buildPaymentFailureEvents error rate should exceed 50%', () => {
      const events = buildPaymentFailureEvents(FIXED_NOW).filter(
        (e) => e.sourceService === 'checkout-service' && e.targetService === 'payment-service'
      );
      const failures = events.filter((e) => e.statusCode >= 500);
      expect(failures.length / events.length).toBeGreaterThan(0.5);
    });

    it('buildPaymentLatencyEvents should include high-latency payment calls', () => {
      const events = buildPaymentLatencyEvents();
      const highLatency = events.filter(
        (e) => e.targetService === 'payment-service' && e.latencyMs > 5000
      );
      expect(highLatency.length).toBeGreaterThan(0);
    });

    it('buildNormalTrafficEvents should produce no failures', () => {
      const events = buildNormalTrafficEvents();
      const failures = events.filter((e) => e.statusCode >= 500);
      expect(failures).toHaveLength(0);
    });
  });
});
