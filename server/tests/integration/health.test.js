const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/testApp');

describe('Health Endpoint', () => {
  let app;

  beforeAll(async () => {
    // Connect to a test database
    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test';
    await mongoose.connect(testUri);
    ({ app } = createTestApp());
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('GET /api/health should return 200 with healthy status when DB is connected', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.database.state).toBe('connected');
    expect(res.body.data.version).toBeDefined();
    expect(res.body.data.environment).toBeDefined();
    expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.meta.timestamp).toBeDefined();
  });

  it('GET /api/health should include X-Request-ID header', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('GET /api/health should use client-provided X-Request-ID', async () => {
    const customId = 'test-request-id-123';
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-ID', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('should return 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('/api/nonexistent');
  });

  it('should return rate limit headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });
});
