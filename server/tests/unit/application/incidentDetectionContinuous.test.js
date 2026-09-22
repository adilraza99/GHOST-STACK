const IncidentDetectionService = require('../../../src/application/IncidentDetectionService');
const IncidentDetectionPolicy = require('../../../src/domain/entities/IncidentDetectionPolicy');
const TelemetryEvent = require('../../../src/domain/entities/TelemetryEvent');
const {
  FakeTelemetryRepository,
  FakeIncidentRepository,
  FakeIncidentEventRepository,
  FakeServiceRepository,
  FakeDependencyRepository,
} = require('../../helpers/fakes');

describe('IncidentDetectionService - Continuous Detection & Intelligence', () => {
  let detector;
  let telemetryRepo;
  let incidentRepo;
  let incidentEventRepo;
  let policy;

  const BASE_TIME = new Date('2026-03-01T10:00:00Z');

  beforeEach(() => {
    telemetryRepo = new FakeTelemetryRepository();
    incidentRepo = new FakeIncidentRepository();
    incidentEventRepo = new FakeIncidentEventRepository();

    policy = new IncidentDetectionPolicy({
      timeWindowMs: 60000, // 1 minute
      minimumEvents: 5,
      errorRateThreshold: 0.5,
      latencyThresholdMs: 5000,
      recoveryErrorRateThreshold: 0.1,
      recoveryLatencyThresholdMs: 2000,
      recoveryObservationWindowMs: 30000, // 30 seconds
      minimumRecoveryEvents: 3,
    });

    detector = new IncidentDetectionService({
      telemetryRepository: telemetryRepo,
      incidentRepository: incidentRepo,
      incidentEventRepository: incidentEventRepo,
      blastRadiusService: null,
      policy,
    });
  });

  function makeTelemetry(overrides = {}) {
    return new TelemetryEvent({
      eventId: `te-${Math.random().toString(36).substring(2, 9)}`,
      projectId: 'proj-prod',
      environment: 'production',
      sourceService: 'payment-service',
      timestamp: BASE_TIME,
      statusCode: 200,
      latencyMs: 150,
      ...overrides,
    });
  }

  describe('Sample size gating', () => {
    it('should not detect incident with fewer than minimumEvents', async () => {
      // 4 errors (threshold requires 5 events minimum)
      for (let i = 0; i < 4; i++) {
        const te = makeTelemetry({
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(te);
        const result = await detector.processTelemetryEvent({ event: te.toJSON() });
        expect(result.action).toBe('none');
      }

      const active = await incidentRepo.findActiveByService('proj-prod', 'production', 'payment-service');
      expect(active).toBeNull();
    });
  });

  describe('Anomaly detection and incident creation', () => {
    it('should trigger incident creation on 5th event when error rate exceeds threshold', async () => {
      let lastResult;
      // 4 failures
      for (let i = 0; i < 4; i++) {
        const te = makeTelemetry({
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(te);
        await detector.processTelemetryEvent({ event: te.toJSON() });
      }

      // 5th failure
      const te5 = makeTelemetry({
        statusCode: 500,
        timestamp: new Date(BASE_TIME.getTime() + 4000),
      });
      await telemetryRepo.save(te5);
      lastResult = await detector.processTelemetryEvent({ event: te5.toJSON() });

      expect(lastResult.action).toBe('created');
      expect(lastResult.incident).toBeDefined();
      expect(lastResult.incident.status).toBe('detected');
      expect(lastResult.incident.projectId).toBe('proj-prod');
      expect(lastResult.incident.environment).toBe('production');
      expect(lastResult.incident.trigger.serviceName).toBe('payment-service');
      expect(lastResult.incident.trigger.triggers).toContain('error_rate');
    });
  });

  describe('Continuous deduplication', () => {
    it('should update active incident and NOT create duplicate incidents on ongoing anomalies', async () => {
      // Trigger initial incident with 5 failures
      for (let i = 0; i < 5; i++) {
        const te = makeTelemetry({
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(te);
        await detector.processTelemetryEvent({ event: te.toJSON() });
      }

      const initialIncidents = await incidentRepo.findAll();
      expect(initialIncidents).toHaveLength(1);
      const incidentId = initialIncidents[0].incidentId;

      // Ingest 5 MORE failures
      for (let i = 5; i < 10; i++) {
        const te = makeTelemetry({
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(te);
        const res = await detector.processTelemetryEvent({ event: te.toJSON() });
        expect(res.action).toBe('updated');
        expect(res.incident.incidentId).toBe(incidentId);
      }

      // Verify still only 1 incident exists
      const totalIncidents = await incidentRepo.findAll();
      expect(totalIncidents).toHaveLength(1);
      expect(totalIncidents[0].incidentId).toBe(incidentId);
      expect(totalIncidents[0].trigger.eventCount).toBe(10);
    });
  });

  describe('Telemetry idempotency', () => {
    it('should not add duplicate timeline events if identical telemetry is redelivered', async () => {
      // 5 failures to trigger incident
      for (let i = 0; i < 5; i++) {
        const te = makeTelemetry({
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(te);
        await detector.processTelemetryEvent({ event: te.toJSON() });
      }

      const incident = (await incidentRepo.findAll())[0];
      const initialTimelineCount = incident.events.length;

      // Deliver duplicate telemetry event with specific eventId
      const redeliveredTe = makeTelemetry({
        eventId: 'duplicate-test-event-1',
        statusCode: 500,
        timestamp: new Date(BASE_TIME.getTime() + 6000),
      });
      await telemetryRepo.save(redeliveredTe);
      await detector.processTelemetryEvent({ event: redeliveredTe.toJSON() });

      const updatedIncident = await incidentRepo.findById(incident.incidentId);
      expect(updatedIncident.events.length).toBe(initialTimelineCount + 1);

      // Redeliver exact same eventId
      await detector.processTelemetryEvent({ event: redeliveredTe.toJSON() });

      const afterSecondDelivery = await incidentRepo.findById(incident.incidentId);
      // Timeline count should not have increased
      expect(afterSecondDelivery.events.length).toBe(initialTimelineCount + 1);
    });
  });

  describe('Automatic resolution', () => {
    it('should auto-resolve incident when metrics recover over observation window', async () => {
      // Trigger incident with 5 failures
      for (let i = 0; i < 5; i++) {
        const te = makeTelemetry({
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(te);
        await detector.processTelemetryEvent({ event: te.toJSON() });
      }

      const incident = (await incidentRepo.findAll())[0];
      expect(incident.status).toBe('detected');

      // Now simulate recovery: 35 seconds later, healthy traffic arrives
      const recoveryBase = new Date(BASE_TIME.getTime() + 40000);
      let resolveResult;

      // Send 3 healthy events within the 30s recovery observation window
      for (let i = 0; i < 3; i++) {
        const healthyTe = makeTelemetry({
          statusCode: 200,
          latencyMs: 120,
          timestamp: new Date(recoveryBase.getTime() + i * 1000),
        });
        await telemetryRepo.save(healthyTe);
        resolveResult = await detector.processTelemetryEvent({ event: healthyTe.toJSON() });
      }

      expect(resolveResult.action).toBe('resolved');
      expect(resolveResult.incident.status).toBe('resolved');
      expect(resolveResult.incident.endedAt).toBeDefined();

      const active = await incidentRepo.findActiveByService('proj-prod', 'production', 'payment-service');
      expect(active).toBeNull();
    });

    it('should NOT auto-resolve if sample size in recovery window is below minimumRecoveryEvents', async () => {
      // Trigger incident
      for (let i = 0; i < 5; i++) {
        const te = makeTelemetry({
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(te);
        await detector.processTelemetryEvent({ event: te.toJSON() });
      }

      // 40s later, only 2 healthy events (minimumRecoveryEvents = 3)
      const recoveryBase = new Date(BASE_TIME.getTime() + 40000);
      for (let i = 0; i < 2; i++) {
        const healthyTe = makeTelemetry({
          statusCode: 200,
          latencyMs: 120,
          timestamp: new Date(recoveryBase.getTime() + i * 1000),
        });
        await telemetryRepo.save(healthyTe);
        const res = await detector.processTelemetryEvent({ event: healthyTe.toJSON() });
        expect(res.action).toBe('updated');
      }

      const incident = (await incidentRepo.findAll())[0];
      expect(incident.status).not.toBe('resolved');
    });
  });

  describe('Reopening protection', () => {
    it('should NEVER reopen a resolved incident, and must create a new incident for subsequent anomalies', async () => {
      // 1. Trigger incident
      for (let i = 0; i < 5; i++) {
        const te = makeTelemetry({
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(te);
        await detector.processTelemetryEvent({ event: te.toJSON() });
      }

      const firstIncident = (await incidentRepo.findAll())[0];
      const firstIncidentId = firstIncident.incidentId;

      // 2. Recover incident
      const recoveryBase = new Date(BASE_TIME.getTime() + 40000);
      for (let i = 0; i < 3; i++) {
        const healthyTe = makeTelemetry({
          statusCode: 200,
          latencyMs: 120,
          timestamp: new Date(recoveryBase.getTime() + i * 1000),
        });
        await telemetryRepo.save(healthyTe);
        await detector.processTelemetryEvent({ event: healthyTe.toJSON() });
      }

      const verifiedResolved = await incidentRepo.findById(firstIncidentId);
      expect(verifiedResolved.status).toBe('resolved');

      // 3. Much later (e.g. 5 minutes later), a brand new anomaly occurs
      const newAnomalyBase = new Date(BASE_TIME.getTime() + 300000);
      for (let i = 0; i < 5; i++) {
        const newErrorTe = makeTelemetry({
          statusCode: 503,
          timestamp: new Date(newAnomalyBase.getTime() + i * 1000),
        });
        await telemetryRepo.save(newErrorTe);
        await detector.processTelemetryEvent({ event: newErrorTe.toJSON() });
      }

      // Check incidents
      const allIncidents = await incidentRepo.findAll();
      expect(allIncidents).toHaveLength(2);

      const oldIncident = await incidentRepo.findById(firstIncidentId);
      expect(oldIncident.status).toBe('resolved');

      const newIncident = allIncidents.find((i) => i.incidentId !== firstIncidentId);
      expect(newIncident).toBeDefined();
      expect(newIncident.status).toBe('detected');
      expect(newIncident.incidentId).not.toBe(firstIncidentId);
    });
  });

  describe('Multi-tenant and environment isolation', () => {
    it('should isolate incidents across different projects', async () => {
      // 5 errors in project-alpha
      for (let i = 0; i < 5; i++) {
        const teA = makeTelemetry({
          projectId: 'project-alpha',
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(teA);
        await detector.processTelemetryEvent({ event: teA.toJSON() });
      }

      const alphaIncident = await incidentRepo.findActiveByService('project-alpha', 'production', 'payment-service');
      const betaIncident = await incidentRepo.findActiveByService('project-beta', 'production', 'payment-service');

      expect(alphaIncident).not.toBeNull();
      expect(alphaIncident.projectId).toBe('project-alpha');
      expect(betaIncident).toBeNull();
    });

    it('should isolate incidents across staging and production in the same project', async () => {
      // 5 errors in staging
      for (let i = 0; i < 5; i++) {
        const teStaging = makeTelemetry({
          projectId: 'project-alpha',
          environment: 'staging',
          statusCode: 500,
          timestamp: new Date(BASE_TIME.getTime() + i * 1000),
        });
        await telemetryRepo.save(teStaging);
        await detector.processTelemetryEvent({ event: teStaging.toJSON() });
      }

      const stagingIncident = await incidentRepo.findActiveByService('project-alpha', 'staging', 'payment-service');
      const prodIncident = await incidentRepo.findActiveByService('project-alpha', 'production', 'payment-service');

      expect(stagingIncident).not.toBeNull();
      expect(stagingIncident.environment).toBe('staging');
      expect(prodIncident).toBeNull();
    });
  });
});
