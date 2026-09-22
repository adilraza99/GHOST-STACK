const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/testApp');
const ApiKey = require('../../src/domain/entities/ApiKey');
const Project = require('../../src/domain/entities/Project');

describe('Production OpenTelemetry (OTLP) Ingestion Integration Tests', () => {
  let app, container;
  let alphaKey, betaKey;
  const sampleTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';

  beforeAll(async () => {
    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test';
    await mongoose.connect(testUri);
    ({ app, container } = createTestApp());
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clear all repositories
    await container.projectRepository.deleteAll();
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.telemetryRepository.deleteAll();
    await container.incidentRepository.deleteAll();
    await container.incidentEventRepository.deleteAll();
    await container.deploymentRepository.deleteAll();
    await container.apiKeyRepository.deleteAll();

    // Create Project Alpha
    await container.projectRepository.save(new Project({
      projectId: 'proj_alpha',
      name: 'Project Alpha',
      slug: 'project-alpha',
      status: 'active',
    }));

    // Create Project Beta
    await container.projectRepository.save(new Project({
      projectId: 'proj_beta',
      name: 'Project Beta',
      slug: 'project-beta',
      status: 'active',
    }));

    // API Key for Alpha
    const genAlpha = ApiKey.generate({
      projectId: 'proj_alpha',
      name: 'Alpha OTLP Key',
      permissions: ['telemetry:write'],
    });
    await container.apiKeyRepository.save(genAlpha.apiKey);
    alphaKey = genAlpha.plaintextKey;

    // API Key for Beta
    const genBeta = ApiKey.generate({
      projectId: 'proj_beta',
      name: 'Beta OTLP Key',
      permissions: ['telemetry:write'],
    });
    await container.apiKeyRepository.save(genBeta.apiKey);
    betaKey = genBeta.plaintextKey;
  });

  describe('1. Full Canonical Pipeline & Multi-Tier Distributed Trace', () => {
    it('should ingest a realistic Service A -> Service B -> Service C trace via /v1/traces', async () => {
      // Realistic multi-tier trace:
      // Frontend (Service A) calls OrderService (Service B), which calls PaymentService (Service C)
      const payload = {
        resourceSpans: [
          // Service A: Web Frontend
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'web-frontend' } },
                { key: 'deployment.environment.name', value: { stringValue: 'production' } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: sampleTraceId,
                    spanId: '0000000000000001',
                    name: 'checkout_click',
                    kind: 3, // CLIENT
                    startTimeUnixNano: '1726999999000000000',
                    endTimeUnixNano: '1726999999120000000', // 120ms
                    attributes: [
                      { key: 'http.method', value: { stringValue: 'POST' } },
                      { key: 'http.status_code', value: { intValue: 200 } },
                      { key: 'peer.service', value: { stringValue: 'order-service' } },
                    ],
                  },
                ],
              },
            ],
          },
          // Service B: Order Service
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'order-service' } },
                { key: 'deployment.environment.name', value: { stringValue: 'production' } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  // Server span: receiving call from frontend
                  {
                    traceId: sampleTraceId,
                    spanId: '0000000000000002',
                    parentSpanId: '0000000000000001',
                    name: 'POST /api/orders',
                    kind: 2, // SERVER
                    startTimeUnixNano: '1726999999010000000',
                    endTimeUnixNano: '1726999999110000000', // 100ms
                    attributes: [
                      { key: 'http.method', value: { stringValue: 'POST' } },
                      { key: 'http.status_code', value: { intValue: 200 } },
                    ],
                  },
                  // Client span: calling Payment Service
                  {
                    traceId: sampleTraceId,
                    spanId: '0000000000000003',
                    parentSpanId: '0000000000000002',
                    name: 'process_payment',
                    kind: 3, // CLIENT
                    startTimeUnixNano: '1726999999030000000',
                    endTimeUnixNano: '1726999999080000000', // 50ms
                    attributes: [
                      { key: 'http.method', value: { stringValue: 'POST' } },
                      { key: 'http.status_code', value: { intValue: 200 } },
                      { key: 'peer.service', value: { stringValue: 'payment-service' } },
                    ],
                  },
                ],
              },
            ],
          },
          // Service C: Payment Service
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'payment-service' } },
                { key: 'deployment.environment.name', value: { stringValue: 'production' } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  // Server span: handling payment
                  {
                    traceId: sampleTraceId,
                    spanId: '0000000000000004',
                    parentSpanId: '0000000000000003',
                    name: 'POST /charge',
                    kind: 2, // SERVER
                    startTimeUnixNano: '1726999999035000000',
                    endTimeUnixNano: '1726999999075000000', // 40ms
                    attributes: [
                      { key: 'http.method', value: { stringValue: 'POST' } },
                      { key: 'http.status_code', value: { intValue: 200 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const res = await request(app)
        .post('/v1/traces')
        .set('X-GhostStack-Key', alphaKey)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.partialSuccess).toEqual({ rejectedSpans: 0 });

      // 1. Verify service discovery in serviceRepository
      const services = await container.serviceRepository.findAll({ projectId: 'proj_alpha' });
      const serviceNames = services.map((s) => s.name).sort();
      expect(serviceNames).toEqual(['order-service', 'payment-service', 'web-frontend']);

      // 2. Verify dependency discovery:
      // web-frontend -> order-service
      // order-service -> payment-service
      const webFrontend = services.find((s) => s.name === 'web-frontend');
      const orderService = services.find((s) => s.name === 'order-service');
      const paymentService = services.find((s) => s.name === 'payment-service');

      const frontendDeps = await container.dependencyRepository.findBySource(webFrontend.serviceId, 'proj_alpha');
      expect(frontendDeps).toHaveLength(1);
      expect(frontendDeps[0].targetServiceId).toBe(orderService.serviceId);

      const orderDeps = await container.dependencyRepository.findBySource(orderService.serviceId, 'proj_alpha');
      expect(orderDeps).toHaveLength(1);
      expect(orderDeps[0].targetServiceId).toBe(paymentService.serviceId);

      // 3. Verify telemetry events persisted with deterministic eventIds
      const events = await container.telemetryRepository.findByTraceId(sampleTraceId);
      expect(events).toHaveLength(4);
      for (const ev of events) {
        expect(ev.projectId).toBe('proj_alpha');
        expect(ev.environment).toBe('production');
        expect(ev.eventId).toMatch(/^otlp_4bf92f3577b34da6a3ce929d0e0e4736_/);
      }
    });
  });

  describe('2. Endpoint Parity: /api/otlp/v1/traces and /v1/traces', () => {
    it('should allow ingestion via /api/otlp/v1/traces with identical behavior', async () => {
      const payload = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'parity-service' } }],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: sampleTraceId,
                    spanId: '1111222233334444',
                    name: 'GET /status',
                    kind: 1, // INTERNAL
                    startTimeUnixNano: '1726999999000000000',
                    endTimeUnixNano: '1726999999010000000',
                  },
                ],
              },
            ],
          },
        ],
      };

      const res = await request(app)
        .post('/api/otlp/v1/traces')
        .set('Authorization', `Bearer ${alphaKey}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.rejectedSpans).toBe(0);

      const service = await container.serviceRepository.findByName('parity-service', 'production', 'proj_alpha');
      expect(service).not.toBeNull();
    });
  });

  describe('3. Unsupported Signals (Metrics / Logs)', () => {
    it('should return 501 NOT_IMPLEMENTED for /v1/metrics', async () => {
      const res = await request(app)
        .post('/v1/metrics')
        .set('X-GhostStack-Key', alphaKey)
        .send({ resourceMetrics: [] });

      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    });

    it('should return 501 NOT_IMPLEMENTED for /v1/logs', async () => {
      const res = await request(app)
        .post('/v1/logs')
        .set('X-GhostStack-Key', alphaKey)
        .send({ resourceLogs: [] });

      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    });

    it('should return 501 for /api/otlp/v1/metrics and /api/otlp/v1/logs', async () => {
      const resM = await request(app)
        .post('/api/otlp/v1/metrics')
        .set('X-GhostStack-Key', alphaKey)
        .send({});
      expect(resM.status).toBe(501);

      const resL = await request(app)
        .post('/api/otlp/v1/logs')
        .set('X-GhostStack-Key', alphaKey)
        .send({});
      expect(resL.status).toBe(501);
    });
  });

  describe('4. Authentication & Multi-Tenant Isolation', () => {
    it('should reject request with 401 when API key is missing', async () => {
      const res = await request(app)
        .post('/v1/traces')
        .send({ resourceSpans: [] });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with 401 when API key is invalid', async () => {
      const res = await request(app)
        .post('/v1/traces')
        .set('X-GhostStack-Key', 'gh_live_invalidkey1234567890')
        .send({ resourceSpans: [] });

      expect(res.status).toBe(401);
    });

    it('should enforce strict project isolation between Project Alpha and Beta', async () => {
      // Ingest telemetry into Alpha
      await request(app)
        .post('/v1/traces')
        .set('X-GhostStack-Key', alphaKey)
        .send({
          resourceSpans: [
            {
              resource: {
                attributes: [{ key: 'service.name', value: { stringValue: 'shared-name-service' } }],
              },
              scopeSpans: [{
                spans: [{
                  traceId: 'aaaa1111aaaa1111aaaa1111aaaa1111',
                  spanId: '1111111111111111',
                  name: 'alpha_op',
                }],
              }],
            },
          ],
        });

      // Ingest telemetry into Beta with identical service name
      await request(app)
        .post('/v1/traces')
        .set('X-GhostStack-Key', betaKey)
        .send({
          resourceSpans: [
            {
              resource: {
                attributes: [{ key: 'service.name', value: { stringValue: 'shared-name-service' } }],
              },
              scopeSpans: [{
                spans: [{
                  traceId: 'bbbb2222bbbb2222bbbb2222bbbb2222',
                  spanId: '2222222222222222',
                  name: 'beta_op',
                }],
              }],
            },
          ],
        });

      // Services should exist in both, but separated by projectId
      const alphaServices = await container.serviceRepository.findAll({ projectId: 'proj_alpha' });
      const betaServices = await container.serviceRepository.findAll({ projectId: 'proj_beta' });

      expect(alphaServices).toHaveLength(1);
      expect(betaServices).toHaveLength(1);
      expect(alphaServices[0].serviceId).not.toBe(betaServices[0].serviceId);

      // Telemetry repository isolation
      const alphaTelemetry = await container.telemetryRepository.findByService('shared-name-service', { projectId: 'proj_alpha' });
      const betaTelemetry = await container.telemetryRepository.findByService('shared-name-service', { projectId: 'proj_beta' });

      expect(alphaTelemetry).toHaveLength(1);
      expect(alphaTelemetry[0].endpoint).toBe('alpha_op');
      expect(betaTelemetry).toHaveLength(1);
      expect(betaTelemetry[0].endpoint).toBe('beta_op');
    });
  });

  describe('5. Continuous Incident Detection via OTLP Pipeline', () => {
    it('should trigger continuous incident detection when error threshold is exceeded', async () => {
      // Send 5 spans with HTTP 500 error status to exceed minimumEvents=5 and errorRateThreshold=0.5
      const spans = Array.from({ length: 5 }, (_, i) => ({
        traceId: sampleTraceId,
        spanId: `err_span_${i}`,
        name: 'POST /checkout',
        kind: 2, // SERVER
        startTimeUnixNano: String(1726999999000000000n + BigInt(i * 1000000000)),
        endTimeUnixNano: String(1726999999050000000n + BigInt(i * 1000000000)),
        attributes: [
          { key: 'http.status_code', value: { intValue: 500 } },
        ],
      }));

      const payload = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'checkout-service' } },
                { key: 'deployment.environment.name', value: { stringValue: 'production' } },
              ],
            },
            scopeSpans: [{ spans }],
          },
        ],
      };

      const res = await request(app)
        .post('/v1/traces')
        .set('X-GhostStack-Key', alphaKey)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.rejectedSpans).toBe(0);

      // Wait 100ms for eventBus async handler to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify active incident created in IncidentRepository
      const activeIncidents = await container.incidentRepository.findActive('proj_alpha', 'production');
      expect(activeIncidents.length).toBeGreaterThanOrEqual(1);

      const incident = activeIncidents[0];
      expect(incident.projectId).toBe('proj_alpha');
      expect(incident.environment).toBe('production');
      expect(incident.status).toBe('detected');
      expect(incident.trigger.serviceName).toBe('checkout-service');
      expect(incident.trigger.errorRate).toBe(1.0);
    });
  });

  describe('6. Retry Idempotency', () => {
    it('should safely handle re-sending the same OTLP batch without duplicating telemetry', async () => {
      const payload = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'idempotent-service' } }],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: sampleTraceId,
                    spanId: 'aabbccddeeff0011',
                    name: 'GET /item',
                    kind: 1,
                  },
                ],
              },
            ],
          },
        ],
      };

      // First request
      const res1 = await request(app)
        .post('/v1/traces')
        .set('X-GhostStack-Key', alphaKey)
        .send(payload);
      expect(res1.status).toBe(200);

      // Second request (retry of same batch)
      const res2 = await request(app)
        .post('/v1/traces')
        .set('X-GhostStack-Key', alphaKey)
        .send(payload);
      expect(res2.status).toBe(200);

      // Verify only 1 telemetry event exists with this traceId and requestId
      const events = await container.telemetryRepository.findByTraceId(sampleTraceId);
      expect(events).toHaveLength(1);
    });
  });

  describe('7. Binary Protobuf Ingestion', () => {
    it('should ingest binary protobuf traces via /v1/traces with Content-Type: application/x-protobuf', async () => {
      // Build a minimal binary protobuf buffer manually:
      // ResourceSpans (1) -> Resource (1) -> attributes (1) -> KeyValue (key=1: "service.name", value=2: AnyValue stringValue=1: "proto-service")
      //                   -> ScopeSpans (2) -> Spans (2) -> name=5: "proto-op", kind=6: 1 (INTERNAL)
      const attrVal = Buffer.concat([
        Buffer.from([0x0a, 0x0d]), // field 1 (string), len 13
        Buffer.from('proto-service', 'utf8'),
      ]);
      const kv = Buffer.concat([
        Buffer.from([0x0a, 0x0c]), // key: field 1, len 12
        Buffer.from('service.name', 'utf8'),
        Buffer.from([0x12, attrVal.length]), // value: field 2
        attrVal,
      ]);
      const resource = Buffer.concat([
        Buffer.from([0x0a, kv.length]),
        kv,
      ]);
      const span = Buffer.concat([
        Buffer.from([0x0a, 0x10]), // traceId (16 bytes): field 1
        Buffer.from('99999999999999999999999999999999', 'hex'),
        Buffer.from([0x12, 0x08]), // spanId (8 bytes): field 2
        Buffer.from('8888888888888888', 'hex'),
        Buffer.from([0x2a, 0x08]), // name (field 5, len 8)
        Buffer.from('proto-op', 'utf8'),
        Buffer.from([0x30, 0x01]), // kind (field 6, varint 1)
      ]);
      const scopeSpans = Buffer.concat([
        Buffer.from([0x12, span.length]),
        span,
      ]);
      const resourceSpans = Buffer.concat([
        Buffer.from([0x0a, resource.length]),
        resource,
        Buffer.from([0x12, scopeSpans.length]),
        scopeSpans,
      ]);
      const rootMsg = Buffer.concat([
        Buffer.from([0x0a, resourceSpans.length]),
        resourceSpans,
      ]);

      const res = await request(app)
        .post('/v1/traces')
        .set('X-GhostStack-Key', alphaKey)
        .set('Content-Type', 'application/x-protobuf')
        .send(rootMsg);

      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.rejectedSpans).toBe(0);

      const service = await container.serviceRepository.findByName('proto-service', 'production', 'proj_alpha');
      expect(service).not.toBeNull();
      expect(service.name).toBe('proto-service');
    });
  });
});
