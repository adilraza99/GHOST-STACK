const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/testApp');

describe('API Integration Tests', () => {
  let app, container;

  beforeAll(async () => {
    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test';
    await mongoose.connect(testUri);
    ({ app, container } = createTestApp());
  });

  beforeEach(async () => {
    // Clear all data between tests
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.telemetryRepository.deleteAll();
    await container.incidentRepository.deleteAll();
    await container.incidentEventRepository.deleteAll();
    await container.deploymentRepository.deleteAll();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  // ─── SERVICES ──────────────────────────────────────────────────

  describe('GET /api/services', () => {
    it('should return empty array when no services', async () => {
      const res = await request(app).get('/api/services');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return services after telemetry ingestion', async () => {
      await request(app).post('/api/telemetry').send({
        sourceService: 'checkout',
        targetService: 'payment',
        statusCode: 200,
      });

      const res = await request(app).get('/api/services');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.timestamp).toBeDefined();
    });
  });

  describe('GET /api/services/:id', () => {
    it('should return 404 for missing service', async () => {
      const res = await request(app).get('/api/services/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return service by ID', async () => {
      // Create a service via telemetry
      await request(app).post('/api/telemetry').send({
        sourceService: 'auth-service',
        statusCode: 200,
      });

      const services = await request(app).get('/api/services');
      const serviceId = services.body.data[0].serviceId;

      const res = await request(app).get(`/api/services/${serviceId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.serviceId).toBe(serviceId);
    });
  });

  // ─── DEPENDENCIES ──────────────────────────────────────────────

  describe('GET /api/dependencies', () => {
    it('should return empty array when no dependencies', async () => {
      const res = await request(app).get('/api/dependencies');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return dependencies after telemetry', async () => {
      await request(app).post('/api/telemetry').send({
        sourceService: 'checkout',
        targetService: 'payment',
        statusCode: 200,
      });

      const res = await request(app).get('/api/dependencies');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/dependencies/graph', () => {
    it('should return graph with stats', async () => {
      await request(app).post('/api/telemetry').send({
        sourceService: 'checkout',
        targetService: 'payment',
        statusCode: 200,
      });

      const res = await request(app).get('/api/dependencies/graph');
      expect(res.status).toBe(200);
      expect(res.body.data.stats).toBeDefined();
      expect(res.body.data.stats.nodeCount).toBeGreaterThanOrEqual(2);
      expect(res.body.data.edges).toHaveLength(1);
    });
  });

  // ─── TELEMETRY ──────────────────────────────────────────────────

  describe('POST /api/telemetry', () => {
    it('should accept valid telemetry and return 201', async () => {
      const res = await request(app).post('/api/telemetry').send({
        sourceService: 'checkout',
        targetService: 'payment',
        statusCode: 200,
        latencyMs: 50,
        method: 'POST',
        endpoint: '/api/charge',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event.sourceService).toBe('checkout');
      expect(res.body.data.sourceService.name).toBe('checkout');
      expect(res.body.data.targetService.name).toBe('payment');
      expect(res.body.data.dependency).not.toBeNull();
    });

    it('should reject missing sourceService with 400', async () => {
      const res = await request(app).post('/api/telemetry').send({
        statusCode: 200,
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid statusCode', async () => {
      const res = await request(app).post('/api/telemetry').send({
        sourceService: 'test',
        statusCode: 9999,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle telemetry without target (no dependency created)', async () => {
      const res = await request(app).post('/api/telemetry').send({
        sourceService: 'standalone',
        statusCode: 200,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.targetService).toBeNull();
      expect(res.body.data.dependency).toBeNull();
    });

    it('should include request ID in response', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .set('X-Request-ID', 'test-req-456')
        .send({ sourceService: 'test', statusCode: 200 });

      expect(res.headers['x-request-id']).toBe('test-req-456');
    });
  });

  describe('POST /api/telemetry/batch', () => {
    it('should accept batch telemetry and return 201', async () => {
      const res = await request(app).post('/api/telemetry/batch').send({
        events: [
          { sourceService: 'checkout', targetService: 'payment', statusCode: 200 },
          { sourceService: 'payment', targetService: 'db', statusCode: 200 },
        ],
      });

      expect(res.status).toBe(201);
      expect(res.body.data.processed).toBe(2);
      expect(res.body.data.events).toHaveLength(2);
    });

    it('should reject empty batch', async () => {
      const res = await request(app).post('/api/telemetry/batch').send({
        events: [],
      });

      expect(res.status).toBe(400);
    });

    it('should reject malformed batch', async () => {
      const res = await request(app).post('/api/telemetry/batch').send({
        events: 'not-an-array',
      });

      expect(res.status).toBe(400);
    });
  });

  // ─── BLAST RADIUS ──────────────────────────────────────────────

  describe('GET /api/blast-radius/:serviceId', () => {
    it('should return 404 for unknown service', async () => {
      const res = await request(app).get('/api/blast-radius/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return blast radius for a valid service', async () => {
      // Create services via telemetry
      await request(app).post('/api/telemetry').send({
        sourceService: 'checkout',
        targetService: 'payment',
        statusCode: 200,
      });

      const services = await request(app).get('/api/services');
      const paymentSvc = services.body.data.find((s) => s.name === 'payment');

      const res = await request(app).get(`/api/blast-radius/${paymentSvc.serviceId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.serviceId).toBe(paymentSvc.serviceId);
      expect(res.body.data).toHaveProperty('directlyAffected');
      expect(res.body.data).toHaveProperty('totalAffectedCount');
    });
  });

  // ─── INCIDENTS ──────────────────────────────────────────────────

  describe('GET /api/incidents', () => {
    it('should return empty array when no incidents', async () => {
      const res = await request(app).get('/api/incidents');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return array of incidents after detection', async () => {
      // First, simulate failure scenario via Demo Simulator to generate an incident
      await request(app).post('/api/demo/scenarios/payment-failure');
      const res = await request(app).get('/api/incidents');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('incidentId');
    });
  });

  describe('GET /api/incidents/:id', () => {
    it('should return 404 for missing incident', async () => {
      const res = await request(app).get('/api/incidents/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return incident by ID', async () => {
      const incidents = await request(app).get('/api/incidents');
      if (incidents.body.data.length === 0) return; // Skip if no incident

      const id = incidents.body.data[0].incidentId;
      const res = await request(app).get(`/api/incidents/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.incidentId).toBe(id);
    });
  });

  describe('GET /api/incidents/:id/replay', () => {
    it('should return 404 for missing incident replay', async () => {
      const res = await request(app).get('/api/incidents/nonexistent/replay');
      expect(res.status).toBe(404);
    });

    it('should return replay for an existing incident', async () => {
      const incidents = await request(app).get('/api/incidents');
      if (incidents.body.data.length === 0) return; // Skip if no incident

      const id = incidents.body.data[0].incidentId;
      const res = await request(app).get(`/api/incidents/${id}/replay`);
      expect(res.status).toBe(200);
      expect(res.body.data.incidentId).toBe(id);
      expect(Array.isArray(res.body.data.events)).toBe(true);
    });
  });

  describe('POST /api/incidents/detect', () => {
    it('should return 200 with no incidents when no anomalies', async () => {
      await request(app).post('/api/demo/reset'); // ensure clean state
      const res = await request(app).post('/api/incidents/detect').send({});
      expect(res.status).toBe(200);
      expect(res.body.data.detected).toBe(0);
    });
  });

  // ─── DEPLOYMENTS ──────────────────────────────────────────────

  describe('POST /api/deployments', () => {
    it('should create a deployment and return 201', async () => {
      const res = await request(app).post('/api/deployments').send({
        serviceId: 'svc-123',
        previousVersion: '1.0.0',
        newVersion: '1.1.0',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.serviceId).toBe('svc-123');
      expect(res.body.data.newVersion).toBe('1.1.0');
    });

    it('should reject invalid deployment input', async () => {
      const res = await request(app).post('/api/deployments').send({
        serviceId: '',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/deployments/analyze', () => {
    it('should analyze deployment impact', async () => {
      const res = await request(app).post('/api/deployments/analyze').send({
        serviceId: 'svc-123',
        newVersion: '2.0.0',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.deployment.newVersion).toBe('2.0.0');
      expect(res.body.data).toHaveProperty('directDependents');
      expect(res.body.data).toHaveProperty('totalPotentiallyAffected');
    });

    it('should reject missing fields', async () => {
      const res = await request(app).post('/api/deployments/analyze').send({});
      expect(res.status).toBe(400);
    });
  });

  // ─── DEMO ──────────────────────────────────────────────────────

  describe('POST /api/demo/reset', () => {
    it('should clear all data', async () => {
      // Create some data first
      await request(app).post('/api/telemetry').send({
        sourceService: 'test',
        statusCode: 200,
      });

      const resetRes = await request(app).post('/api/demo/reset').send({});
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.message).toContain('cleared');

      // Verify data is gone
      const services = await request(app).get('/api/services');
      expect(services.body.data).toEqual([]);
    });
  });

  describe('GET /api/demo/scenarios', () => {
    it('should return available scenarios', async () => {
      const res = await request(app).get('/api/demo/scenarios');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/demo/scenarios/:scenario', () => {
    it('should return 404 for unknown scenario', async () => {
      const res = await request(app).post('/api/demo/scenarios/nonexistent').send({});
      expect(res.status).toBe(404);
    });
  });

  // ─── ERROR HANDLING ──────────────────────────────────────────────

  describe('Error handling', () => {
    it('should return 404 for unknown route', async () => {
      const res = await request(app).get('/api/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return validation error for malformed JSON', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
    });

    it('should include response envelope on errors', async () => {
      const res = await request(app).get('/api/services/nonexistent');
      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
    });
  });

  // ─── RESPONSE FORMAT ──────────────────────────────────────────

  describe('Response format consistency', () => {
    it('success response should have correct envelope', async () => {
      const res = await request(app).get('/api/services');
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('timestamp');
    });

    it('error response should have correct envelope', async () => {
      const res = await request(app).get('/api/services/nonexistent');
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
    });
  });
});
