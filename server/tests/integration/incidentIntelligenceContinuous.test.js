const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/testApp');
const Project = require('../../src/domain/entities/Project');
const ApiKey = require('../../src/domain/entities/ApiKey');

describe('Incident Intelligence & Continuous Detection Integration Tests', () => {
  let app, container;
  let alphaKey, betaKey;

  beforeAll(async () => {
    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test';
    await mongoose.connect(testUri);
    ({ app, container } = createTestApp());
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await container.projectRepository.deleteAll();
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.telemetryRepository.deleteAll();
    await container.incidentRepository.deleteAll();
    await container.incidentEventRepository.deleteAll();
    await container.apiKeyRepository.deleteAll();

    // Seed test projects
    await container.projectRepository.save(new Project({
      projectId: 'proj_alpha',
      name: 'Alpha Ecommerce',
      slug: 'alpha-ecommerce',
      status: 'active',
    }));

    await container.projectRepository.save(new Project({
      projectId: 'proj_beta',
      name: 'Beta Store',
      slug: 'beta-store',
      status: 'active',
    }));

    // Seed API keys
    const genAlpha = ApiKey.generate({
      projectId: 'proj_alpha',
      name: 'Alpha Ingestion Key',
      permissions: ['telemetry:write', 'incidents:read'],
    });
    await container.apiKeyRepository.save(genAlpha.apiKey);
    alphaKey = genAlpha.plaintextKey;

    const genBeta = ApiKey.generate({
      projectId: 'proj_beta',
      name: 'Beta Ingestion Key',
      permissions: ['telemetry:write', 'incidents:read'],
    });
    await container.apiKeyRepository.save(genBeta.apiKey);
    betaKey = genBeta.plaintextKey;
  });

  describe('End-to-End Real-Time Ingestion to Incident Detection', () => {
    it('should automatically detect an incident via event bus when telemetry error threshold is breached', async () => {
      const now = new Date();

      // Send 5 errors for payment-service in proj_alpha
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/telemetry')
          .set('X-GhostStack-Key', alphaKey)
          .send({
            sourceService: 'payment-service',
            targetService: 'database',
            statusCode: 500,
            latencyMs: 250,
            timestamp: new Date(now.getTime() + i * 1000).toISOString(),
            environment: 'production',
          });
        expect(res.status).toBe(201);
      }

      // Check that incident was automatically created in proj_alpha
      const incidentsRes = await request(app)
        .get('/api/projects/proj_alpha/incidents')
        .set('X-GhostStack-Key', alphaKey);

      expect(incidentsRes.status).toBe(200);
      expect(incidentsRes.body.data.incidents).toHaveLength(1);

      const incident = incidentsRes.body.data.incidents[0];
      expect(incident.status).toBe('detected');
      expect(incident.projectId).toBe('proj_alpha');
      expect(incident.environment).toBe('production');
      expect(incident.trigger.serviceName).toBe('payment-service');
      expect(incident.trigger.triggers).toContain('error_rate');
      expect(incident.events.length).toBeGreaterThanOrEqual(5);
    });

    it('should deduplicate ongoing errors by updating the existing active incident', async () => {
      const now = new Date();

      // Send 5 initial errors
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/telemetry')
          .set('X-GhostStack-Key', alphaKey)
          .send({
            sourceService: 'checkout-service',
            statusCode: 503,
            timestamp: new Date(now.getTime() + i * 1000).toISOString(),
            environment: 'production',
          });
      }

      const firstCheck = await request(app)
        .get('/api/projects/proj_alpha/incidents')
        .set('X-GhostStack-Key', alphaKey);
      expect(firstCheck.body.data.incidents).toHaveLength(1);
      const incidentId = firstCheck.body.data.incidents[0].incidentId;

      // Send 5 MORE errors for checkout-service
      for (let i = 5; i < 10; i++) {
        await request(app)
          .post('/api/telemetry')
          .set('X-GhostStack-Key', alphaKey)
          .send({
            sourceService: 'checkout-service',
            statusCode: 503,
            timestamp: new Date(now.getTime() + i * 1000).toISOString(),
            environment: 'production',
          });
      }

      // Confirm incident was updated, NOT duplicated
      const secondCheck = await request(app)
        .get('/api/projects/proj_alpha/incidents')
        .set('X-GhostStack-Key', alphaKey);
      expect(secondCheck.body.data.incidents).toHaveLength(1);
      expect(secondCheck.body.data.incidents[0].incidentId).toBe(incidentId);
      expect(secondCheck.body.data.incidents[0].trigger.eventCount).toBe(10);
    });

    it('should automatically resolve incident when traffic recovers', async () => {
      const startTime = new Date('2026-03-01T12:00:00Z');

      // 1. Trigger incident with 5 errors
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/telemetry')
          .set('X-GhostStack-Key', alphaKey)
          .send({
            sourceService: 'auth-service',
            statusCode: 500,
            timestamp: new Date(startTime.getTime() + i * 1000).toISOString(),
            environment: 'production',
          });
      }

      const activeCheck = await container.incidentRepository.findActiveByService('proj_alpha', 'production', 'auth-service');
      expect(activeCheck).not.toBeNull();
      expect(activeCheck.status).toBe('detected');

      // 2. 40 seconds later, 3 healthy events arrive
      const recoveryTime = new Date(startTime.getTime() + 40000);
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/telemetry')
          .set('X-GhostStack-Key', alphaKey)
          .send({
            sourceService: 'auth-service',
            statusCode: 200,
            latencyMs: 100,
            timestamp: new Date(recoveryTime.getTime() + i * 1000).toISOString(),
            environment: 'production',
          });
      }

      // Check incident status in DB
      const resolvedIncident = await container.incidentRepository.findById('proj_alpha', activeCheck.incidentId);
      expect(resolvedIncident.status).toBe('resolved');
      expect(resolvedIncident.endedAt).toBeDefined();

      // Active incident lookup returns null
      const activeAfterRecovery = await container.incidentRepository.findActiveByService('proj_alpha', 'production', 'auth-service');
      expect(activeAfterRecovery).toBeNull();
    });
  });

  describe('Project and Environment Isolation', () => {
    it('should isolate incidents between projects', async () => {
      const now = new Date();

      // Errors only in proj_alpha
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/telemetry')
          .set('X-GhostStack-Key', alphaKey)
          .send({
            sourceService: 'order-service',
            statusCode: 500,
            timestamp: new Date(now.getTime() + i * 1000).toISOString(),
            environment: 'production',
          });
      }

      // proj_alpha has the incident
      const alphaRes = await request(app)
        .get('/api/projects/proj_alpha/incidents')
        .set('X-GhostStack-Key', alphaKey);
      expect(alphaRes.status).toBe(200);
      expect(alphaRes.body.data.incidents).toHaveLength(1);
      const incidentId = alphaRes.body.data.incidents[0].incidentId;

      // proj_beta has NO incidents
      const betaRes = await request(app)
        .get('/api/projects/proj_beta/incidents')
        .set('X-GhostStack-Key', betaKey);
      expect(betaRes.status).toBe(200);
      expect(betaRes.body.data.incidents).toHaveLength(0);

      // Accessing alpha's incident via beta project returns 404
      const crossProjectRes = await request(app)
        .get(`/api/projects/proj_beta/incidents/${incidentId}`)
        .set('X-GhostStack-Key', betaKey);
      expect(crossProjectRes.status).toBe(404);

      // Replay via beta project returns 404
      const crossReplayRes = await request(app)
        .get(`/api/projects/proj_beta/incidents/${incidentId}/replay`)
        .set('X-GhostStack-Key', betaKey);
      expect(crossReplayRes.status).toBe(404);
    });

    it('should enforce API key project match (403 on mismatch)', async () => {
      const res = await request(app)
        .get('/api/projects/proj_beta/incidents')
        .set('X-GhostStack-Key', alphaKey); // Alpha key calling beta URL
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/proj_nonexistent/incidents');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Incident Replay with Project Scoping', () => {
    it('should return incident replay with relativeTimeMs in chronological order', async () => {
      const now = new Date('2026-03-01T14:00:00Z');

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/telemetry')
          .set('X-GhostStack-Key', alphaKey)
          .send({
            sourceService: 'inventory-service',
            statusCode: 500,
            timestamp: new Date(now.getTime() + i * 2000).toISOString(),
            environment: 'production',
          });
      }

      const listRes = await request(app)
        .get('/api/projects/proj_alpha/incidents')
        .set('X-GhostStack-Key', alphaKey);
      const incidentId = listRes.body.data.incidents[0].incidentId;

      const replayRes = await request(app)
        .get(`/api/projects/proj_alpha/incidents/${incidentId}/replay`)
        .set('X-GhostStack-Key', alphaKey);

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.data).toHaveProperty('incident');
      expect(replayRes.body.data).toHaveProperty('timeline');
      expect(replayRes.body.data.timeline.length).toBeGreaterThanOrEqual(5);

      // Verify relativeTimeMs are ordered
      const timeline = replayRes.body.data.timeline;
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].relativeTimeMs).toBeGreaterThanOrEqual(timeline[i - 1].relativeTimeMs);
      }
    });
  });
});
