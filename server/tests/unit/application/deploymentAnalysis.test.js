const DeploymentAnalysisService = require('../../../src/application/DeploymentAnalysisService');
const DependencyGraphService = require('../../../src/application/DependencyGraphService');
const Service = require('../../../src/domain/entities/Service');
const Dependency = require('../../../src/domain/entities/Dependency');
const {
  FakeServiceRepository,
  FakeDependencyRepository,
  FakeDeploymentRepository,
} = require('../../helpers/fakes');

describe('DeploymentAnalysisService', () => {
  let analysisService, graphService, serviceRepo, depRepo, deploymentRepo;

  async function buildGraph(nodes, edges) {
    serviceRepo = new FakeServiceRepository();
    depRepo = new FakeDependencyRepository();
    deploymentRepo = new FakeDeploymentRepository();

    graphService = new DependencyGraphService({
      serviceRepository: serviceRepo,
      dependencyRepository: depRepo,
    });
    analysisService = new DeploymentAnalysisService({
      graphService,
      deploymentRepository: deploymentRepo,
      serviceRepository: serviceRepo,
    });

    const idMap = {};
    for (const name of nodes) {
      const svc = new Service({ name, version: '1.0.0' });
      await serviceRepo.save(svc);
      idMap[name] = svc.serviceId;
    }
    for (const [src, tgt] of edges) {
      await depRepo.save(new Dependency({
        sourceServiceId: idMap[src],
        targetServiceId: idMap[tgt],
        dependencyType: 'sync',
      }));
    }
    await graphService.build();
    return idMap;
  }

  describe('isolated service', () => {
    it('should report no affected services', async () => {
      const ids = await buildGraph(['A'], []);
      const result = await analysisService.analyze({
        serviceId: ids.A,
        newVersion: '2.0.0',
      });

      expect(result.directDependents).toEqual([]);
      expect(result.indirectDependents).toEqual([]);
      expect(result.totalPotentiallyAffected).toBe(0);
    });

    it('should persist the deployment record', async () => {
      const ids = await buildGraph(['A'], []);
      const result = await analysisService.analyze({
        serviceId: ids.A,
        newVersion: '2.0.0',
      });

      expect(result.deployment.newVersion).toBe('2.0.0');
      expect(deploymentRepo._store).toHaveLength(1);
    });
  });

  describe('direct dependents: A → B', () => {
    it('deploying B should show A as directly affected', async () => {
      const ids = await buildGraph(['A', 'B'], [['A', 'B']]);
      const result = await analysisService.analyze({
        serviceId: ids.B,
        newVersion: '2.0.0',
      });

      expect(result.directDependents).toContain(ids.A);
      expect(result.totalPotentiallyAffected).toBe(1);
    });
  });

  describe('transitive dependents: A → B → C', () => {
    it('deploying C should show B as direct and A as indirect', async () => {
      const ids = await buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
      const result = await analysisService.analyze({
        serviceId: ids.C,
        newVersion: '2.0.0',
      });

      expect(result.directDependents).toContain(ids.B);
      expect(result.indirectDependents).toContain(ids.A);
      expect(result.totalPotentiallyAffected).toBe(2);
    });
  });

  describe('branching: A → C, B → C', () => {
    it('deploying C should show both A and B', async () => {
      const ids = await buildGraph(['A', 'B', 'C'], [['A', 'C'], ['B', 'C']]);
      const result = await analysisService.analyze({
        serviceId: ids.C,
        newVersion: '2.0.0',
      });

      expect(result.directDependents).toContain(ids.A);
      expect(result.directDependents).toContain(ids.B);
      expect(result.totalPotentiallyAffected).toBe(2);
    });
  });

  describe('cyclic: A → B → C → A', () => {
    it('should complete without infinite loop', async () => {
      const ids = await buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]);
      const result = await analysisService.analyze({
        serviceId: ids.A,
        newVersion: '2.0.0',
      });

      expect(result.totalPotentiallyAffected).toBeGreaterThanOrEqual(2);
    });
  });

  describe('downstream dependencies', () => {
    it('should report downstream services (what the deployed service depends on)', async () => {
      const ids = await buildGraph(['A', 'B', 'C'], [['A', 'B'], ['A', 'C']]);
      const result = await analysisService.analyze({
        serviceId: ids.A,
        newVersion: '2.0.0',
      });

      expect(result.downstreamDependencies).toContain(ids.B);
      expect(result.downstreamDependencies).toContain(ids.C);
    });
  });

  describe('deterministic output', () => {
    it('should produce same result on repeated calls', async () => {
      const ids = await buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);

      const result1 = await analysisService.analyze({ serviceId: ids.C, newVersion: '2.0.0' });
      const result2 = await analysisService.analyze({ serviceId: ids.C, newVersion: '3.0.0' });

      expect(result1.directDependents).toEqual(result2.directDependents);
      expect(result1.indirectDependents).toEqual(result2.indirectDependents);
      expect(result1.totalPotentiallyAffected).toBe(result2.totalPotentiallyAffected);
    });
  });

  describe('affected paths', () => {
    it('should include paths from direct dependents to deployed service', async () => {
      const ids = await buildGraph(['A', 'B'], [['A', 'B']]);
      const result = await analysisService.analyze({
        serviceId: ids.B,
        newVersion: '2.0.0',
      });

      expect(result.affectedPaths).toHaveLength(1);
      expect(result.affectedPaths[0]).toEqual([ids.A, ids.B]);
    });
  });
});
