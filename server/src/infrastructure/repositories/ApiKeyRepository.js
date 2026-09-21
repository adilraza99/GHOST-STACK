/**
 * ApiKeyRepository interface.
 *
 * Defines the contract for API key persistence operations.
 * Concrete implementations (MongoDB, in-memory test fakes) must implement all methods.
 */
class ApiKeyRepository {
  /**
   * Finds an API key by its SHA-256 hashed value.
   * @param {string} hashedKey
   * @returns {Promise<import('../../domain/entities/ApiKey')|null>}
   */
  async findByHashedKey(hashedKey) {
    throw new Error('Not implemented');
  }

  /**
   * Finds an API key by its unique UUID.
   * @param {string} keyId
   * @returns {Promise<import('../../domain/entities/ApiKey')|null>}
   */
  async findById(keyId) {
    throw new Error('Not implemented');
  }

  /**
   * Finds all API keys for a specific project.
   * @param {string} projectId
   * @returns {Promise<import('../../domain/entities/ApiKey')[]>}
   */
  async findByProjectId(projectId) {
    throw new Error('Not implemented');
  }

  /**
   * Saves a new API key.
   * @param {import('../../domain/entities/ApiKey')} apiKey
   * @returns {Promise<import('../../domain/entities/ApiKey')>}
   */
  async save(apiKey) {
    throw new Error('Not implemented');
  }

  /**
   * Updates an existing API key.
   * @param {import('../../domain/entities/ApiKey')} apiKey
   * @returns {Promise<import('../../domain/entities/ApiKey')>}
   */
  async update(apiKey) {
    throw new Error('Not implemented');
  }

  /**
   * Records usage timestamp for an API key.
   * @param {string} keyId
   * @param {Date} [timestamp]
   * @returns {Promise<void>}
   */
  async recordUsage(keyId, timestamp) {
    throw new Error('Not implemented');
  }

  /**
   * Deletes all API keys (optionally scoped to a project).
   * @param {string} [projectId]
   * @returns {Promise<void>}
   */
  async deleteAll(projectId) {
    throw new Error('Not implemented');
  }
}

module.exports = ApiKeyRepository;
