const Deployment = require('../domain/entities/Deployment');
const { EntityNotFoundError, InvalidStateError } = require('../domain/errors');

/**
 * DeploymentService
 *
 * Orchestrates deployment creation, retrieval, and listing.
 * Owns the construction of Deployment entities, project boundary enforcement,
 * and persistence so that controllers remain thin HTTP adapters.
 */
class DeploymentService {
  /**
   * @param {object} deps
   * @param {import('../infrastructure/repositories/DeploymentRepository')} deps.deploymentRepository
   * @param {import('../infrastructure/repositories/ProjectRepository')} [deps.projectRepository]
   */
  constructor({ deploymentRepository, projectRepository }) {
    if (!deploymentRepository) {
      throw new Error('deploymentRepository is required for DeploymentService');
    }
    this.deploymentRepository = deploymentRepository;
    this.projectRepository = projectRepository;
  }

  /**
   * Creates and persists a new deployment record.
   *
   * @param {object} params
   * @param {string} [params.projectId='project-default']
   * @param {string} params.serviceId
   * @param {string|null} [params.previousVersion]
   * @param {string} params.newVersion
   * @param {Date|string} [params.deployedAt]
   * @param {string} [params.environment]
   * @param {object} [params.metadata]
   * @returns {Promise<Deployment>} The saved Deployment entity
   */
  async create(params = {}) {
    const projectId = params.projectId || params.metadata?.projectId || 'project-default';

    // Verify project is active if projectRepository is configured
    if (this.projectRepository && projectId !== 'project-default' && projectId !== 'project-demo') {
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new EntityNotFoundError('Project', projectId);
      }
      if (project.isArchived()) {
        throw new InvalidStateError('Project', 'Cannot record deployment for an archived project');
      }
    }

    const deployment = new Deployment({
      ...params,
      projectId,
    });
    return this.deploymentRepository.save(deployment);
  }

  /**
   * Retrieves a single deployment within a project.
   *
   * @param {string} projectId
   * @param {string} deploymentId
   * @returns {Promise<Deployment>}
   */
  async getDeployment(projectId, deploymentId) {
    const deployment = await this.deploymentRepository.findById(projectId, deploymentId);
    if (!deployment) {
      throw new EntityNotFoundError('Deployment', deploymentId);
    }
    return deployment;
  }

  /**
   * Lists deployments for a project matching optional filters.
   *
   * @param {string} projectId
   * @param {object} [filters={}]
   * @param {string} [filters.serviceId]
   * @param {string} [filters.environment]
   * @param {Date|string} [filters.startTime]
   * @param {Date|string} [filters.endTime]
   * @param {number} [filters.limit]
   * @returns {Promise<Deployment[]>}
   */
  async listDeployments(projectId, filters = {}) {
    // If projectRepository configured, verify project exists
    if (this.projectRepository && projectId !== 'project-default' && projectId !== 'project-demo') {
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new EntityNotFoundError('Project', projectId);
      }
    }

    return this.deploymentRepository.findByProject(projectId, filters);
  }
}

module.exports = DeploymentService;
