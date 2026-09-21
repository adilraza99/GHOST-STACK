const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/testApp');
const ApiKey = require('../../src/domain/entities/ApiKey');
const Project = require('../../src/domain/entities/Project');

describe('Project Isolation & Ingestion Security Integration Tests', () => {
  let app, container;
  let alphaKey, betaKey, expiredKey, revokedKey;

  beforeAll(async () => {
    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test';
    await mongoose.connect(testUri);
    ({ app, container } = createTestApp());
  });

  beforeEach(async () => {
    // Clear all collections between test cases
    await container.projectRepository.deleteAll();
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.telemetryRepository.deleteAll();
    await container.incidentRepository.deleteAll();
    await container.incidentEventRepository.deleteAll();
    await container.deploymentRepository.deleteAll();
    await container.apiKeyRepository.deleteAll();

    // Seed active projects
    await container.projectRepository.save(new Project({
      projectId: 'proj_alpha',
      name: 'Project Alpha',
      slug: 'proj-alpha',
      status: 'active',
    }));
    await container.projectRepository.save(new Project({
      projectId: 'proj_beta',
      name: 'Project Beta',
      slug: 'proj-beta',
      status: 'active',
    }));

    // Create Project Alpha key
    const genAlpha = ApiKey.generate({
      projectId: 'proj_alpha',
      name: 'Project Alpha Ingestion Key',
    });
    await container.apiKeyRepository.save(genAlpha.apiKey);
    alphaKey = genAlpha.plaintextKey;

    // Create Project Beta key
    const genBeta = ApiKey.generate({
      projectId: 'proj_beta',
      name: 'Project Beta Ingestion Key',
    });
    await container.apiKeyRepository.save(genBeta.apiKey);
    betaKey = genBeta.plaintextKey;

    // Create Expired key
    const genExpired = ApiKey.generate({
      projectId: 'proj_alpha',
      name: 'Expired Key',
      expiresAt: new Date(Date.now() - 60000),
    });
    await container.apiKeyRepository.save(genExpired.apiKey);
    expiredKey = genExpired.plaintextKey;

    // Create Revoked key
    const genRevoked = ApiKey.generate({
      projectId: 'proj_alpha',
      name: 'Revoked Key',
    });
    genRevoked.apiKey.revoke();
    await container.apiKeyRepository.save(genRevoked.apiKey);
    revokedKey = genRevoked.plaintextKey;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('Ingestion Security Boundary', () => {
    it('should reject unauthenticated POST /api/telemetry with 401', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .send({
          sourceService: 'order-service',
          statusCode: 200,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('API key is required');
    });

    it('should reject invalid API key with 401', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', 'gs_live_invalidkey12345678901234567890')
        .send({
          sourceService: 'order-service',
          statusCode: 200,
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Invalid API key');
    });

    it('should reject expired API key with 401', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', expiredKey)
        .send({
          sourceService: 'order-service',
          statusCode: 200,
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain('expired');
    });

    it('should reject revoked API key with 401', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', revokedKey)
        .send({
          sourceService: 'order-service',
          statusCode: 200,
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain('revoked');
    });

    it('should reject unauthenticated batch telemetry with 401', async () => {
      const res = await request(app)
        .post('/api/telemetry/batch')
        .send({
          events: [{ sourceService: 's1', statusCode: 200 }],
        });

      expect(res.status).toBe(401);
    });

    it('should accept valid telemetry with Authorization: Bearer <key>', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .set('Authorization', `Bearer ${alphaKey}`)
        .send({
          sourceService: 'bearer-test-service',
          statusCode: 200,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event.projectId).toBe('proj_alpha');
    });
  });

  describe('Tenant Project Isolation', () => {
    it('should isolate identically named services across two projects', async () => {
      // 1. Ingest telemetry from Project Alpha for payment-service
      const resAlpha = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', alphaKey)
        .send({
          sourceService: 'checkout-service',
          targetService: 'payment-service',
          environment: 'production',
          statusCode: 200,
        });

      expect(resAlpha.status).toBe(201);
      const alphaPaymentId = resAlpha.body.data.targetService.serviceId;
      expect(resAlpha.body.data.targetService.projectId).toBe('proj_alpha');

      // 2. Ingest telemetry from Project Beta for identically named payment-service
      const resBeta = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', betaKey)
        .send({
          sourceService: 'checkout-service',
          targetService: 'payment-service',
          environment: 'production',
          statusCode: 200,
        });

      expect(resBeta.status).toBe(201);
      const betaPaymentId = resBeta.body.data.targetService.serviceId;
      expect(resBeta.body.data.targetService.projectId).toBe('proj_beta');

      // 3. Verify two completely distinct service records were created
      expect(alphaPaymentId).not.toBe(betaPaymentId);

      const allServices = await container.serviceRepository.findAll();
      expect(allServices).toHaveLength(4); // Alpha: checkout, payment; Beta: checkout, payment

      const alphaServices = await container.serviceRepository.findAll({ projectId: 'proj_alpha' });
      expect(alphaServices).toHaveLength(2);
      expect(alphaServices.every((s) => s.projectId === 'proj_alpha')).toBe(true);

      const betaServices = await container.serviceRepository.findAll({ projectId: 'proj_beta' });
      expect(betaServices).toHaveLength(2);
      expect(betaServices.every((s) => s.projectId === 'proj_beta')).toBe(true);
    });

    it('should isolate dependency edges across projects', async () => {
      // Project Alpha: frontend -> api-gateway
      await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', alphaKey)
        .send({
          sourceService: 'frontend',
          targetService: 'api-gateway',
          dependencyType: 'sync',
          statusCode: 200,
        });

      // Project Beta: frontend -> api-gateway
      await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', betaKey)
        .send({
          sourceService: 'frontend',
          targetService: 'api-gateway',
          dependencyType: 'sync',
          statusCode: 200,
        });

      const alphaDeps = await container.dependencyRepository.findAll({ projectId: 'proj_alpha' });
      const betaDeps = await container.dependencyRepository.findAll({ projectId: 'proj_beta' });

      expect(alphaDeps).toHaveLength(1);
      expect(betaDeps).toHaveLength(1);
      expect(alphaDeps[0].dependencyId).not.toBe(betaDeps[0].dependencyId);
      expect(alphaDeps[0].projectId).toBe('proj_alpha');
      expect(betaDeps[0].projectId).toBe('proj_beta');
    });

    it('should reject spoofed projectId in request body with 403 Forbidden', async () => {
      // Caller authenticated as Project Alpha, but attempts to claim projectId: 'proj_beta'
      const res = await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', alphaKey)
        .send({
          projectId: 'proj_beta',
          sourceService: 'malicious-spoof',
          statusCode: 200,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('does not match authenticated project');
    });

    it('should reject spoofed projectId in batch telemetry with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/telemetry/batch')
        .set('X-GhostStack-Key', alphaKey)
        .send({
          events: [
            { sourceService: 's1', statusCode: 200 },
            { projectId: 'proj_beta', sourceService: 's2', statusCode: 200 },
          ],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Demo Reset Safety Boundary', () => {
    it('should clear only project-demo data and leave external project data completely untouched', async () => {
      // 1. Ingest real external customer telemetry under Project Alpha
      await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', alphaKey)
        .send({
          sourceService: 'production-auth',
          targetService: 'production-db',
          statusCode: 200,
        });

      // 2. Ingest real external customer telemetry under Project Beta
      await request(app)
        .post('/api/telemetry')
        .set('X-GhostStack-Key', betaKey)
        .send({
          sourceService: 'beta-cart',
          targetService: 'beta-payment',
          statusCode: 200,
        });

      // 3. Run Demo Simulator scenario (seeds project-demo)
      const demoRes = await request(app).post('/api/demo/scenarios/normal-traffic');
      expect(demoRes.status).toBe(200);

      // Verify all services exist
      const beforeServices = await container.serviceRepository.findAll();
      const beforeAlpha = beforeServices.filter((s) => s.projectId === 'proj_alpha');
      const beforeBeta = beforeServices.filter((s) => s.projectId === 'proj_beta');
      const beforeDemo = beforeServices.filter((s) => s.projectId === 'project-demo');

      expect(beforeAlpha).toHaveLength(2);
      expect(beforeBeta).toHaveLength(2);
      expect(beforeDemo.length).toBeGreaterThan(0);

      // 4. Trigger Demo Reset
      const resetRes = await request(app).post('/api/demo/reset').send({});
      expect(resetRes.status).toBe(200);

      // 5. Verify demo data is deleted, but Project Alpha and Project Beta remain 100% intact!
      const afterServices = await container.serviceRepository.findAll();
      const afterAlpha = afterServices.filter((s) => s.projectId === 'proj_alpha');
      const afterBeta = afterServices.filter((s) => s.projectId === 'proj_beta');
      const afterDemo = afterServices.filter((s) => s.projectId === 'project-demo');

      expect(afterDemo).toHaveLength(0); // Demo data wiped
      expect(afterAlpha).toHaveLength(2); // Project Alpha completely untouched!
      expect(afterBeta).toHaveLength(2);  // Project Beta completely untouched!

      const alphaNames = afterAlpha.map((s) => s.name);
      expect(alphaNames).toContain('production-auth');
      expect(alphaNames).toContain('production-db');
    });
  });
});
