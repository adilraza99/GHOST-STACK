/**
 * BlastRadiusService
 *
 * Deterministic blast-radius analysis using the dependency graph.
 *
 * Calculates the set of services potentially affected by a failure
 * or degradation of a given service.
 *
 * IMPORTANT: This is dependency analysis, not prediction.
 * Results describe "potentially affected" services, not guaranteed failures.
 */
class BlastRadiusService {
  /**
   * @param {object} deps
   * @param {import('./DependencyGraphService')} deps.graphService
   */
  constructor({ graphService }) {
    this.graphService = graphService;
  }

  /**
   * Calculates the blast radius for a given service.
   *
   * @param {string} serviceId
   * @returns {{
   *   serviceId: string,
   *   directlyAffected: string[],
   *   indirectlyAffected: string[],
   *   upstreamServices: string[],
   *   downstreamServices: string[],
   *   affectedPaths: Array<string[]>,
   *   totalAffectedCount: number
   * }}
   */
  analyze(serviceId) {
    // Direct dependents: services that directly depend on this service
    const directlyAffected = this.graphService.getDirectDependents(serviceId);

    // All upstream (transitive dependents): everything that depends on this service
    const allUpstream = this.graphService.getUpstream(serviceId);

    // Indirect = upstream minus direct
    const directSet = new Set(directlyAffected);
    const indirectlyAffected = allUpstream.filter((id) => !directSet.has(id));

    // Upstream services: services this service depends on (its own dependencies)
    const upstreamServices = this.graphService.getDirectDependencies(serviceId);

    // Downstream: services this service transitively depends on
    const downstreamServices = this.graphService.getDownstream(serviceId);

    // Affected paths: path from each directly affected service to the impacted service
    const affectedPaths = [];
    for (const affectedId of directlyAffected) {
      const path = this.graphService.getPath(affectedId, serviceId);
      if (path) {
        affectedPaths.push(path);
      }
    }

    // Total unique affected count (direct + indirect, deduplicated)
    const allAffected = new Set([...directlyAffected, ...indirectlyAffected]);

    return {
      serviceId,
      directlyAffected,
      indirectlyAffected,
      upstreamServices,
      downstreamServices,
      affectedPaths,
      totalAffectedCount: allAffected.size,
    };
  }
}

module.exports = BlastRadiusService;
