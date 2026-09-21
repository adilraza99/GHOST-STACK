const ApiKey = require('../../../src/domain/entities/ApiKey');
const { ValidationError } = require('../../../src/domain/errors');

describe('ApiKey Domain Entity', () => {
  const validHashedKey = 'a'.repeat(64); // 64-character hex string

  describe('constructor validation', () => {
    it('should create an ApiKey with valid properties', () => {
      const key = new ApiKey({
        projectId: 'proj_alpha',
        hashedKey: validHashedKey,
        prefix: 'gs_live_abc12345',
        name: 'Production Ingestion Key',
      });

      expect(key.keyId).toBeDefined();
      expect(key.projectId).toBe('proj_alpha');
      expect(key.hashedKey).toBe(validHashedKey);
      expect(key.prefix).toBe('gs_live_abc12345');
      expect(key.name).toBe('Production Ingestion Key');
      expect(key.permissions).toEqual(['telemetry:write']);
      expect(key.createdAt).toBeInstanceOf(Date);
      expect(key.lastUsedAt).toBeNull();
      expect(key.expiresAt).toBeNull();
      expect(key.revokedAt).toBeNull();
    });

    it('should throw when props is missing', () => {
      expect(() => new ApiKey(null)).toThrow(ValidationError);
    });

    it('should throw when projectId is missing or empty', () => {
      expect(() => new ApiKey({ hashedKey: validHashedKey, prefix: 'pfx', name: 'key' })).toThrow(ValidationError);
      expect(() => new ApiKey({ projectId: '   ', hashedKey: validHashedKey, prefix: 'pfx', name: 'key' })).toThrow(ValidationError);
    });

    it('should throw when hashedKey is missing or not 64 hex chars', () => {
      expect(() => new ApiKey({ projectId: 'p1', prefix: 'pfx', name: 'key' })).toThrow(ValidationError);
      expect(() => new ApiKey({ projectId: 'p1', hashedKey: 'short', prefix: 'pfx', name: 'key' })).toThrow(ValidationError);
      expect(() => new ApiKey({ projectId: 'p1', hashedKey: 'z'.repeat(64), prefix: 'pfx', name: 'key' })).toThrow(ValidationError);
    });

    it('should throw when prefix or name is missing', () => {
      expect(() => new ApiKey({ projectId: 'p1', hashedKey: validHashedKey, name: 'key' })).toThrow(ValidationError);
      expect(() => new ApiKey({ projectId: 'p1', hashedKey: validHashedKey, prefix: 'pfx' })).toThrow(ValidationError);
    });
  });

  describe('ApiKey.generate()', () => {
    it('should generate a secure key pair with gs_live_ prefix and valid SHA-256 hash', () => {
      const { apiKey, plaintextKey } = ApiKey.generate({
        projectId: 'proj_beta',
        name: 'Agent Key',
      });

      expect(plaintextKey.startsWith('gs_live_')).toBe(true);
      expect(plaintextKey.length).toBeGreaterThan(32);
      expect(apiKey).toBeInstanceOf(ApiKey);
      expect(apiKey.projectId).toBe('proj_beta');
      expect(apiKey.prefix.startsWith('gs_live_')).toBe(true);
      expect(apiKey.hashedKey).toBe(ApiKey.hashKey(plaintextKey));
    });

    it('should throw when generate is called without projectId', () => {
      expect(() => ApiKey.generate({})).toThrow(ValidationError);
    });
  });

  describe('ApiKey.hashKey()', () => {
    it('should deterministically produce 64-char lowercase hex digest', () => {
      const hash1 = ApiKey.hashKey('gs_live_testsecret123');
      const hash2 = ApiKey.hashKey('gs_live_testsecret123');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
    });

    it('should throw when hashing invalid input', () => {
      expect(() => ApiKey.hashKey('')).toThrow(ValidationError);
      expect(() => ApiKey.hashKey(null)).toThrow(ValidationError);
    });
  });

  describe('isRevoked() and revoke()', () => {
    it('should start unrevoked and become revoked after revoke()', () => {
      const { apiKey } = ApiKey.generate({ projectId: 'proj_1' });
      expect(apiKey.isRevoked()).toBe(false);
      expect(apiKey.isValid()).toBe(true);

      const revokeTime = new Date();
      apiKey.revoke(revokeTime);
      expect(apiKey.isRevoked()).toBe(true);
      expect(apiKey.isValid()).toBe(false);
      expect(apiKey.revokedAt).toEqual(revokeTime);
    });
  });

  describe('isExpired() and expiresAt', () => {
    it('should never expire if expiresAt is null', () => {
      const { apiKey } = ApiKey.generate({ projectId: 'proj_1' });
      expect(apiKey.isExpired(new Date('2099-01-01'))).toBe(false);
    });

    it('should report expired when current time is past expiresAt', () => {
      const past = new Date(Date.now() - 10000);
      const future = new Date(Date.now() + 10000);

      const { apiKey: expiredKey } = ApiKey.generate({
        projectId: 'proj_1',
        expiresAt: past,
      });
      expect(expiredKey.isExpired()).toBe(true);
      expect(expiredKey.isValid()).toBe(false);

      const { apiKey: activeKey } = ApiKey.generate({
        projectId: 'proj_1',
        expiresAt: future,
      });
      expect(activeKey.isExpired()).toBe(false);
      expect(activeKey.isValid()).toBe(true);
    });
  });

  describe('permissions and hasPermission()', () => {
    it('should check permissions correctly', () => {
      const key = new ApiKey({
        projectId: 'proj_1',
        hashedKey: validHashedKey,
        prefix: 'gs_live_12345678',
        name: 'Key',
        permissions: ['telemetry:write', 'metrics:read'],
      });

      expect(key.hasPermission('telemetry:write')).toBe(true);
      expect(key.hasPermission('metrics:read')).toBe(true);
      expect(key.hasPermission('admin:all')).toBe(false);
    });

    it('should grant all permissions if wildcard * is present', () => {
      const key = new ApiKey({
        projectId: 'proj_1',
        hashedKey: validHashedKey,
        prefix: 'gs_live_12345678',
        name: 'Admin Key',
        permissions: ['*'],
      });

      expect(key.hasPermission('telemetry:write')).toBe(true);
      expect(key.hasPermission('anything:else')).toBe(true);
    });
  });

  describe('recordUsage()', () => {
    it('should update lastUsedAt', () => {
      const { apiKey } = ApiKey.generate({ projectId: 'proj_1' });
      expect(apiKey.lastUsedAt).toBeNull();

      const usedAt = new Date();
      apiKey.recordUsage(usedAt);
      expect(apiKey.lastUsedAt).toEqual(usedAt);
    });
  });

  describe('toJSON() security', () => {
    it('should never expose plaintext secret or full hash', () => {
      const { apiKey, plaintextKey } = ApiKey.generate({ projectId: 'proj_1' });
      const json = apiKey.toJSON();

      expect(json.keyId).toBe(apiKey.keyId);
      expect(json.projectId).toBe('proj_1');
      expect(json.prefix).toBe(apiKey.prefix);
      expect(json).not.toHaveProperty('plaintextKey');
      expect(json).not.toHaveProperty('hashedKey');
      expect(JSON.stringify(json)).not.toContain(plaintextKey);
    });
  });
});
