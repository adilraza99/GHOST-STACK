const DeploymentService = require('../../../src/application/DeploymentService');
const Project = require('../../../src/domain/entities/Project');
const { FakeDeploymentRepository, FakeProjectRepository } = require('../../helpers/fakes');
const { InvalidStateError, EntityNotFoundError } = require('../../../src/domain/errors');

describe('DeploymentService', () => {
  let service, deploymentRepo, projectRepo;

  beforeEach(() => {
    deploymentRepo = new FakeDeploymentRepository();
    projectRepo = new FakeProjectRepository();
    service = new DeploymentService({
      deploymentRepository: deploymentRepo,
      projectRepository: projectRepo,
    });
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
    expect(result.projectId).toBe('project-default');
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

  it('should allow initial deployment with previousVersion null', async () => {
    const result = await service.create({
      serviceId: 'svc-initial',
      previousVersion: null,
      newVersion: '1.0.0',
    });

    expect(result.previousVersion).toBeNull();
    expect(result.newVersion).toBe('1.0.0');
  });

  it('should associate deployment with specified project', async () => {
    const project = new Project({
      projectId: 'proj-alpha',
      name: 'Alpha Project',
      slug: 'alpha-project',
      status: 'active',
    });
    await projectRepo.save(project);

    const result = await service.create({
      projectId: 'proj-alpha',
      serviceId: 'svc-auth',
      previousVersion: '1.0.0',
      newVersion: '1.1.0',
    });

    expect(result.projectId).toBe('proj-alpha');
  });

  it('should throw EntityNotFoundError when project does not exist', async () => {
    await expect(service.create({
      projectId: 'proj-nonexistent',
      serviceId: 'svc-auth',
      previousVersion: '1.0.0',
      newVersion: '1.1.0',
    })).rejects.toThrow(EntityNotFoundError);
  });

  it('should throw InvalidStateError when project is archived', async () => {
    const project = new Project({
      projectId: 'proj-archived',
      name: 'Archived Project',
      slug: 'archived-project',
      status: 'archived',
    });
    await projectRepo.save(project);

    await expect(service.create({
      projectId: 'proj-archived',
      serviceId: 'svc-auth',
      previousVersion: '1.0.0',
      newVersion: '1.1.0',
    })).rejects.toThrow(InvalidStateError);
  });

  it('should get deployment scoped to project', async () => {
    await projectRepo.save(new Project({
      projectId: 'proj-find',
      name: 'Find Project',
      slug: 'find-project',
      status: 'active',
    }));

    const dep = await service.create({
      projectId: 'proj-find',
      serviceId: 'svc-find',
      previousVersion: '1.0.0',
      newVersion: '1.1.0',
    });

    const found = await service.getDeployment('proj-find', dep.deploymentId);
    expect(found).not.toBeNull();
    expect(found.deploymentId).toBe(dep.deploymentId);

    // Mismatched project throws EntityNotFoundError
    await expect(service.getDeployment('proj-other', dep.deploymentId)).rejects.toThrow(EntityNotFoundError);
  });

  it('should list deployments for project with filters', async () => {
    await projectRepo.save(new Project({
      projectId: 'proj-list',
      name: 'List Project',
      slug: 'list-project',
      status: 'active',
    }));
    await projectRepo.save(new Project({
      projectId: 'proj-other',
      name: 'Other Project',
      slug: 'other-project',
      status: 'active',
    }));

    await service.create({
      projectId: 'proj-list',
      serviceId: 'svc-payment',
      environment: 'production',
      previousVersion: '1.0.0',
      newVersion: '1.1.0',
    });
    await service.create({
      projectId: 'proj-list',
      serviceId: 'svc-order',
      environment: 'staging',
      previousVersion: '1.0.0',
      newVersion: '1.0.1',
    });
    await service.create({
      projectId: 'proj-other',
      serviceId: 'svc-payment',
      environment: 'production',
      previousVersion: '2.0.0',
      newVersion: '2.1.0',
    });

    const allProjList = await service.listDeployments('proj-list');
    expect(allProjList).toHaveLength(2);

    const filtered = await service.listDeployments('proj-list', { environment: 'production' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].serviceId).toBe('svc-payment');
  });
});
