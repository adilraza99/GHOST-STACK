const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { createTestApp } = require('../../../server/tests/helpers/testApp');
const ApiKey = require('../../../server/src/domain/entities/ApiKey');
const Project = require('../../../server/src/domain/entities/Project');
const { GhostStackClient } = require('../src/GhostStackClient');

describe('Real 3-Service Distributed Integration Test (SDK -> GHOST-STACK /v1/traces)', () => {
  let container;
  let ghostApp, ghostServer, ghostPort;
  let apiKey;
  const projectId = 'proj_sdk_integration';

  // 3 Microservices
  let gatewayApp, gatewayServer, gatewayPort, gatewayClient;
  let orderApp, orderServer, orderPort, orderClient;
  let paymentApp, paymentServer, paymentPort, paymentClient;

  beforeAll(async () => {
    // 1. Connect Mongoose
    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test';
    await mongoose.connect(testUri);

    // 2. Spin up live GHOST-STACK Backend
    ({ app: ghostApp, container } = createTestApp());
    ghostServer = http.createServer(ghostApp);
    await new Promise((resolve) => ghostServer.listen(0, '127.0.0.1', resolve));
    ghostPort = ghostServer.address().port;
  });

  afterAll(async () => {
    if (ghostServer) {
      await new Promise((resolve) => ghostServer.close(resolve));
    }
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clean DB
    await container.projectRepository.deleteAll();
    await container.serviceRepository.deleteAll();
    await container.dependencyRepository.deleteAll();
    await container.telemetryRepository.deleteAll();
    await container.incidentRepository.deleteAll();
    await container.incidentEventRepository.deleteAll();
    await container.deploymentRepository.deleteAll();
    await container.apiKeyRepository.deleteAll();

    // Create Project
    await container.projectRepository.save(new Project({
      projectId,
      name: 'M6 Microservices Project',
      slug: 'm6-microservices',
      status: 'active',
    }));

    // Create API Key
    const gen = ApiKey.generate({
      projectId,
      name: 'M6 SDK Key',
      permissions: ['telemetry:write'],
    });
    await container.apiKeyRepository.save(gen.apiKey);
    apiKey = gen.plaintextKey;

    // -------------------------------------------------------------
    // Service C: Payment Service
    // -------------------------------------------------------------
    paymentClient = new GhostStackClient({
      serviceName: 'payment-service',
      environment: 'production',
      endpoint: `http://127.0.0.1:${ghostPort}/v1/traces`,
      apiKey,
      flushIntervalMs: 60000,
    });
    paymentApp = express();
    paymentApp.use(express.json());
    paymentApp.use(paymentClient.middleware());
    paymentApp.post('/internal/payments', (req, res) => {
      if (req.body && req.body.fail) {
        return res.status(500).json({ error: 'Payment gateway card declined' });
      }
      return res.status(200).json({ paymentId: 'pay_12345', status: 'PAID' });
    });
    paymentServer = http.createServer(paymentApp);
    await new Promise((resolve) => paymentServer.listen(0, '127.0.0.1', resolve));
    paymentPort = paymentServer.address().port;

    // -------------------------------------------------------------
    // Service B: Order Service
    // -------------------------------------------------------------
    orderClient = new GhostStackClient({
      serviceName: 'order-service',
      environment: 'production',
      endpoint: `http://127.0.0.1:${ghostPort}/v1/traces`,
      apiKey,
      flushIntervalMs: 60000,
    });
    orderClient.instrumentHttp();
    orderApp = express();
    orderApp.use(express.json());
    orderApp.use(orderClient.middleware());
    orderApp.post('/internal/orders', (req, res) => {
      // Call Service C (Payment Service)
      const postData = JSON.stringify(req.body || {});
      const payReq = http.request({
        hostname: '127.0.0.1',
        port: paymentPort,
        path: '/internal/payments',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (payRes) => {
        let body = '';
        payRes.on('data', (c) => { body += c; });
        payRes.on('end', () => {
          if (payRes.statusCode >= 400) {
            return res.status(502).json({ error: 'Payment failed' });
          }
          return res.status(201).json({ orderId: 'ord_98765', status: 'CONFIRMED' });
        });
      });
      payReq.on('error', (err) => {
        res.status(500).json({ error: err.message });
      });
      payReq.write(postData);
      payReq.end();
    });
    orderServer = http.createServer(orderApp);
    await new Promise((resolve) => orderServer.listen(0, '127.0.0.1', resolve));
    orderPort = orderServer.address().port;

    // -------------------------------------------------------------
    // Service A: API Gateway
    // -------------------------------------------------------------
    gatewayClient = new GhostStackClient({
      serviceName: 'api-gateway',
      environment: 'production',
      endpoint: `http://127.0.0.1:${ghostPort}/v1/traces`,
      apiKey,
      flushIntervalMs: 60000,
    });
    gatewayClient.instrumentHttp();
    gatewayApp = express();
    gatewayApp.use(express.json());
    gatewayApp.use(gatewayClient.middleware());
    gatewayApp.post('/api/checkout', (req, res) => {
      // Call Service B (Order Service)
      const postData = JSON.stringify(req.body || {});
      const ordReq = http.request({
        hostname: '127.0.0.1',
        port: orderPort,
        path: '/internal/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (ordRes) => {
        let body = '';
        ordRes.on('data', (c) => { body += c; });
        ordRes.on('end', () => {
          if (ordRes.statusCode >= 400) {
            return res.status(502).json({ error: 'Order placement failed' });
          }
          return res.status(200).json({ success: true, orderId: 'ord_98765' });
        });
      });
      ordReq.on('error', (err) => {
        res.status(500).json({ error: err.message });
      });
      ordReq.write(postData);
      ordReq.end();
    });
    gatewayServer = http.createServer(gatewayApp);
    await new Promise((resolve) => gatewayServer.listen(0, '127.0.0.1', resolve));
    gatewayPort = gatewayServer.address().port;
  });

  afterEach(async () => {
    if (gatewayClient) await gatewayClient.shutdown();
    if (orderClient) await orderClient.shutdown();
    if (paymentClient) await paymentClient.shutdown();

    if (gatewayServer) await new Promise((resolve) => gatewayServer.close(resolve));
    if (orderServer) await new Promise((resolve) => orderServer.close(resolve));
    if (paymentServer) await new Promise((resolve) => paymentServer.close(resolve));
  });

  it('should propagate W3C traceparent end-to-end across Gateway -> Order -> Payment and ingest into GHOST-STACK', async () => {
    // 1. Send external client request to Gateway
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: gatewayPort,
        path: '/api/checkout',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ item: 'laptop', price: 1200 }));
      req.end();
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // 2. Wait for finishes, then flush telemetry on all 3 SDKs to GHOST-STACK
    await Promise.all([
      gatewayClient.flush(),
      orderClient.flush(),
      paymentClient.flush(),
    ]);

    // 3. Query GHOST-STACK Telemetry Database
    const allEvents = await container.telemetryRepository.findByTimeRange(
      new Date(0),
      new Date(Date.now() + 60000),
      { projectId }
    );
    expect(allEvents.length).toBeGreaterThanOrEqual(3);

    // Group by traceId
    const traceIds = new Set(allEvents.map((e) => e.traceId));
    expect(traceIds.size).toBe(1); // ALL SERVICES SHARED THE EXACT SAME TRACE ID!
    const singleTraceId = Array.from(traceIds)[0];

    // Verify all 3 services are present in the trace
    const participatingServices = new Set(allEvents.map((e) => e.sourceService));
    expect(participatingServices.has('api-gateway')).toBe(true);
    expect(participatingServices.has('order-service')).toBe(true);
    expect(participatingServices.has('payment-service')).toBe(true);

    // Verify each event has the correct projectId and environment
    for (const ev of allEvents) {
      expect(ev.projectId).toBe(projectId);
      expect(ev.environment).toBe('production');
      expect(ev.eventId).toMatch(/^otlp_/);
    }

    // 4. Verify Services discovered in serviceRepository
    const services = await container.serviceRepository.findAll({ projectId });
    const serviceNames = services.map((s) => s.name);
    expect(serviceNames).toContain('api-gateway');
    expect(serviceNames).toContain('order-service');
    expect(serviceNames).toContain('payment-service');
  });

  it('should capture failure across services and trigger continuous incident intelligence on GHOST-STACK backend', async () => {
    // Send failing request to Gateway
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: gatewayPort,
        path: '/api/checkout',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ item: 'laptop', fail: true }));
      req.end();
    });

    expect(response.status).toBe(502);

    // Flush all SDKs to GHOST-STACK
    await Promise.all([
      gatewayClient.flush(),
      orderClient.flush(),
      paymentClient.flush(),
    ]);

    // Query Telemetry Repository for error events
    const allEvents = await container.telemetryRepository.findByTimeRange(
      new Date(0),
      new Date(Date.now() + 60000),
      { projectId }
    );
    expect(allEvents.length).toBeGreaterThanOrEqual(3);

    const paymentEvent = allEvents.find((e) => e.sourceService === 'payment-service');
    expect(paymentEvent).toBeDefined();
    expect(paymentEvent.statusCode).toBe(500);

    const gatewayEvent = allEvents.find((e) => e.sourceService === 'api-gateway');
    expect(gatewayEvent).toBeDefined();
    expect(gatewayEvent.statusCode).toBe(502);
  });
});
