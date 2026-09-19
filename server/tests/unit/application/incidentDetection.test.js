const IncidentDetectionService = require('../../../src/application/IncidentDetectionService');
const BlastRadiusService = require('../../../src/application/BlastRadiusService');
const DependencyGraphService = require('../../../src/application/DependencyGraphService');
const TelemetryEvent = require('../../../src/domain/entities/TelemetryEvent');
const {
  FakeTelemetryRepository,
  FakeIncidentRepository,
  FakeIncidentEventRepository,
  FakeServiceRepository,
  FakeDependencyRepository,
} = require('../../helpers/fakes');

describe('IncidentDetectionService', () => {
  let detector, telemetryRepo, incidentRepo, incidentEventRepo;
  let blastService, graphService;

  const defaultConfig = {
    errorRateThreshold: 0.5,
    latencyThresholdMs: 5000,
    minimumEvents: 5,
    timeWindowMs: 60000,
  };

  const NOW = new Date('2026-01-15T12:01:00Z');

  function makeEvent(overrides = {}) {
    return new TelemetryEvent({
      sourceService: 'payment',
      timestamp: new Date(NOW.getTime() - 10000), // 10s ago, within window
      statusCode: 200,
      latencyMs: 100,
      ...overrides,
    });
  }

  beforeEach(() => {
    telemetryRepo = new FakeTelemetryRepository();
    incidentRepo = new FakeIncidentRepository();
    incidentEventRepo = new FakeIncidentEventRepository();

    const serviceRepo = new FakeServiceRepository();
    const depRepo = new FakeDependencyRepository();
    graphService = new DependencyGraphService({
      serviceRepository: serviceRepo,
      dependencyRepository: depRepo,
    });
    blastService = new BlastRadiusService({ graphService });

    detector = new IncidentDetectionService({
      telemetryRepository: telemetryRepo,
      incidentRepository: incidentRepo,
      incidentEventRepository: incidentEventRepo,
      blastRadiusService: blastService,
      config: defaultConfig,
    });
  });

  describe('below minimum events', () => {
    it('should not detect incident with fewer than minimumEvents', async () => {
      // Only 3 events (below minimum of 5)
      for (let i = 0; i < 3; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 500 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(0);
    });
  });

  describe('no incident case', () => {
    it('should not detect incident when all events are healthy', async () => {
      for (let i = 0; i < 10; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 200, latencyMs: 100 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(0);
    });
  });

  describe('error threshold exceeded', () => {
    it('should detect incident when error rate exceeds threshold', async () => {
      // 6 events: 4 errors (500) + 2 success = 66% error rate > 50% threshold
      for (let i = 0; i < 4; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 500 }));
      }
      for (let i = 0; i < 2; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 200 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(1);
      expect(incidents[0].trigger.triggers).toContain('error_rate');
    });
  });

  describe('latency threshold exceeded', () => {
    it('should detect incident when avg latency exceeds threshold', async () => {
      // 6 events with high latency (avg 6000ms > 5000ms threshold)
      for (let i = 0; i < 6; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 200, latencyMs: 6000 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(1);
      expect(incidents[0].trigger.triggers).toContain('latency');
    });
  });

  describe('both thresholds exceeded', () => {
    it('should include both triggers', async () => {
      for (let i = 0; i < 5; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 500, latencyMs: 8000 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(1);
      expect(incidents[0].trigger.triggers).toContain('error_rate');
      expect(incidents[0].trigger.triggers).toContain('latency');
    });
  });

  describe('exactly-at-threshold behavior', () => {
    it('should NOT trigger at exactly the threshold (must exceed)', async () => {
      // Exactly 50% error rate = threshold, not exceeded
      for (let i = 0; i < 3; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 500 }));
      }
      for (let i = 0; i < 3; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 200 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(0);
    });
  });

  describe('outside time window', () => {
    it('should not detect events outside the time window', async () => {
      // Events from 2 minutes ago (outside 60s window)
      for (let i = 0; i < 6; i++) {
        await telemetryRepo.save(makeEvent({
          statusCode: 500,
          timestamp: new Date(NOW.getTime() - 120000),
        }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(0);
    });
  });

  describe('incident timeline ordering', () => {
    it('should create IncidentEvents in chronological order', async () => {
      const timestamps = [
        new Date(NOW.getTime() - 5000),
        new Date(NOW.getTime() - 3000),
        new Date(NOW.getTime() - 1000),
      ];

      for (let i = 0; i < 3; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 500, timestamp: timestamps[i] }));
      }
      // Add 3 more to meet minimum
      for (let i = 0; i < 3; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 500 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(1);

      // Check incident events were created
      const events = incidentEventRepo._store;
      expect(events.length).toBeGreaterThan(0);

      // Verify chronological order
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp.getTime()).toBeGreaterThanOrEqual(events[i - 1].timestamp.getTime());
      }
    });
  });

  describe('4xx exclusion', () => {
    it('should NOT count 4xx as errors in error rate', async () => {
      // 6 events: 2 x 500, 4 x 404 → errorRate = 2/6 = 33% (below 50%)
      for (let i = 0; i < 2; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 500 }));
      }
      for (let i = 0; i < 4; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 404 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents).toHaveLength(0);
    });
  });

  describe('severity calculation', () => {
    it('should be critical when both triggers and error rate > 0.8', async () => {
      for (let i = 0; i < 5; i++) {
        await telemetryRepo.save(makeEvent({ statusCode: 500, latencyMs: 8000 }));
      }

      const incidents = await detector.detect({ now: NOW });
      expect(incidents[0].severity).toBe('critical');
    });
  });
});
