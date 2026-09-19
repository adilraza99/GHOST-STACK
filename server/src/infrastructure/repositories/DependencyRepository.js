/**
 * Repository interface for Dependency persistence.
 */
class DependencyRepository {
  /** @param {string} dependencyId */
  async findById(dependencyId) {
    throw new Error('DependencyRepository.findById() not implemented');
  }

  /** @param {string} sourceServiceId */
  async findBySource(sourceServiceId) {
    throw new Error('DependencyRepository.findBySource() not implemented');
  }

  /** @param {string} targetServiceId */
  async findByTarget(targetServiceId) {
    throw new Error('DependencyRepository.findByTarget() not implemented');
  }

  async findAll() {
    throw new Error('DependencyRepository.findAll() not implemented');
  }

  /**
   * Creates or updates a dependency by composite key (source+target+type).
   * On update, increments requestCount/failureCount and updates lastSeenAt.
   * @param {import('../../domain/entities/Dependency')} dependency
   * @param {object} [counters] - { failed: boolean } for counter updates
   * @returns {Promise<import('../../domain/entities/Dependency')>}
   */
  async upsert(dependency, counters) {
    throw new Error('DependencyRepository.upsert() not implemented');
  }

  async save(dependency) {
    throw new Error('DependencyRepository.save() not implemented');
  }

  async deleteAll() {
    throw new Error('DependencyRepository.deleteAll() not implemented');
  }
}

module.exports = DependencyRepository;
