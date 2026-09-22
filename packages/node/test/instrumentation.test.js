const http = require('http');
const express = require('express');
const request = require('supertest');
const { GhostStackClient } = require('../src/GhostStackClient');
const { GHOSTSTACK_SERVER_SPAN } = require('../src/instrumentation/http');

describe('HTTP & Express Instrumentation (Correction 3 & 4)', () => {
  let client;
  let server;
  let serverPort;

  beforeAll(async () => {
    // Spin up an external target server
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    serverPort = server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    client = new GhostStackClient({
      serviceName: 'instrumented-service',
      environment: 'test',
      endpoint: 'http://127.0.0.1:49999/v1/traces',
      disabled: false,
    });
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('HTTP Client Instrumentation & Self-Instrumentation Prevention (Correction 3)', () => {
    it('should instrument outgoing HTTP calls to external services', async () => {
      client.instrumentHttp();

      // Make outgoing call to external server
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/api/users/42?token=secret',
          method: 'GET',
        }, (res) => {
          res.on('data', () => {});
          res.on('end', resolve);
        });
        req.on('error', reject);
        req.end();
      });

      // Wait a tick for span onEnd callback
      await new Promise((r) => setTimeout(r, 50));

      const spans = client.buffer.drain(10);
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.kind).toBe(3); // CLIENT
      expect(span.targetService).toBe(`127.0.0.1:${serverPort}`);
      expect(span.attributes['http.method']).toBe('GET');
      expect(span.attributes['http.status_code']).toBe(200);

      client.uninstrumentHttp();
    });

    it('should strictly NOT instrument GHOST-STACK transport requests (No self-instrumentation)', async () => {
      client.instrumentHttp();

      // Simulate the transport sending telemetry to GHOST-STACK endpoint with X-GhostStack-Internal
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/v1/traces',
          method: 'POST',
          headers: {
            'X-GhostStack-Internal': '1',
          },
        }, (res) => {
          res.on('data', () => {});
          res.on('end', resolve);
        });
        req.on('error', reject);
        req.end();
      });

      await new Promise((r) => setTimeout(r, 50));

      // Buffer should be empty: self-request was NOT recorded!
      const spans = client.buffer.drain(10);
      expect(spans).toHaveLength(0);

      client.uninstrumentHttp();
    });
  });

  describe('Express Middleware & Double-Instrumentation Prevention (Correction 4)', () => {
    it('should capture Express request route and status', async () => {
      const app = express();
      app.use(client.middleware());

      app.get('/api/orders/:id', (req, res) => {
        res.status(200).json({ orderId: req.params.id });
      });

      const res = await request(app).get('/api/orders/123');
      expect(res.status).toBe(200);

      await new Promise((r) => setTimeout(r, 50));

      const spans = client.buffer.drain(10);
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.kind).toBe(2); // SERVER
      expect(span.name).toBe('GET /api/orders/:id');
      expect(span.attributes['http.route']).toBe('/api/orders/:id');
      expect(span.attributes['http.status_code']).toBe(200);
    });

    it('should prevent double-instrumentation when both HTTP and Express middleware are used', async () => {
      const app = express();

      // Simulate an existing HTTP server span on req
      const manualServerSpan = client.startSpan('GET /raw', { kind: 'SERVER' });
      app.use((req, _res, next) => {
        req[GHOSTSTACK_SERVER_SPAN] = manualServerSpan;
        next();
      });

      // Now register Express middleware
      app.use(client.middleware());

      app.get('/api/items/:id', (_req, res) => {
        res.status(200).send('ok');
      });

      const res = await request(app).get('/api/items/99');
      expect(res.status).toBe(200);

      manualServerSpan.end();

      await new Promise((r) => setTimeout(r, 50));

      // Only the 1 existing span should be recorded, enriched with route template!
      const spans = client.buffer.drain(10);
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('GET /api/items/:id');
      expect(spans[0].attributes['http.route']).toBe('/api/items/:id');
    });

    it('should handle repeated middleware registration idempotently', async () => {
      const app = express();
      app.use(client.middleware());
      app.use(client.middleware()); // Registered twice

      app.get('/ping', (_req, res) => res.send('pong'));

      const res = await request(app).get('/ping');
      expect(res.status).toBe(200);

      await new Promise((r) => setTimeout(r, 50));

      const spans = client.buffer.drain(10);
      expect(spans).toHaveLength(1); // Still exactly 1 span
    });
  });
});
