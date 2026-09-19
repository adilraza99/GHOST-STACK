const DependencyGraphService = require('../../../src/application/DependencyGraphService');
const { FakeServiceRepository, FakeDependencyRepository } = require('../../helpers/fakes');
const Service = require('../../../src/domain/entities/Service');
const Dependency = require('../../../src/domain/entities/Dependency');

describe('DependencyGraphService', () => {
  let graphService, serviceRepo, depRepo;

  /**
   * Helper to build a graph from a simple adjacency description.
   * nodes: ['A', 'B', 'C']
   * edges: [['A', 'B'], ['B', 'C']] means A→B, B→C
   * Returns a map of name→serviceId.
   */
  async function buildGraph(nodes, edges) {
    serviceRepo = new FakeServiceRepository();
    depRepo = new FakeDependencyRepository();
    graphService = new DependencyGraphService({
      serviceRepository: serviceRepo,
      dependencyRepository: depRepo,
    });

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

  describe('simple linear graph: A → B → C', () => {
    let ids;
    beforeEach(async () => {
      ids = await buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
    });

    it('getDirectDependencies of A should return [B]', () => {
      expect(graphService.getDirectDependencies(ids.A)).toEqual([ids.B]);
    });

    it('getDirectDependents of B should return [A]', () => {
      expect(graphService.getDirectDependents(ids.B)).toEqual([ids.A]);
    });

    it('getDownstream of A should return [B, C]', () => {
      const downstream = graphService.getDownstream(ids.A);
      expect(downstream).toContain(ids.B);
      expect(downstream).toContain(ids.C);
      expect(downstream).toHaveLength(2);
    });

    it('getUpstream of C should return [B, A]', () => {
      const upstream = graphService.getUpstream(ids.C);
      expect(upstream).toContain(ids.A);
      expect(upstream).toContain(ids.B);
      expect(upstream).toHaveLength(2);
    });

    it('getPath from A to C should return [A, B, C]', () => {
      const path = graphService.getPath(ids.A, ids.C);
      expect(path).toEqual([ids.A, ids.B, ids.C]);
    });

    it('getPath from C to A should return null (no reverse path)', () => {
      expect(graphService.getPath(ids.C, ids.A)).toBeNull();
    });

    it('getStats should show 3 nodes, 2 edges, 1 component', () => {
      const stats = graphService.getStats();
      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(2);
      expect(stats.components).toBe(1);
    });
  });

  describe('branching graph: A → B, A → C, B → D, C → D', () => {
    let ids;
    beforeEach(async () => {
      ids = await buildGraph(
        ['A', 'B', 'C', 'D'],
        [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']]
      );
    });

    it('getDirectDependencies of A should return B and C', () => {
      const deps = graphService.getDirectDependencies(ids.A);
      expect(deps).toContain(ids.B);
      expect(deps).toContain(ids.C);
      expect(deps).toHaveLength(2);
    });

    it('getDownstream of A should return B, C, D', () => {
      const downstream = graphService.getDownstream(ids.A);
      expect(downstream).toHaveLength(3);
    });

    it('getPath should return shortest path A→B→D (not A→C→D)', () => {
      const path = graphService.getPath(ids.A, ids.D);
      expect(path).toHaveLength(3); // shortest is 3 hops
    });

    it('getDirectDependents of D should return B and C', () => {
      const dependents = graphService.getDirectDependents(ids.D);
      expect(dependents).toContain(ids.B);
      expect(dependents).toContain(ids.C);
    });
  });

  describe('disconnected graph', () => {
    let ids;
    beforeEach(async () => {
      ids = await buildGraph(
        ['A', 'B', 'C', 'D'],
        [['A', 'B'], ['C', 'D']] // two separate components
      );
    });

    it('getStats should show 2 components', () => {
      expect(graphService.getStats().components).toBe(2);
    });

    it('getPath between disconnected nodes should return null', () => {
      expect(graphService.getPath(ids.A, ids.D)).toBeNull();
    });

    it('getDownstream of A should only include B', () => {
      expect(graphService.getDownstream(ids.A)).toEqual([ids.B]);
    });
  });

  describe('cyclic graph: A → B → C → A', () => {
    let ids;
    beforeEach(async () => {
      ids = await buildGraph(
        ['A', 'B', 'C'],
        [['A', 'B'], ['B', 'C'], ['C', 'A']]
      );
    });

    it('should not infinite loop on getDownstream', () => {
      const downstream = graphService.getDownstream(ids.A);
      expect(downstream).toContain(ids.B);
      expect(downstream).toContain(ids.C);
      expect(downstream).toHaveLength(2);
    });

    it('should not infinite loop on getUpstream', () => {
      const upstream = graphService.getUpstream(ids.A);
      expect(upstream).toContain(ids.B);
      expect(upstream).toContain(ids.C);
      expect(upstream).toHaveLength(2);
    });

    it('getPath should work in a cycle', () => {
      const path = graphService.getPath(ids.A, ids.C);
      expect(path).toEqual([ids.A, ids.B, ids.C]);
    });

    it('getStats should show 1 component', () => {
      expect(graphService.getStats().components).toBe(1);
    });
  });

  describe('missing nodes', () => {
    beforeEach(async () => {
      await buildGraph(['A'], []);
    });

    it('getDirectDependencies of nonexistent node returns empty', () => {
      expect(graphService.getDirectDependencies('nonexistent')).toEqual([]);
    });

    it('getPath to nonexistent node returns null', () => {
      expect(graphService.getPath('nonexistent', 'also-missing')).toBeNull();
    });
  });

  describe('self path', () => {
    let ids;
    beforeEach(async () => {
      ids = await buildGraph(['A'], []);
    });

    it('getPath from A to A should return [A]', () => {
      expect(graphService.getPath(ids.A, ids.A)).toEqual([ids.A]);
    });
  });
});
