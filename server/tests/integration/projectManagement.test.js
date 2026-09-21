const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/testApp');
const ApiKey = require('../../src/domain/entities/ApiKey');
const ApiKeyModel = require('../../src/infrastructure/database/models/ApiKeyModel');

describe('Project Management & Developer API Key Management Integration Tests', () => {
  let app, container;

  beforeAll(async () => {
    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test';
    await mongoose.connect(testUri);
    ({ app, container } = createTestApp());
  });

  beforeEach(async () => {
    await container.projectRepository.deleteAll();
    await container.apiKeyRepository.deleteAll();
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.telemetryRepository.deleteAll();
  });

  afterAll(async () => {
    await container.projectRepository.deleteAll();
    await container.apiKeyRepository.deleteAll();
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.telemetryRepository.deleteAll();
    await mongoose.disconnect();
  });

  describe('Project CRUD Endpoints', () => {
    it('POST /api/projects should create a project with generated slug and active status', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({
          name: 'My Store Backend',
          description: 'Production backend services',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.projectId).toBeDefined();
      expect(res.body.data.name).toBe('My Store Backend');
      expect(res.body.data.slug).toBe('my-store-backend');
      expect(res.body.data.description).toBe('Production backend services');
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.updatedAt).toBeDefined();

      const saved = await container.projectRepository.findById(res.body.data.projectId);
      expect(saved).not.toBeNull();
      expect(saved.slug).toBe('my-store-backend');
    });

    it('POST /api/projects should reject duplicate slugs with 409 Conflict', async () => {
      await request(app)
        .post('/api/projects')
        .send({
          name: 'Original Store',
          slug: 'store-app',
        });

      const res = await request(app)
        .post('/api/projects')
        .send({
          name: 'Duplicate Store',
          slug: 'store-app',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('already exists');
    });

    it('POST /api/projects should reject invalid input with 400 Validation Error', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({
          name: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/projects should list all projects and support status filter', async () => {
      const p1 = await request(app).post('/api/projects').send({ name: 'Project One' });
      const p2 = await request(app).post('/api/projects').send({ name: 'Project Two' });
      await request(app).post(`/api/projects/${p2.body.data.projectId}/archive`);

      const resAll = await request(app).get('/api/projects');
      expect(resAll.status).toBe(200);
      expect(resAll.body.success).toBe(true);
      expect(resAll.body.data.projects).toHaveLength(2);

      const resActive = await request(app).get('/api/projects?status=active');
      expect(resActive.status).toBe(200);
      expect(resActive.body.data.projects).toHaveLength(1);
      expect(resActive.body.data.projects[0].projectId).toBe(p1.body.data.projectId);

      const resArchived = await request(app).get('/api/projects?status=archived');
      expect(resArchived.status).toBe(200);
      expect(resArchived.body.data.projects).toHaveLength(1);
      expect(resArchived.body.data.projects[0].projectId).toBe(p2.body.data.projectId);
    });

    it('GET /api/projects/:projectId should return the requested project or 404', async () => {
      const created = await request(app).post('/api/projects').send({ name: 'Single Project' });

      const res = await request(app).get(`/api/projects/${created.body.data.projectId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Single Project');

      const missing = await request(app).get('/api/projects/unknown-proj-999');
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');
    });

    it('POST /api/projects/:projectId/archive should archive project and reject duplicate archive with 409', async () => {
      const created = await request(app).post('/api/projects').send({ name: 'To Archive' });
      const projectId = created.body.data.projectId;

      const resArchive = await request(app).post(`/api/projects/${projectId}/archive`);
      expect(resArchive.status).toBe(200);
      expect(resArchive.body.data.status).toBe('archived');

      // Attempt to archive already archived project -> 409 INVALID_STATE
      const resDouble = await request(app).post(`/api/projects/${projectId}/archive`);
      expect(resDouble.status).toBe(409);
      expect(resDouble.body.error.code).toBe('INVALID_STATE');
      expect(resDouble.body.error.message).toContain('already archived');
    });
  });

  describe('Developer API Key Management Endpoints', () => {
    let projectId;

    beforeEach(async () => {
      const res = await request(app).post('/api/projects').send({
        name: 'API Key Test Project',
        slug: 'api-key-test-project',
      });
      projectId = res.body.data.projectId;
    });

    it('POST /api/projects/:projectId/keys should return plaintextKey strictly once and store only hash', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/keys`)
        .send({
          name: 'Ingestion Key',
          permissions: ['telemetry:write'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.keyId).toBeDefined();
      expect(res.body.data.projectId).toBe(projectId);
      expect(res.body.data.name).toBe('Ingestion Key');
      expect(res.body.data.prefix).toMatch(/^gs_live_[a-f0-9]{8}$/);
      expect(res.body.data.permissions).toEqual(['telemetry:write']);
      expect(res.body.data.plaintextKey).toMatch(/^gs_live_[a-f0-9]{48}$/);

      const plaintextKey = res.body.data.plaintextKey;

      // Verify MongoDB has ONLY the SHA-256 hash and never plaintextKey
      const keyInDb = await ApiKeyModel.findOne({ keyId: res.body.data.keyId }).lean();
      expect(keyInDb).not.toBeNull();
      expect(keyInDb.hashedKey).not.toBe(plaintextKey);
      expect(keyInDb.hashedKey).toBe(ApiKey.hashKey(plaintextKey));
      expect(JSON.stringify(keyInDb)).not.toContain(plaintextKey);
    });

    it('GET /api/projects/:projectId/keys should NEVER return plaintextKey or hashedKey', async () => {
      const gen1 = await request(app)
        .post(`/api/projects/${projectId}/keys`)
        .send({ name: 'Key 1' });
      const gen2 = await request(app)
        .post(`/api/projects/${projectId}/keys`)
        .send({ name: 'Key 2' });

      const res = await request(app).get(`/api/projects/${projectId}/keys`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.keys).toHaveLength(2);

      const responseString = JSON.stringify(res.body);
      expect(responseString).not.toContain(gen1.body.data.plaintextKey);
      expect(responseString).not.toContain(gen2.body.data.plaintextKey);
      expect(responseString).not.toContain('hashedKey');

      for (const k of res.body.data.keys) {
        expect(k).toHaveProperty('keyId');
        expect(k).toHaveProperty('name');
        expect(k).toHaveProperty('prefix');
        expect(k).toHaveProperty('permissions');
        expect(k).toHaveProperty('createdAt');
        expect(k).not.toHaveProperty('plaintextKey');
        expect(k).not.toHaveProperty('hashedKey');
      }
    });

    it('POST /api/projects/:projectId/keys should reject creation if project is archived', async () => {
      await request(app).post(`/api/projects/${projectId}/archive`);

      const res = await request(app)
        .post(`/api/projects/${projectId}/keys`)
        .send({ name: 'Forbidden Key' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE');
      expect(res.body.error.message).toContain('archived');
    });

    it('POST /api/projects/:projectId/keys should reject nonexistent project with 404', async () => {
      const res = await request(app)
        .post('/api/projects/nonexistent-proj-id/keys')
        .send({ name: 'Orphan Key' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('POST /api/projects/:projectId/keys/:keyId/revoke should revoke key and block repeat revocation', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectId}/keys`)
        .send({ name: 'Key to Revoke' });
      const keyId = created.body.data.keyId;

      const resRevoke = await request(app).post(`/api/projects/${projectId}/keys/${keyId}/revoke`);
      expect(resRevoke.status).toBe(200);
      expect(resRevoke.body.data.revokedAt).not.toBeNull();

      // Second revocation attempt -> 409 INVALID_STATE
      const resDouble = await request(app).post(`/api/projects/${projectId}/keys/${keyId}/revoke`);
      expect(resDouble.status).toBe(409);
      expect(resDouble.body.error.code).toBe('INVALID_STATE');
      expect(resDouble.body.error.message).toContain('already revoked');
    });

    it('POST /api/projects/:projectId/keys/:keyId/revoke should reject cross-project key revocation with 403', async () => {
      const otherProj = await request(app).post('/api/projects').send({ name: 'Other Project' });
      const otherKey = await request(app)
        .post(`/api/projects/${otherProj.body.data.projectId}/keys`)
        .send({ name: 'Other Key' });

      // Attempt to revoke other project's key from current project
      const res = await request(app).post(
        `/api/projects/${projectId}/keys/${otherKey.body.data.keyId}/revoke`
      );

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('does not belong to project');
    });
  });

  describe('Telemetry Authorization Integration with Project Lifecycle', () => {
    let projectId, apiKeyPlain;

    beforeEach(async () => {
      const proj = await request(app).post('/api/projects').send({
        name: 'Telemetry Lifecycle Project',
        slug: 'telemetry-lifecycle-project',
      });
      projectId = proj.body.data.projectId;

      const keyRes = await request(app)
        .post(`/api/projects/${projectId}/keys`)
        .send({ name: 'Ingestion Key' });
      apiKeyPlain = keyRes.body.data.plaintextKey;
    });

    it('Active project + valid key should successfully ingest telemetry', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', apiKeyPlain)
        .send({
          sourceService: 'checkout-service',
          targetService: 'payment-service',
          endpoint: '/pay',
          method: 'POST',
          statusCode: 200,
          latencyMs: 45,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event.projectId).toBe(projectId);
    });

    it('Archived project + valid key should be rejected with 403 Forbidden', async () => {
      // Archive the project
      await request(app).post(`/api/projects/${projectId}/archive`);

      // Attempt telemetry ingestion
      const res = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', apiKeyPlain)
        .send({
          sourceService: 'checkout-service',
          targetService: 'payment-service',
          endpoint: '/pay',
          method: 'POST',
          statusCode: 200,
          latencyMs: 45,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('archived');
    });

    it('Revoked key on active project should be rejected with 401 Unauthorized', async () => {
      // Get the key ID from list
      const listRes = await request(app).get(`/api/projects/${projectId}/keys`);
      const keyId = listRes.body.data.keys[0].keyId;

      // Revoke the key
      await request(app).post(`/api/projects/${projectId}/keys/${keyId}/revoke`);

      // Ingestion rejected
      const res = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', apiKeyPlain)
        .send({
          sourceService: 'checkout-service',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('revoked');
    });

    it('Demo reset should not affect created projects or their API keys', async () => {
      // Reset demo
      const resetRes = await request(app).post('/api/demo/reset');
      expect(resetRes.status).toBe(200);

      // Verify custom project and key still exist and work
      const projRes = await request(app).get(`/api/projects/${projectId}`);
      expect(projRes.status).toBe(200);

      const keysRes = await request(app).get(`/api/projects/${projectId}/keys`);
      expect(keysRes.status).toBe(200);
      expect(keysRes.body.data.keys).toHaveLength(1);

      const teleRes = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', apiKeyPlain)
        .send({
          sourceService: 'safe-after-demo-reset-service',
        });
      expect(teleRes.status).toBe(201);
    });
  });
});
