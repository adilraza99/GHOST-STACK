const http = require('http');
const Transport = require('../src/transport');
const { Span } = require('../src/span');
const SDKStats = require('../src/stats');

describe('Transport & Network Resilience (Correction 14)', () => {
  let server;
  let serverPort;
  let requestHandler = (req, res) => res.writeHead(200).end();

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requestHandler(req, res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    serverPort = server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function createTestTransport(options = {}) {
    const stats = new SDKStats();
    const transport = new Transport({
      endpoint: `http://127.0.0.1:${serverPort}/v1/traces`,
      apiKey: 'gh_live_testkey123',
      serviceName: 'test-service',
      environment: 'test',
      timeoutMs: options.timeoutMs || 1000,
      maxRetries: options.maxRetries !== undefined ? options.maxRetries : 2,
      maxRetryDelayMs: 200, // fast test retries
      stats,
      ...options,
    });
    return { transport, stats };
  }

  it('should deliver a batch of spans successfully and send auth headers', async () => {
    let capturedHeaders = null;
    let capturedBody = null;

    requestHandler = (req, res) => {
      capturedHeaders = req.headers;
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        capturedBody = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ partialSuccess: { rejectedSpans: 0 } }));
      });
    };

    const { transport, stats } = createTestTransport();
    const span = new Span({ name: 'op-1' });
    span.end();

    const delivered = await transport.sendBatch([span]);

    expect(delivered).toBe(true);
    expect(stats.eventsSent).toBe(1);
    expect(stats.eventsFailed).toBe(0);
    expect(capturedHeaders['x-ghoststack-key']).toBe('gh_live_testkey123');
    expect(capturedHeaders['x-ghoststack-internal']).toBe('1');
    expect(capturedBody.resourceSpans[0].resource.attributes[0].value.stringValue).toBe('test-service');
  });

  it('should abort and fail when request exceeds hard timeout', async () => {
    requestHandler = (_req, res) => {
      // Deliberately do not respond, simulate hang
      setTimeout(() => {
        try { res.writeHead(200).end(); } catch (_) {}
      }, 500);
    };

    const { transport, stats } = createTestTransport({
      timeoutMs: 50, // very short timeout
      maxRetries: 0,
    });

    const span = new Span({ name: 'timeout-op' });
    span.end();

    const delivered = await transport.sendBatch([span]);

    expect(delivered).toBe(false);
    expect(stats.eventsFailed).toBe(1);
  });

  it('should NOT retry permanent errors (400, 401, 403, 415, 501)', async () => {
    let requestCount = 0;
    requestHandler = (_req, res) => {
      requestCount++;
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }));
    };

    const { transport, stats } = createTestTransport({ maxRetries: 3 });
    const span = new Span({ name: 'auth-fail' });
    span.end();

    const delivered = await transport.sendBatch([span]);

    expect(delivered).toBe(false);
    expect(requestCount).toBe(1); // Never retried 401!
    expect(stats.eventsRetried).toBe(0);
    expect(stats.eventsFailed).toBe(1);
  });

  it('should retry transient errors (500, 503, 429) up to maxRetries', async () => {
    let requestCount = 0;
    requestHandler = (_req, res) => {
      requestCount++;
      if (requestCount < 3) {
        res.writeHead(503);
        res.end('Service Unavailable');
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ partialSuccess: { rejectedSpans: 0 } }));
      }
    };

    const { transport, stats } = createTestTransport({ maxRetries: 3 });
    const span = new Span({ name: 'flaky-op' });
    span.end();

    const delivered = await transport.sendBatch([span]);

    expect(delivered).toBe(true);
    expect(requestCount).toBe(3); // 1 initial + 2 retries
    expect(stats.eventsRetried).toBe(2);
    expect(stats.eventsSent).toBe(1);
  });

  it('should respect Retry-After header with bounded delay', async () => {
    let requestCount = 0;
    requestHandler = (_req, res) => {
      requestCount++;
      if (requestCount === 1) {
        res.writeHead(429, { 'Retry-After': '1' }); // 1 second
        res.end('Rate limited');
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ partialSuccess: { rejectedSpans: 0 } }));
      }
    };

    const { transport, stats } = createTestTransport({ maxRetries: 2, maxRetryDelayMs: 200 });
    const span = new Span({ name: 'rate-limited-op' });
    span.end();

    const start = Date.now();
    const delivered = await transport.sendBatch([span]);
    const duration = Date.now() - start;

    expect(delivered).toBe(true);
    expect(requestCount).toBe(2);
    expect(stats.eventsRetried).toBe(1);
    expect(duration).toBeGreaterThanOrEqual(150); // bounded by maxRetryDelayMs
  });
});
