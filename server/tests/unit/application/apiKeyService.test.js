const ApiKeyService = require('../../../src/application/ApiKeyService');
const Project = require('../../../src/domain/entities/Project');
const { FakeApiKeyRepository, FakeProjectRepository } = require('../../helpers/fakes');
const {
  ValidationError,
  EntityNotFoundError,
  InvalidStateError,
  ForbiddenError,
} = require('../../../src/domain/errors');

describe('ApiKeyService', () => {
  let apiKeyRepository;
  let projectRepository;
  let apiKeyService;
  let project;

  beforeEach(async () => {
    apiKeyRepository = new FakeApiKeyRepository();
    projectRepository = new FakeProjectRepository();
    apiKeyService = new ApiKeyService({ apiKeyRepository, projectRepository });

    project = new Project({
      projectId: 'proj_test_123',
      name: 'Test Project',
      slug: 'test-project',
      status: 'active',
    });
    await projectRepository.save(project);
  });

  describe('createApiKey', () => {
    it('should generate a key and return plaintextKey strictly once', async () => {
      const result = await apiKeyService.createApiKey({
        projectId: project.projectId,
        name: 'Ingestion Key',
        permissions: ['telemetry:write'],
      });

      expect(result.apiKey).toBeDefined();
      expect(result.plaintextKey).toBeDefined();
      expect(result.plaintextKey).toMatch(/^gs_live_[a-f0-9]{48}$/);
      expect(result.apiKey.projectId).toBe(project.projectId);
      expect(result.apiKey.name).toBe('Ingestion Key');
      expect(result.apiKey.prefix).toMatch(/^gs_live_[a-f0-9]{8}$/);

      // Verify repository only holds hashedKey, not plaintext
      const saved = await apiKeyRepository.findById(result.apiKey.keyId);
      expect(saved.hashedKey).not.toBe(result.plaintextKey);
      expect(saved.hashedKey).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should throw EntityNotFoundError if project does not exist', async () => {
      await expect(
        apiKeyService.createApiKey({ projectId: 'nonexistent-project' })
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw InvalidStateError if project is archived', async () => {
      project.archive();
      await projectRepository.update(project);

      await expect(
        apiKeyService.createApiKey({ projectId: project.projectId })
      ).rejects.toThrow(InvalidStateError);
    });

    it('should throw ValidationError if projectId is missing', async () => {
      await expect(apiKeyService.createApiKey({})).rejects.toThrow(ValidationError);
    });
  });

  describe('listApiKeys', () => {
    it('should list all keys for project and safe toJSON does not expose plaintext or hash', async () => {
      const { apiKey: key1 } = await apiKeyService.createApiKey({
        projectId: project.projectId,
        name: 'Key 1',
      });
      const { apiKey: key2 } = await apiKeyService.createApiKey({
        projectId: project.projectId,
        name: 'Key 2',
      });

      const keys = await apiKeyService.listApiKeys(project.projectId);
      expect(keys).toHaveLength(2);

      const serialized = keys.map((k) => k.toJSON());
      for (const item of serialized) {
        expect(item).not.toHaveProperty('plaintextKey');
        expect(item).not.toHaveProperty('hashedKey');
        expect(item).toHaveProperty('keyId');
        expect(item).toHaveProperty('prefix');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('permissions');
      }
    });

    it('should throw EntityNotFoundError when project does not exist', async () => {
      await expect(apiKeyService.listApiKeys('unknown-project')).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an active API key', async () => {
      const { apiKey } = await apiKeyService.createApiKey({
        projectId: project.projectId,
        name: 'To Revoke',
      });

      const revoked = await apiKeyService.revokeApiKey(project.projectId, apiKey.keyId);

      expect(revoked.isRevoked()).toBe(true);
      expect(revoked.revokedAt).toBeInstanceOf(Date);

      const saved = await apiKeyRepository.findById(apiKey.keyId);
      expect(saved.isRevoked()).toBe(true);
    });

    it('should throw EntityNotFoundError if key does not exist', async () => {
      await expect(
        apiKeyService.revokeApiKey(project.projectId, 'missing-key')
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw ForbiddenError if key belongs to another project', async () => {
      const otherProject = new Project({
        projectId: 'proj_other_456',
        name: 'Other Project',
        slug: 'other-project',
      });
      await projectRepository.save(otherProject);

      const { apiKey } = await apiKeyService.createApiKey({
        projectId: otherProject.projectId,
        name: 'Other Key',
      });

      // Attempt to revoke other project's key from current project
      await expect(
        apiKeyService.revokeApiKey(project.projectId, apiKey.keyId)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw InvalidStateError if key is already revoked', async () => {
      const { apiKey } = await apiKeyService.createApiKey({
        projectId: project.projectId,
        name: 'Key',
      });

      await apiKeyService.revokeApiKey(project.projectId, apiKey.keyId);

      await expect(
        apiKeyService.revokeApiKey(project.projectId, apiKey.keyId)
      ).rejects.toThrow(InvalidStateError);
    });
  });
});
