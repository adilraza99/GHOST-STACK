/**
 * DependencyGraphService
 *
 * Builds an in-memory directed graph from repository data.
 * Nodes = services, Edges = dependencies.
 *
 * The graph is NOT assumed to be a DAG — cycles are handled safely.
 * All traversals use visited-set protection.
 */
class DependencyGraphService {
  /**
   * @param {object} deps
   * @param {import('../../infrastructure/repositories/ServiceRepository')} deps.serviceRepository
   * @param {import('../../infrastructure/repositories/DependencyRepository')} deps.dependencyRepository
   */
  constructor({ serviceRepository, dependencyRepository }) {
    this.serviceRepository = serviceRepository;
    this.dependencyRepository = dependencyRepository;

    // Adjacency lists: serviceId → [serviceId]
    /** @type {Map<string, Set<string>>} outgoing edges (service → its dependencies) */
    this._outgoing = new Map();
    /** @type {Map<string, Set<string>>} incoming edges (service → its dependents) */
    this._incoming = new Map();
    /** @type {Set<string>} all known node IDs */
    this._nodes = new Set();
    /** @type {boolean} whether the graph has been built */
    this._built = false;
  }

  /**
   * Builds (or rebuilds) the graph from current repository data.
   * @param {object} [filter={}] - Optional filter (e.g. { projectId })
   */
  async build(filter = {}) {
    this._outgoing.clear();
    this._incoming.clear();
    this._nodes.clear();

    const services = await this.serviceRepository.findAll(filter);
    for (const svc of services) {
      this._nodes.add(svc.serviceId);
      this._outgoing.set(svc.serviceId, new Set());
      this._incoming.set(svc.serviceId, new Set());
    }

    const dependencies = await this.dependencyRepository.findAll(filter);
    for (const dep of dependencies) {
      // Ensure both endpoints are registered as nodes
      if (!this._nodes.has(dep.sourceServiceId)) {
        this._nodes.add(dep.sourceServiceId);
        this._outgoing.set(dep.sourceServiceId, new Set());
        this._incoming.set(dep.sourceServiceId, new Set());
      }
      if (!this._nodes.has(dep.targetServiceId)) {
        this._nodes.add(dep.targetServiceId);
        this._outgoing.set(dep.targetServiceId, new Set());
        this._incoming.set(dep.targetServiceId, new Set());
      }

      // source depends on target → source has outgoing edge to target
      this._outgoing.get(dep.sourceServiceId).add(dep.targetServiceId);
      // target is depended on by source → target has incoming edge from source
      this._incoming.get(dep.targetServiceId).add(dep.sourceServiceId);
    }

    this._built = true;
  }

  /**
   * Returns direct dependencies of a service (what it depends on).
   * @param {string} serviceId
   * @returns {string[]}
   */
  getDirectDependencies(serviceId) {
    const edges = this._outgoing.get(serviceId);
    return edges ? [...edges] : [];
  }

  /**
   * Returns direct dependents of a service (what depends on it).
   * @param {string} serviceId
   * @returns {string[]}
   */
  getDirectDependents(serviceId) {
    const edges = this._incoming.get(serviceId);
    return edges ? [...edges] : [];
  }

  /**
   * Returns all downstream services (transitive dependencies).
   * Uses BFS with visited-set protection (cycle-safe).
   * @param {string} serviceId
   * @returns {string[]} all downstream services excluding the origin
   */
  getDownstream(serviceId) {
    return this._bfsCollect(serviceId, this._outgoing);
  }

  /**
   * Returns all upstream services (transitive dependents).
   * Uses BFS with visited-set protection (cycle-safe).
   * @param {string} serviceId
   * @returns {string[]} all upstream services excluding the origin
   */
  getUpstream(serviceId) {
    return this._bfsCollect(serviceId, this._incoming);
  }

  /**
   * Finds the shortest path between two services using BFS.
   * Traverses outgoing edges (source → target direction).
   * @param {string} sourceId
   * @param {string} targetId
   * @returns {string[]|null} ordered path including both endpoints, or null if no path
   */
  getPath(sourceId, targetId) {
    if (sourceId === targetId) return [sourceId];
    if (!this._nodes.has(sourceId) || !this._nodes.has(targetId)) return null;

    const visited = new Set([sourceId]);
    const queue = [[sourceId]];

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      const neighbors = this._outgoing.get(current);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (neighbor === targetId) {
          return [...path, neighbor];
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }

    return null; // no path found
  }

  /**
   * Returns graph statistics.
   * @returns {{ nodeCount: number, edgeCount: number, components: number }}
   */
  getStats() {
    let edgeCount = 0;
    for (const edges of this._outgoing.values()) {
      edgeCount += edges.size;
    }

    return {
      nodeCount: this._nodes.size,
      edgeCount,
      components: this._countComponents(),
    };
  }

  /**
   * Checks whether a node exists in the graph.
   * @param {string} serviceId
   * @returns {boolean}
   */
  hasNode(serviceId) {
    return this._nodes.has(serviceId);
  }

  // ─── Private Helpers ────────────────────────────────────────────

  /**
   * BFS collect from a starting node following the given adjacency map.
   * Returns all reachable nodes excluding the start node.
   * Cycle-safe via visited set.
   */
  _bfsCollect(startId, adjacencyMap) {
    const visited = new Set();
    const queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = adjacencyMap.get(current);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    visited.delete(startId); // exclude origin
    return [...visited];
  }

  /**
   * Counts connected components treating the graph as undirected.
   */
  _countComponents() {
    const visited = new Set();
    let components = 0;

    for (const node of this._nodes) {
      if (!visited.has(node)) {
        components++;
        // BFS over undirected edges
        const queue = [node];
        visited.add(node);
        while (queue.length > 0) {
          const current = queue.shift();
          // Follow both outgoing and incoming edges
          const outgoing = this._outgoing.get(current) || new Set();
          const incoming = this._incoming.get(current) || new Set();
          for (const neighbor of [...outgoing, ...incoming]) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }
    }

    return components;
  }
}

module.exports = DependencyGraphService;
