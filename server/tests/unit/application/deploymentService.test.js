const DeploymentService = require('../../../src/application/DeploymentService');
const { FakeDeploymentRepository } = require('../../helpers/fakes');

describe('DeploymentService', () => {
  let service, deploymentRepo;

  beforeEach(() => {
    deploymentRepo = new FakeDeploymentRepository();
    service = new DeploymentService({ deploymentRepository: deploymentRepo });
  });

  it('should create and persist a deployment', async () => {
    const result = await service.create({
      serviceId: 'svc-1',
      previousVersion: '1.0.0',
      newVersion: '2.0.0',
    });

    expect(result.serviceId).toBe('svc-1');
    expect(result.previousVersion).toBe('1.0.0');
    expect(result.newVersion).toBe('2.0.0');
    expect(result.deploymentId).toBeDefined();
    expect(deploymentRepo._store).toHaveLength(1);
  });

  it('should call repository.save()', async () => {
    await service.create({
      serviceId: 'svc-2',
      previousVersion: '1.0.0',
      newVersion: '1.1.0',
    });

    expect(deploymentRepo._store).toHaveLength(1);
    expect(deploymentRepo._store[0].serviceId).toBe('svc-2');
  });

  it('should accept optional metadata', async () => {
    const result = await service.create({
      serviceId: 'svc-3',
      previousVersion: '1.0.0',
      newVersion: '2.0.0',
      metadata: { triggeredBy: 'ci' },
    });

    expect(result.metadata).toEqual({ triggeredBy: 'ci' });
  });
});
