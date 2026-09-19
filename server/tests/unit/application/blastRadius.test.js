const BlastRadiusService = require('../../../src/application/BlastRadiusService');
const DependencyGraphService = require('../../../src/application/DependencyGraphService');
const { FakeServiceRepository, FakeDependencyRepository } = require('../../helpers/fakes');
const Service = require('../../../src/domain/entities/Service');
const Dependency = require('../../../src/domain/entities/Dependency');

describe('BlastRadiusService', () => {
  let blastService, graphService, serviceRepo, depRepo;

  async function buildGraph(nodes, edges) {
    serviceRepo = new FakeServiceRepository();
    depRepo = new FakeDependencyRepository();
    graphService = new DependencyGraphService({
      serviceRepository: serviceRepo,
      dependencyRepository: depRepo,
    });
    blastService = new BlastRadiusService({ graphService });

    const idMap = {};
    for (const name of nodes) {
      const svc = new Service({ name });
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

  describe('isolated service (no dependencies)', () => {
    it('should return empty blast radius', async () => {
      const ids = await buildGraph(['A'], []);
      const result = blastService.analyze(ids.A);

      expect(result.directlyAffected).toEqual([]);
      expect(result.indirectlyAffected).toEqual([]);
      expect(result.totalAffectedCount).toBe(0);
    });
  });

  describe('direct dependency: A → B', () => {
    it('failure in B should show A as directly affected', async () => {
      const ids = await buildGraph(['A', 'B'], [['A', 'B']]);
      const result = blastService.analyze(ids.B);

      expect(result.directlyAffected).toContain(ids.A);
      expect(result.totalAffectedCount).toBe(1);
    });
  });

  describe('multi-hop: A → B → C', () => {
    it('failure in C should show B as direct and A as indirect', async () => {
      const ids = await buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
      const result = blastService.analyze(ids.C);

      expect(result.directlyAffected).toContain(ids.B);
      expect(result.indirectlyAffected).toContain(ids.A);
      expect(result.totalAffectedCount).toBe(2);
    });
  });

  describe('branching: A → C, B → C', () => {
    it('failure in C should affect both A and B', async () => {
      const ids = await buildGraph(['A', 'B', 'C'], [['A', 'C'], ['B', 'C']]);
      const result = blastService.analyze(ids.C);

      expect(result.directlyAffected).toContain(ids.A);
      expect(result.directlyAffected).toContain(ids.B);
      expect(result.totalAffectedCount).toBe(2);
    });
  });

  describe('cyclic: A → B → C → A', () => {
    it('should not infinite loop and should report all nodes', async () => {
      const ids = await buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]);
      const result = blastService.analyze(ids.A);

      // In a cycle, all nodes are both direct/indirect dependents
      expect(result.totalAffectedCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('disconnected: A → B, C → D', () => {
    it('failure in B should only affect A, not C or D', async () => {
      const ids = await buildGraph(['A', 'B', 'C', 'D'], [['A', 'B'], ['C', 'D']]);
      const result = blastService.analyze(ids.B);

      expect(result.directlyAffected).toContain(ids.A);
      expect(result.totalAffectedCount).toBe(1);
    });
  });

  describe('output structure', () => {
    it('should include all required fields', async () => {
      const ids = await buildGraph(['A', 'B'], [['A', 'B']]);
      const result = blastService.analyze(ids.B);

      expect(result).toHaveProperty('serviceId');
      expect(result).toHaveProperty('directlyAffected');
      expect(result).toHaveProperty('indirectlyAffected');
      expect(result).toHaveProperty('upstreamServices');
      expect(result).toHaveProperty('downstreamServices');
      expect(result).toHaveProperty('affectedPaths');
      expect(result).toHaveProperty('totalAffectedCount');
    });
  });
});
