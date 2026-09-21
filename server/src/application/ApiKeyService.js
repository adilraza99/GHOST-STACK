const ApiKey = require('../domain/entities/ApiKey');
const {
  ValidationError,
  EntityNotFoundError,
  InvalidStateError,
  ForbiddenError,
} = require('../domain/errors');

/**
 * ApiKeyService application service.
 *
 * Orchestrates API key creation, listing, and revocation.
 * Guarantees that plaintext secrets are returned strictly once upon generation
 * and are never exposed by subsequent list/detail operations.
 */
class ApiKeyService {
  /**
   * @param {object} params
   * @param {import('../infrastructure/repositories/ApiKeyRepository')} params.apiKeyRepository
   * @param {import('../infrastructure/repositories/ProjectRepository')} params.projectRepository
   */
  constructor({ apiKeyRepository, projectRepository }) {
    if (!apiKeyRepository) {
      throw new Error('apiKeyRepository is required for ApiKeyService');
    }
    if (!projectRepository) {
      throw new Error('projectRepository is required for ApiKeyService');
    }
    this.apiKeyRepository = apiKeyRepository;
    this.projectRepository = projectRepository;
  }

  /**
   * Creates a new API key for a project.
   *
   * @param {object} params
   * @param {string} params.projectId
   * @param {string} [params.name]
   * @param {string[]} [params.permissions]
   * @param {Date|string|null} [params.expiresAt]
   * @returns {Promise<{ apiKey: ApiKey, plaintextKey: string }>}
   */
  async createApiKey({ projectId, name, permissions, expiresAt } = {}) {
    if (!projectId || typeof projectId !== 'string') {
      throw new ValidationError('projectId', 'Project ID is required');
    }

    // Verify project exists and is active
    const project = await this.projectRepository.findById(projectId.trim());
    if (!project) {
      throw new EntityNotFoundError('Project', projectId);
    }
    if (project.isArchived()) {
      throw new InvalidStateError('Project', 'Cannot create API key for an archived project');
    }

    // Generate cryptographic key pair
    const { apiKey, plaintextKey } = ApiKey.generate({
      projectId: projectId.trim(),
      name: name || 'Default Ingestion Key',
      permissions: permissions || ['telemetry:write'],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    // Store only hashed representation
    await this.apiKeyRepository.save(apiKey);

    return { apiKey, plaintextKey };
  }

  /**
   * Lists all API keys for a project.
   * Returned entities only contain safe metadata (no plaintext or raw secret material).
   *
   * @param {string} projectId
   * @returns {Promise<ApiKey[]>}
   */
  async listApiKeys(projectId) {
    if (!projectId || typeof projectId !== 'string') {
      throw new ValidationError('projectId', 'Project ID is required');
    }

    // Verify project exists
    const project = await this.projectRepository.findById(projectId.trim());
    if (!project) {
      throw new EntityNotFoundError('Project', projectId);
    }

    return this.apiKeyRepository.findByProjectId(projectId.trim());
  }

  /**
   * Revokes an API key.
   *
   * @param {string} projectId
   * @param {string} keyId
   * @returns {Promise<ApiKey>}
   */
  async revokeApiKey(projectId, keyId) {
    if (!projectId || typeof projectId !== 'string') {
      throw new ValidationError('projectId', 'Project ID is required');
    }
    if (!keyId || typeof keyId !== 'string') {
      throw new ValidationError('keyId', 'Key ID is required');
    }

    const apiKey = await this.apiKeyRepository.findById(keyId.trim());
    if (!apiKey) {
      throw new EntityNotFoundError('ApiKey', keyId);
    }

    // Prevent cross-project key modification
    if (apiKey.projectId !== projectId.trim()) {
      throw new ForbiddenError(`API key '${keyId}' does not belong to project '${projectId}'`);
    }

    if (apiKey.isRevoked()) {
      throw new InvalidStateError('ApiKey', 'API key is already revoked');
    }

    apiKey.revoke();
    await this.apiKeyRepository.update(apiKey);
    return apiKey;
  }
}

module.exports = ApiKeyService;
