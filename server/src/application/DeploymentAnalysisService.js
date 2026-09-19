const Deployment = require('../domain/entities/Deployment');

/**
 * DeploymentAnalysisService
 *
 * Analyzes the potential impact of a deployment using the dependency graph.
 *
 * Output describes services that are "potentially affected" by the deployment.
 * This is deterministic dependency analysis, NOT a prediction of failure.
 * No invented risk scores.
 */
class DeploymentAnalysisService {
  /**
   * @param {object} deps
   * @param {import('./DependencyGraphService')} deps.graphService
   * @param {import('../../infrastructure/repositories/DeploymentRepository')} deps.deploymentRepository
   * @param {import('../../infrastructure/repositories/ServiceRepository')} deps.serviceRepository
   */
  constructor({ graphService, deploymentRepository, serviceRepository }) {
    this.graphService = graphService;
    this.deploymentRepository = deploymentRepository;
    this.serviceRepository = serviceRepository;
  }

  /**
   * Analyzes the impact of deploying a new version.
   *
   * @param {object} params
   * @param {string} params.serviceId - The service being deployed
   * @param {string} params.newVersion - The new version being deployed
   * @returns {Promise<{
   *   deployment: object,
   *   directDependents: string[],
   *   indirectDependents: string[],
   *   downstreamDependencies: string[],
   *   affectedPaths: Array<string[]>,
   *   totalPotentiallyAffected: number
   * }>}
   */
  async analyze({ serviceId, newVersion }) {
    // 1. Look up current service state
    const service = await this.serviceRepository.findById(serviceId);
    const previousVersion = service ? service.version || 'unknown' : 'unknown';

    // 2. Create deployment record
    const deployment = new Deployment({
      serviceId,
      previousVersion,
      newVersion,
    });
    await this.deploymentRepository.save(deployment);

    // 3. Analyze dependency graph impact
    const directDependents = this.graphService.getDirectDependents(serviceId);

    const allUpstream = this.graphService.getUpstream(serviceId);
    const directSet = new Set(directDependents);
    const indirectDependents = allUpstream.filter((id) => !directSet.has(id));

    const downstreamDependencies = this.graphService.getDownstream(serviceId);

    // 4. Build affected paths (from each direct dependent to the deployed service)
    const affectedPaths = [];
    for (const depId of directDependents) {
      const path = this.graphService.getPath(depId, serviceId);
      if (path) {
        affectedPaths.push(path);
      }
    }

    const allAffected = new Set([...directDependents, ...indirectDependents]);

    return {
      deployment: deployment.toJSON(),
      directDependents,
      indirectDependents,
      downstreamDependencies,
      affectedPaths,
      totalPotentiallyAffected: allAffected.size,
    };
  }
}

module.exports = DeploymentAnalysisService;
