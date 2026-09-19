const Deployment = require('../domain/entities/Deployment');

/**
 * DeploymentService
 *
 * Orchestrates deployment creation.
 * Owns the construction of Deployment entities and persistence
 * so that controllers remain thin HTTP adapters.
 */
class DeploymentService {
  /**
   * @param {object} deps
   * @param {object} deps.deploymentRepository
   */
  constructor({ deploymentRepository }) {
    this.deploymentRepository = deploymentRepository;
  }

  /**
   * Creates and persists a new deployment record.
   *
   * @param {object} params
   * @param {string} params.serviceId
   * @param {string} params.previousVersion
   * @param {string} params.newVersion
   * @param {string} [params.environment]
   * @param {object} [params.metadata]
   * @returns {Promise<object>} The saved Deployment entity
   */
  async create(params) {
    const deployment = new Deployment(params);
    return this.deploymentRepository.save(deployment);
  }
}

module.exports = DeploymentService;
