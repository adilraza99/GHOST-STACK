const TelemetryProcessingService = require('../../../src/application/TelemetryProcessingService');
const { FakeServiceRepository, FakeDependencyRepository, FakeTelemetryRepository, FakeEventBus } = require('../../helpers/fakes');

describe('TelemetryProcessingService', () => {
  let service, telemetryRepo, serviceRepo, dependencyRepo, eventBus;

  beforeEach(() => {
    telemetryRepo = new FakeTelemetryRepository();
    serviceRepo = new FakeServiceRepository();
    dependencyRepo = new FakeDependencyRepository();
    eventBus = new FakeEventBus();
    service = new TelemetryProcessingService({
      telemetryRepository: telemetryRepo,
      serviceRepository: serviceRepo,
      dependencyRepository: dependencyRepo,
      eventBus,
    });
  });

  const validEvent = {
    sourceService: 'checkout',
    timestamp: new Date('2026-01-15T12:00:00Z'),
    targetService: 'payment',
    statusCode: 200,
    latencyMs: 50,
    method: 'POST',
    endpoint: '/api/charge',
  };

  describe('telemetry persistence', () => {
    it('should save the telemetry event', async () => {
      const result = await service.process(validEvent);
      expect(result.event.sourceService).toBe('checkout');
      expect(telemetryRepo._store).toHaveLength(1);
    });
  });

  describe('service upsert', () => {
    it('should create source service', async () => {
      const result = await service.process(validEvent);
      expect(result.sourceService.name).toBe('checkout');
      expect(serviceRepo._store).toHaveLength(2); // checkout + payment
    });

    it('should create target service when present', async () => {
      const result = await service.process(validEvent);
      expect(result.targetService.name).toBe('payment');
    });

    it('should NOT create target service when absent', async () => {
      const { targetService, ...noTarget } = validEvent;
      const result = await service.process(noTarget);
      expect(result.targetService).toBeNull();
      expect(serviceRepo._store).toHaveLength(1); // only source
    });

    it('should not duplicate services on repeated events', async () => {
      await service.process(validEvent);
      await service.process(validEvent);
      // upsert should reuse existing services
      expect(serviceRepo._store).toHaveLength(2); // still just checkout + payment
    });
  });

  describe('dependency creation', () => {
    it('should create dependency when source and target exist', async () => {
      const result = await service.process(validEvent);
      expect(result.dependency).not.toBeNull();
      expect(result.dependency.requestCount).toBe(1);
    });

    it('should NOT create dependency without target service', async () => {
      const { targetService, ...noTarget } = validEvent;
      const result = await service.process(noTarget);
      expect(result.dependency).toBeNull();
      expect(dependencyRepo._store).toHaveLength(0);
    });

    it('should increment requestCount on repeated events', async () => {
      await service.process(validEvent);
      const result = await service.process(validEvent);
      expect(result.dependency.requestCount).toBe(2);
    });
  });

  describe('failure counting', () => {
    it('should NOT count 200 as failure', async () => {
      const result = await service.process({ ...validEvent, statusCode: 200 });
      expect(result.dependency.failureCount).toBe(0);
    });

    it('should NOT count 404 as failure (client error)', async () => {
      const result = await service.process({ ...validEvent, statusCode: 404 });
      expect(result.dependency.failureCount).toBe(0);
    });

    it('should count 500 as failure', async () => {
      const result = await service.process({ ...validEvent, statusCode: 500 });
      expect(result.dependency.failureCount).toBe(1);
    });

    it('should count 503 as failure', async () => {
      const result = await service.process({ ...validEvent, statusCode: 503 });
      expect(result.dependency.failureCount).toBe(1);
    });

    it('should NOT count missing statusCode as failure', async () => {
      const { statusCode, ...noStatus } = validEvent;
      const result = await service.process(noStatus);
      expect(result.dependency.failureCount).toBe(0);
    });
  });

  describe('event publication', () => {
    it('should publish telemetry.processed event', async () => {
      await service.process(validEvent);
      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].type).toBe('telemetry.processed');
      expect(eventBus.published[0].payload.sourceServiceId).toBeDefined();
    });
  });
});
