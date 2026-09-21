const Project = require('../domain/entities/Project');
const {
  ValidationError,
  EntityNotFoundError,
  InvalidStateError,
  ConflictError,
} = require('../domain/errors');

/**
 * ProjectService application service.
 *
 * Orchestrates project creation, retrieval, listing, and archival use cases.
 * Enforces business rules like slug uniqueness and archival transitions.
 */
class ProjectService {
  /**
   * @param {object} params
   * @param {import('../infrastructure/repositories/ProjectRepository')} params.projectRepository
   */
  constructor({ projectRepository }) {
    if (!projectRepository) {
      throw new Error('projectRepository is required for ProjectService');
    }
    this.projectRepository = projectRepository;
  }

  /**
   * Creates a new project.
   *
   * @param {object} params
   * @param {string} params.name
   * @param {string} [params.slug]
   * @param {string} [params.description]
   * @returns {Promise<Project>}
   */
  async createProject({ name, slug, description } = {}) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('name', 'Project name is required');
    }

    const computedSlug = slug && typeof slug === 'string' && slug.trim().length > 0
      ? Project.slugify(slug)
      : Project.slugify(name);

    if (!computedSlug) {
      throw new ValidationError('slug', 'Unable to derive valid slug from project name');
    }

    // Check slug uniqueness
    const existing = await this.projectRepository.findBySlug(computedSlug);
    if (existing) {
      throw new ConflictError(`Project with slug '${computedSlug}' already exists`);
    }

    const project = new Project({
      name: name.trim(),
      slug: computedSlug,
      description: description || '',
      status: 'active',
    });

    await this.projectRepository.save(project);
    return project;
  }

  /**
   * Retrieves a project by its unique ID.
   *
   * @param {string} projectId
   * @returns {Promise<Project>}
   */
  async getProject(projectId) {
    if (!projectId || typeof projectId !== 'string') {
      throw new ValidationError('projectId', 'Project ID is required');
    }
    const project = await this.projectRepository.findById(projectId.trim());
    if (!project) {
      throw new EntityNotFoundError('Project', projectId);
    }
    return project;
  }

  /**
   * Retrieves a project by its URL slug.
   *
   * @param {string} slug
   * @returns {Promise<Project>}
   */
  async getProjectBySlug(slug) {
    if (!slug || typeof slug !== 'string') {
      throw new ValidationError('slug', 'Slug is required');
    }
    const project = await this.projectRepository.findBySlug(slug.trim());
    if (!project) {
      throw new EntityNotFoundError('Project', slug);
    }
    return project;
  }

  /**
   * Lists all projects matching optional filter criteria.
   *
   * @param {object} [filter={}]
   * @param {string} [filter.status]
   * @returns {Promise<Project[]>}
   */
  async listProjects(filter = {}) {
    return this.projectRepository.findAll(filter);
  }

  /**
   * Archives a project. Archived projects cannot accept new telemetry.
   *
   * @param {string} projectId
   * @returns {Promise<Project>}
   */
  async archiveProject(projectId) {
    if (!projectId || typeof projectId !== 'string') {
      throw new ValidationError('projectId', 'Project ID is required');
    }
    const project = await this.projectRepository.findById(projectId.trim());
    if (!project) {
      throw new EntityNotFoundError('Project', projectId);
    }
    if (project.isArchived()) {
      throw new InvalidStateError('Project', 'Project is already archived');
    }

    project.archive();
    await this.projectRepository.update(project);
    return project;
  }
}

module.exports = ProjectService;
