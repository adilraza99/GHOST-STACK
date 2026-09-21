/**
 * Repository interface for Deployment persistence.
 *
 * Defines the contract for deployment storage and retrieval.
 * Concrete implementations (MongoDB, in-memory test fakes) must implement all methods.
 */
class DeploymentRepository {
  /**
   * Finds a deployment by ID. Supports (deploymentId) or (projectId, deploymentId).
   * @param {string} projectIdOrDeploymentId
   * @param {string} [deploymentId]
   * @returns {Promise<import('../../domain/entities/Deployment')|null>}
   */
  async findById(projectIdOrDeploymentId, deploymentId) {
    throw new Error('DeploymentRepository.findById() not implemented');
  }

  /**
   * Finds deployments for a project matching optional filters.
   * @param {string} projectId
   * @param {object} [filters={}]
   * @param {string} [filters.serviceId]
   * @param {string} [filters.environment]
   * @param {Date|string} [filters.startTime]
   * @param {Date|string} [filters.endTime]
   * @param {number} [filters.limit]
   * @returns {Promise<import('../../domain/entities/Deployment')[]>}
   */
  async findByProject(projectId, filters = {}) {
    throw new Error('DeploymentRepository.findByProject() not implemented');
  }

  /**
   * Finds deployments for a service. Supports (serviceId) or (projectId, serviceId, filters).
   * @param {string} projectIdOrServiceId
   * @param {string} [serviceId]
   * @param {object} [filters]
   * @returns {Promise<import('../../domain/entities/Deployment')[]>}
   */
  async findByService(projectIdOrServiceId, serviceId, filters) {
    throw new Error('DeploymentRepository.findByService() not implemented');
  }

  /**
   * Finds recent deployments for a project.
   * @param {string} projectId
   * @param {object} [options={}]
   * @param {number} [options.limit=10]
   * @returns {Promise<import('../../domain/entities/Deployment')[]>}
   */
  async findRecent(projectId, options = {}) {
    throw new Error('DeploymentRepository.findRecent() not implemented');
  }

  /**
   * Finds deployments within a specific time window for a project.
   * @param {string} projectId
   * @param {Date|string} startTime
   * @param {Date|string} endTime
   * @param {object} [filters={}]
   * @returns {Promise<import('../../domain/entities/Deployment')[]>}
   */
  async findBetween(projectId, startTime, endTime, filters = {}) {
    throw new Error('DeploymentRepository.findBetween() not implemented');
  }

  /**
   * Finds all deployments matching optional filter.
   * @param {object} [filter={}]
   * @returns {Promise<import('../../domain/entities/Deployment')[]>}
   */
  async findAll(filter = {}) {
    throw new Error('DeploymentRepository.findAll() not implemented');
  }

  /**
   * Saves a new deployment.
   * @param {import('../../domain/entities/Deployment')} deployment
   * @returns {Promise<import('../../domain/entities/Deployment')>}
   */
  async save(deployment) {
    throw new Error('DeploymentRepository.save() not implemented');
  }

  /**
   * Deletes all deployments (optionally scoped to a project).
   * @param {string} [projectId]
   * @returns {Promise<void>}
   */
  async deleteAll(projectId) {
    throw new Error('DeploymentRepository.deleteAll() not implemented');
  }
}

module.exports = DeploymentRepository;
