const TelemetryProcessingService = require('../../../src/application/TelemetryProcessingService');
const {
  FakeServiceRepository,
  FakeDependencyRepository,
  FakeTelemetryRepository,
  FakeEventBus,
} = require('../../helpers/fakes');

describe('TelemetryProcessingService - Project Isolation Unit Tests', () => {
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

  it('should isolate identically named services under different projectIds', async () => {
    // Project A: payment-service
    const resultA = await service.process({
      projectId: 'proj_alpha',
      sourceService: 'checkout-service',
      targetService: 'payment-service',
      statusCode: 200,
      timestamp: new Date('2026-01-15T12:00:00Z'),
    });

    // Project B: payment-service
    const resultB = await service.process({
      projectId: 'proj_beta',
      sourceService: 'checkout-service',
      targetService: 'payment-service',
      statusCode: 200,
      timestamp: new Date('2026-01-15T12:01:00Z'),
    });

    expect(resultA.targetService.projectId).toBe('proj_alpha');
    expect(resultB.targetService.projectId).toBe('proj_beta');

    // Distinct service IDs
    expect(resultA.targetService.serviceId).not.toBe(resultB.targetService.serviceId);
    expect(resultA.sourceService.serviceId).not.toBe(resultB.sourceService.serviceId);

    // Repositories should contain 4 services total (2 per project)
    expect(serviceRepo._store).toHaveLength(4);

    const alphaServices = await serviceRepo.findAll({ projectId: 'proj_alpha' });
    const betaServices = await serviceRepo.findAll({ projectId: 'proj_beta' });

    expect(alphaServices).toHaveLength(2);
    expect(betaServices).toHaveLength(2);
  });

  it('should isolate dependencies under different projectIds', async () => {
    const resA = await service.process({
      projectId: 'proj_alpha',
      sourceService: 'api-gateway',
      targetService: 'auth-service',
      statusCode: 200,
      timestamp: new Date('2026-01-15T12:00:00Z'),
    });

    const resB = await service.process({
      projectId: 'proj_beta',
      sourceService: 'api-gateway',
      targetService: 'auth-service',
      statusCode: 200,
      timestamp: new Date('2026-01-15T12:00:00Z'),
    });

    expect(resA.dependency.projectId).toBe('proj_alpha');
    expect(resB.dependency.projectId).toBe('proj_beta');
    expect(resA.dependency.dependencyId).not.toBe(resB.dependency.dependencyId);

    expect(dependencyRepo._store).toHaveLength(2);
  });

  it('should publish telemetry.processed event with projectId', async () => {
    await service.process({
      projectId: 'proj_gamma',
      sourceService: 'inventory',
      statusCode: 200,
      timestamp: new Date('2026-01-15T12:00:00Z'),
    });

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].type).toBe('telemetry.processed');
    expect(eventBus.published[0].payload.projectId).toBe('proj_gamma');
  });
});
