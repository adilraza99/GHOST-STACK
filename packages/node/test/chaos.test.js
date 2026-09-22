const http = require('http');
const { GhostStackClient } = require('../src/GhostStackClient');

describe('Chaos & Outage Resilience (Correction 10 & 16)', () => {
  let mockServer;
  let serverPort;
  let serverMode = 'offline'; // 'offline' | 'error' | 'hang' | 'healthy'
  let receivedBatches = [];

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      if (serverMode === 'error') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service Unavailable' }));
        return;
      }

      if (serverMode === 'hang') {
        // Deliberately hold request open to test timeout abort
        return;
      }

      if (serverMode === 'healthy') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            receivedBatches.push(JSON.parse(body));
          } catch (_e) {
            receivedBatches.push(body);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ partialSuccess: {} }));
        });
        return;
      }

      // Default offline / close immediately
      req.socket.destroy();
    });

    await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    serverPort = mockServer.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => mockServer.close(resolve));
  });

  beforeEach(() => {
    receivedBatches = [];
    serverMode = 'error';
  });

  it('should maintain bounded buffer and drop-oldest backpressure during GHOST-STACK outage without crashing host app', async () => {
    serverMode = 'error'; // 503 outage

    const client = new GhostStackClient({
      serviceName: 'outage-test-service',
      environment: 'test',
      endpoint: `http://127.0.0.1:${serverPort}/v1/traces`,
      maxBufferSize: 50,
      flushIntervalMs: 50,
      timeoutMs: 100,
      maxRetries: 1,
    });

    // Generate 500 spans while backend is 503
    for (let i = 0; i < 500; i++) {
      const span = client.startSpan(`request-${i}`, { kind: 'SERVER' });
      span.setAttribute('order.index', i);
      span.end();
    }

    // Buffer must NEVER exceed maxBufferSize (50)
    expect(client.buffer.size).toBeLessThanOrEqual(50);
    expect(client.stats.getSnapshot().eventsBuffered).toBeLessThanOrEqual(50);

    // Dropped spans must account for the overflow
    expect(client.stats.getSnapshot().eventsDropped).toBe(450);

    // Verify buffer holds the NEWEST 50 spans (drop-oldest policy)
    const buffered = client.buffer.peekAll();
    expect(buffered.length).toBe(50);
    expect(buffered[0].name).toBe('request-450');
    expect(buffered[49].name).toBe('request-499');

    // Now restore GHOST-STACK to healthy
    serverMode = 'healthy';

    // Trigger flush
    await client.flush();

    // Verify buffered spans delivered and buffer is now empty
    expect(client.buffer.size).toBe(0);
    expect(receivedBatches.length).toBeGreaterThanOrEqual(1);

    const receivedSpans = receivedBatches[0].resourceSpans[0].scopeSpans[0].spans;
    expect(receivedSpans.length).toBe(50);
    expect(receivedSpans[0].name).toBe('request-450');

    await client.shutdown();
  });

  it('should abort cleanly on hanging/unresponsive endpoint without leaking memory or throwing unhandled errors', async () => {
    serverMode = 'hang'; // Endpoint hangs

    const client = new GhostStackClient({
      serviceName: 'hang-test-service',
      environment: 'test',
      endpoint: `http://127.0.0.1:${serverPort}/v1/traces`,
      maxBufferSize: 10,
      flushIntervalMs: 1000,
      timeoutMs: 50, // Rapid timeout
      maxRetries: 0,
    });

    const span = client.startSpan('hanging-op', { kind: 'INTERNAL' });
    span.end();

    const startFlush = Date.now();
    // Flush should abort within timeoutMs + margin
    await client.flush();
    const elapsed = Date.now() - startFlush;

    expect(elapsed).toBeLessThan(300); // Definitely aborted, did not hang
    expect(client.stats.getSnapshot().eventsFailed).toBe(1);

    await client.shutdown();
  });

  it('should survive complete network connection refusal (ECONNREFUSED) gracefully', async () => {
    // Port with nothing listening
    const deadPort = 64999;

    const client = new GhostStackClient({
      serviceName: 'econnrefused-service',
      environment: 'test',
      endpoint: `http://127.0.0.1:${deadPort}/v1/traces`,
      maxBufferSize: 20,
      flushIntervalMs: 1000,
      timeoutMs: 50,
      maxRetries: 1,
    });

    for (let i = 0; i < 30; i++) {
      const span = client.startSpan(`econn-${i}`);
      span.end();
    }

    // Flush to dead port
    await client.flush();

    expect(client.stats.getSnapshot().eventsFailed).toBeGreaterThanOrEqual(1);
    expect(client.buffer.size).toBeLessThanOrEqual(20);

    await client.shutdown();
  });
});
