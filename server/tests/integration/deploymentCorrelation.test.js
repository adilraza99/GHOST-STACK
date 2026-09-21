const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/testApp');
const Project = require('../../src/domain/entities/Project');
const Service = require('../../src/domain/entities/Service');
const Dependency = require('../../src/domain/entities/Dependency');
const Deployment = require('../../src/domain/entities/Deployment');
const Incident = require('../../src/domain/entities/Incident');
const ApiKey = require('../../src/domain/entities/ApiKey');

describe('Deployment History & Change Correlation Integration Tests', () => {
  let app, container;
  let alphaKey, betaKey;

  beforeAll(async () => {
    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test';
    await mongoose.connect(testUri);
    ({ app, container } = createTestApp());
  });

  beforeEach(async () => {
    await container.projectRepository.deleteAll();
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.deploymentRepository.deleteAll();
    await container.incidentRepository.deleteAll();
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

    await container.projectRepository.save(new Project({
      projectId: 'proj_archived',
      name: 'Archived Store',
      slug: 'archived-store',
      status: 'archived',
    }));

    // Seed API keys
    const genAlpha = ApiKey.generate({
      projectId: 'proj_alpha',
      name: 'Alpha Key',
    });
    await container.apiKeyRepository.save(genAlpha.apiKey);
    alphaKey = genAlpha.plaintextKey;

    const genBeta = ApiKey.generate({
      projectId: 'proj_beta',
      name: 'Beta Key',
    });
    await container.apiKeyRepository.save(genBeta.apiKey);
    betaKey = genBeta.plaintextKey;
  });

  afterAll(async () => {
    await container.projectRepository.deleteAll();
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.deploymentRepository.deleteAll();
    await container.incidentRepository.deleteAll();
    await container.apiKeyRepository.deleteAll();
    await mongoose.disconnect();
  });

  describe('Project-Scoped Deployment Recording (POST /api/projects/:projectId/deployments)', () => {
    it('should create deployment for project', async () => {
      const res = await request(app)
        .post('/api/projects/proj_alpha/deployments')
        .send({
          serviceId: 'payment-service',
          previousVersion: '1.0.0',
          newVersion: '1.1.0',
          environment: 'production',
          metadata: { gitCommit: 'abc1234' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deploymentId).toBeDefined();
      expect(res.body.data.projectId).toBe('proj_alpha');
      expect(res.body.data.serviceId).toBe('payment-service');
      expect(res.body.data.previousVersion).toBe('1.0.0');
      expect(res.body.data.newVersion).toBe('1.1.0');
      expect(res.body.data.metadata.gitCommit).toBe('abc1234');
    });

    it('should allow initial deployment with previousVersion null', async () => {
      const res = await request(app)
        .post('/api/projects/proj_alpha/deployments')
        .send({
          serviceId: 'auth-service',
          previousVersion: null,
          newVersion: '1.0.0',
          environment: 'production',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.previousVersion).toBeNull();
      expect(res.body.data.newVersion).toBe('1.0.0');
    });

    it('should reject deployment when previousVersion equals newVersion', async () => {
      const res = await request(app)
        .post('/api/projects/proj_alpha/deployments')
        .send({
          serviceId: 'payment-service',
          previousVersion: '1.1.0',
          newVersion: '1.1.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('different');
    });

    it('should reject deployment for archived project', async () => {
      const res = await request(app)
        .post('/api/projects/proj_archived/deployments')
        .send({
          serviceId: 'payment-service',
          previousVersion: '1.0.0',
          newVersion: '1.1.0',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('archived');
    });

    it('should reject deployment for non-existent project', async () => {
      const res = await request(app)
        .post('/api/projects/proj_nonexistent/deployments')
        .send({
          serviceId: 'payment-service',
          previousVersion: '1.0.0',
          newVersion: '1.1.0',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject deployment if API key does not match target project', async () => {
      const res = await request(app)
        .post('/api/projects/proj_alpha/deployments')
        .set('X-GhostStack-Key', betaKey) // Beta key sent to Alpha route
        .send({
          serviceId: 'payment-service',
          previousVersion: '1.0.0',
          newVersion: '1.1.0',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Project-Scoped Deployment Listing & Detail (GET)', () => {
    let depAlpha1, depAlpha2, depBeta;

    beforeEach(async () => {
      const resA1 = await request(app)
        .post('/api/projects/proj_alpha/deployments')
        .send({
          serviceId: 'payment-service',
          previousVersion: '1.0.0',
          newVersion: '1.1.0',
          environment: 'production',
        });
      depAlpha1 = resA1.body.data;

      const resA2 = await request(app)
        .post('/api/projects/proj_alpha/deployments')
        .send({
          serviceId: 'order-service',
          previousVersion: '1.0.0',
          newVersion: '1.0.1',
          environment: 'staging',
        });
      depAlpha2 = resA2.body.data;

      const resB = await request(app)
        .post('/api/projects/proj_beta/deployments')
        .send({
          serviceId: 'payment-service',
          previousVersion: '2.0.0',
          newVersion: '2.1.0',
          environment: 'production',
        });
      depBeta = resB.body.data;
    });

    it('GET /api/projects/:projectId/deployments should return only deployments for that project', async () => {
      const res = await request(app).get('/api/projects/proj_alpha/deployments');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deployments).toHaveLength(2);
      const ids = res.body.data.deployments.map((d) => d.deploymentId);
      expect(ids).toContain(depAlpha1.deploymentId);
      expect(ids).toContain(depAlpha2.deploymentId);
      expect(ids).not.toContain(depBeta.deploymentId);
    });

    it('GET /api/projects/:projectId/deployments with filters', async () => {
      const res = await request(app)
        .get('/api/projects/proj_alpha/deployments')
        .query({ environment: 'production' });

      expect(res.status).toBe(200);
      expect(res.body.data.deployments).toHaveLength(1);
      expect(res.body.data.deployments[0].deploymentId).toBe(depAlpha1.deploymentId);
    });

    it('GET /api/projects/:projectId/deployments/:deploymentId should return deployment detail', async () => {
      const res = await request(app).get(`/api/projects/proj_alpha/deployments/${depAlpha1.deploymentId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deploymentId).toBe(depAlpha1.deploymentId);
      expect(res.body.data.projectId).toBe('proj_alpha');
    });

    it('GET /api/projects/:projectId/deployments/:deploymentId should return 404 for cross-project access', async () => {
      // Querying Alpha deployment through Beta route
      const res = await request(app).get(`/api/projects/proj_beta/deployments/${depAlpha1.deploymentId}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Incident Change Correlation (GET /api/projects/:projectId/incidents/:id/correlations)', () => {
    it('should correlate direct, upstream, and downstream changes with structured evidence', async () => {
      // 1. Setup services for Alpha
      const payment = await container.serviceRepository.save(new Service({
        serviceId: 'svc_pay_alpha',
        name: 'payment-service',
        environment: 'production',
        projectId: 'proj_alpha',
      }));

      const checkout = await container.serviceRepository.save(new Service({
        serviceId: 'svc_chk_alpha',
        name: 'checkout-service',
        environment: 'production',
        projectId: 'proj_alpha',
      }));

      // checkout depends on payment
      await container.dependencyRepository.save(new Dependency({
        projectId: 'proj_alpha',
        sourceServiceId: checkout.serviceId,
        targetServiceId: payment.serviceId,
        dependencyType: 'sync',
      }));

      const now = new Date('2026-09-21T18:00:00Z');

      // 2. Deploy payment-service 10 minutes before incident
      const depPay = await container.deploymentRepository.save(new Deployment({
        projectId: 'proj_alpha',
        serviceId: payment.serviceId,
        previousVersion: '1.0.0',
        newVersion: '1.1.0',
        environment: 'production',
        deployedAt: new Date(now.getTime() - 10 * 60 * 1000),
      }));

      // 3. Deploy checkout-service 5 minutes before incident
      const depChk = await container.deploymentRepository.save(new Deployment({
        projectId: 'proj_alpha',
        serviceId: checkout.serviceId,
        previousVersion: '2.0.0',
        newVersion: '2.0.1',
        environment: 'production',
        deployedAt: new Date(now.getTime() - 5 * 60 * 1000),
      }));

      // 4. Create Incident on checkout-service at `now`
      const incident = await container.incidentRepository.save(new Incident({
        projectId: 'proj_alpha',
        title: 'Checkout service failure',
        severity: 'critical',
        trigger: {
          serviceId: checkout.serviceId,
          serviceName: checkout.name,
          environment: 'production',
        },
        startedAt: now,
      }));

      // 5. Query correlations
      const res = await request(app)
        .get(`/api/projects/proj_alpha/incidents/${incident.incidentId}/correlations`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.correlations).toHaveLength(2);

      // Deterministic sort: checkout (5m ago) before payment (10m ago)
      const [first, second] = res.body.data.correlations;

      // First should be direct deployment on checkout
      expect(first.deploymentId).toBe(depChk.deploymentId);
      expect(first.relationship).toBe('direct');
      expect(first.confidence).toBe('high');
      expect(first.timeDeltaMs).toBe(5 * 60 * 1000);
      expect(first.evidence.length).toBeGreaterThan(0);

      // Second should be upstream dependency deployment on payment
      expect(second.deploymentId).toBe(depPay.deploymentId);
      expect(second.relationship).toBe('upstream');
      expect(second.confidence).toBe('medium');
      expect(second.timeDeltaMs).toBe(10 * 60 * 1000);
      expect(second.evidence.length).toBeGreaterThan(0);
    });

    it('should enforce environment isolation: staging deployments do not correlate to prod incidents', async () => {
      const svc = await container.serviceRepository.save(new Service({
        name: 'inventory-service',
        environment: 'production',
        projectId: 'proj_alpha',
      }));

      const now = new Date('2026-09-21T19:00:00Z');

      // Staging deployment 4 minutes prior
      await container.deploymentRepository.save(new Deployment({
        projectId: 'proj_alpha',
        serviceId: svc.serviceId,
        previousVersion: '1.0.0',
        newVersion: '1.1.0-beta',
        environment: 'staging',
        deployedAt: new Date(now.getTime() - 4 * 60 * 1000),
      }));

      // Production incident
      const incident = await container.incidentRepository.save(new Incident({
        projectId: 'proj_alpha',
        title: 'Production Inventory Outage',
        severity: 'high',
        trigger: {
          serviceId: svc.serviceId,
          serviceName: svc.name,
          environment: 'production',
        },
        startedAt: now,
      }));

      const res = await request(app)
        .get(`/api/projects/proj_alpha/incidents/${incident.incidentId}/correlations`);

      expect(res.status).toBe(200);
      expect(res.body.data.correlations).toHaveLength(0);
    });

    it('should enforce project isolation: Project B cannot correlate Project A incidents', async () => {
      const incidentA = await container.incidentRepository.save(new Incident({
        projectId: 'proj_alpha',
        title: 'Alpha Secret Incident',
        severity: 'critical',
        trigger: { serviceName: 'secret-service' },
        startedAt: new Date(),
      }));

      const res = await request(app)
        .get(`/api/projects/proj_beta/incidents/${incidentA.incidentId}/correlations`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Preserved Legacy Endpoints', () => {
    it('POST /api/deployments should work with default project', async () => {
      const res = await request(app)
        .post('/api/deployments')
        .send({
          serviceId: 'legacy-service',
          previousVersion: '0.1.0',
          newVersion: '0.2.0',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.projectId).toBe('project-default');
    });

    it('POST /api/deployments/analyze should function correctly', async () => {
      const svc = await container.serviceRepository.save(new Service({
        name: 'legacy-analyze',
        version: '1.0.0',
      }));

      const res = await request(app)
        .post('/api/deployments/analyze')
        .send({
          serviceId: svc.serviceId,
          newVersion: '2.0.0',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deployment).toBeDefined();
      expect(res.body.data.totalPotentiallyAffected).toBeDefined();
    });
  });
});
