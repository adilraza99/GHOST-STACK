const { createAuthMiddleware } = require('../../../src/interfaces/http/middleware/authMiddleware');
const ApiKey = require('../../../src/domain/entities/ApiKey');
const { FakeApiKeyRepository } = require('../../helpers/fakes');

describe('authMiddleware Unit Tests', () => {
  let apiKeyRepo, authMiddleware;

  beforeEach(() => {
    apiKeyRepo = new FakeApiKeyRepository();
    authMiddleware = createAuthMiddleware({
      apiKeyRepository: apiKeyRepo,
      requiredPermission: 'telemetry:write',
    });
  });

  function mockReqRes(headers = {}) {
    const req = {
      headers,
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    const next = vi.fn();
    return { req, res, next };
  }

  it('should return 401 when neither X-GhostStack-Key nor Authorization is provided', async () => {
    const { req, res, next } = mockReqRes({});
    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('API key is required');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an unknown/invalid API key', async () => {
    const { req, res, next } = mockReqRes({
      'x-ghoststack-key': 'gs_live_nonexistentkey12345678901234567890',
    });
    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid API key');
    expect(next).not.toHaveBeenCalled();
  });

  it('should authenticate successfully with X-GhostStack-Key and attach req.ghostStack', async () => {
    const { apiKey, plaintextKey } = ApiKey.generate({
      projectId: 'proj_ecommerce_prod',
      name: 'Ingestion Key',
      permissions: ['telemetry:write'],
    });
    await apiKeyRepo.save(apiKey);

    const { req, res, next } = mockReqRes({
      'x-ghoststack-key': plaintextKey,
    });
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.ghostStack).toBeDefined();
    expect(req.ghostStack.projectId).toBe('proj_ecommerce_prod');
    expect(req.ghostStack.apiKeyId).toBe(apiKey.keyId);
    expect(req.ghostStack.permissions).toContain('telemetry:write');
  });

  it('should authenticate successfully with Authorization: Bearer <key>', async () => {
    const { apiKey, plaintextKey } = ApiKey.generate({
      projectId: 'proj_bearer_prod',
      name: 'Bearer Key',
      permissions: ['telemetry:write'],
    });
    await apiKeyRepo.save(apiKey);

    const { req, res, next } = mockReqRes({
      authorization: `Bearer ${plaintextKey}`,
    });
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.ghostStack.projectId).toBe('proj_bearer_prod');
  });

  it('should return 401 when API key has been revoked', async () => {
    const { apiKey, plaintextKey } = ApiKey.generate({
      projectId: 'proj_revoked',
    });
    apiKey.revoke();
    await apiKeyRepo.save(apiKey);

    const { req, res, next } = mockReqRes({
      'x-ghoststack-key': plaintextKey,
    });
    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('revoked');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when API key has expired', async () => {
    const { apiKey, plaintextKey } = ApiKey.generate({
      projectId: 'proj_expired',
      expiresAt: new Date(Date.now() - 5000), // 5 seconds ago
    });
    await apiKeyRepo.save(apiKey);

    const { req, res, next } = mockReqRes({
      'x-ghoststack-key': plaintextKey,
    });
    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('expired');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when API key does not have the required permission', async () => {
    const { apiKey, plaintextKey } = ApiKey.generate({
      projectId: 'proj_readonly',
      permissions: ['metrics:read'], // missing telemetry:write
    });
    await apiKeyRepo.save(apiKey);

    const { req, res, next } = mockReqRes({
      'x-ghoststack-key': plaintextKey,
    });
    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Insufficient permissions');
    expect(next).not.toHaveBeenCalled();
  });
});
