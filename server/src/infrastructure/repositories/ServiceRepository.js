/**
 * Repository interface for Service persistence.
 *
 * Application/domain layers depend on this contract, NOT on Mongoose.
 * Infrastructure implementations (MongoServiceRepository, DynamoServiceRepository)
 * implement this interface.
 *
 * All methods return domain entities, never raw DB documents.
 */
class ServiceRepository {
  /**
   * @param {string} serviceId
   * @returns {Promise<import('../../domain/entities/Service')|null>}
   */
  async findById(serviceId) {
    throw new Error('ServiceRepository.findById() not implemented');
  }

  /**
   * @param {string} name
   * @param {string} [environment]
   * @returns {Promise<import('../../domain/entities/Service')|null>}
   */
  async findByName(name, environment) {
    throw new Error('ServiceRepository.findByName() not implemented');
  }

  /**
   * @returns {Promise<import('../../domain/entities/Service')[]>}
   */
  async findAll() {
    throw new Error('ServiceRepository.findAll() not implemented');
  }

  /**
   * @param {import('../../domain/entities/Service')} service
   * @returns {Promise<import('../../domain/entities/Service')>}
   */
  async save(service) {
    throw new Error('ServiceRepository.save() not implemented');
  }

  /**
   * Creates or updates a service by name+environment.
   * @param {import('../../domain/entities/Service')} service
   * @returns {Promise<import('../../domain/entities/Service')>}
   */
  async upsert(service) {
    throw new Error('ServiceRepository.upsert() not implemented');
  }

  /**
   * Removes all services.
   * @returns {Promise<void>}
   */
  async deleteAll() {
    throw new Error('ServiceRepository.deleteAll() not implemented');
  }
}

module.exports = ServiceRepository;
