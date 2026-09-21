/**
 * ProjectRepository interface.
 *
 * Defines the persistence contract for Project entities.
 * Concrete implementations (MongoDB, in-memory test fakes) must implement all methods.
 */
class ProjectRepository {
  /**
   * Finds a project by its unique UUID identifier.
   * @param {string} projectId
   * @returns {Promise<import('../../domain/entities/Project')|null>}
   */
  async findById(projectId) {
    throw new Error('Not implemented');
  }

  /**
   * Finds a project by its unique URL slug.
   * @param {string} slug
   * @returns {Promise<import('../../domain/entities/Project')|null>}
   */
  async findBySlug(slug) {
    throw new Error('Not implemented');
  }

  /**
   * Finds all projects matching optional filter criteria.
   * @param {object} [filter={}]
   * @param {string} [filter.status]
   * @returns {Promise<import('../../domain/entities/Project')[]>}
   */
  async findAll(filter = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Saves a new project.
   * @param {import('../../domain/entities/Project')} project
   * @returns {Promise<import('../../domain/entities/Project')>}
   */
  async save(project) {
    throw new Error('Not implemented');
  }

  /**
   * Updates an existing project.
   * @param {import('../../domain/entities/Project')} project
   * @returns {Promise<import('../../domain/entities/Project')>}
   */
  async update(project) {
    throw new Error('Not implemented');
  }

  /**
   * Deletes all projects (primarily for test cleanup).
   * @returns {Promise<void>}
   */
  async deleteAll() {
    throw new Error('Not implemented');
  }
}

module.exports = ProjectRepository;
