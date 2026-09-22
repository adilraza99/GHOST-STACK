const { init, getClient, shutdown, GhostStackClient } = require('../index');

describe('GhostStackClient Orchestrator (Correction 12, 16, 17, 18)', () => {
  afterEach(async () => {
    await shutdown();
  });

  it('should initialize a singleton client and return same instance on subsequent init()', () => {
    const client1 = init({
      serviceName: 'singleton-service',
      environment: 'development',
    });

    const client2 = init({
      serviceName: 'singleton-service',
      environment: 'development',
    });

    expect(client1).toBe(client2);
    expect(getClient()).toBe(client1);
  });

  it('should support independently isolated instances via new GhostStackClient()', () => {
    const clientA = new GhostStackClient({
      serviceName: 'service-a',
      environment: 'development',
    });

    const clientB = new GhostStackClient({
      serviceName: 'service-b',
      environment: 'development',
    });

    expect(clientA).not.toBe(clientB);
    expect(clientA.config.serviceName).toBe('service-a');
    expect(clientB.config.serviceName).toBe('service-b');

    clientA.shutdown();
    clientB.shutdown();
  });

  it('should behave as no-op when disabled: true', async () => {
    const client = new GhostStackClient({
      serviceName: 'disabled-service',
      environment: 'development',
      disabled: true,
    });

    const span = client.startSpan('noop-op');
    span.setAttribute('key', 'val');
    span.end();

    expect(span.ended).toBe(true);
    expect(client.buffer.isEmpty()).toBe(true);
    expect(client.getStats().eventsBuffered).toBe(0);

    await client.shutdown();
  });

  it('should retain error spans even when normal traffic is sampled out (Correction 12)', () => {
    const client = new GhostStackClient({
      serviceName: 'sampling-service',
      environment: 'development',
      sampleRate: 0.0, // Drop all normal traffic
      retainErrors: true, // But retain errors
    });

    // 1. Normal span (sampled out)
    const normalSpan = client.startSpan('normal-op');
    normalSpan.setStatus({ code: 'OK' });
    normalSpan.end();

    expect(client.buffer.isEmpty()).toBe(true); // normal span was discarded

    // 2. Error span (retained despite sampleRate: 0.0!)
    const errorSpan = client.startSpan('failing-op');
    errorSpan.setStatus({ code: 'ERROR', message: 'Something broke' });
    errorSpan.end();

    expect(client.buffer.length).toBe(1); // Error span was retained!
    const items = client.buffer.drain(10);
    expect(items[0].name).toBe('failing-op');

    client.shutdown();
  });

  it('should execute shutdown idempotently without hanging (Correction 16)', async () => {
    const client = new GhostStackClient({
      serviceName: 'shutdown-test',
      environment: 'development',
    });

    // Calling shutdown multiple times
    await client.shutdown({ timeoutMs: 100 });
    await client.shutdown({ timeoutMs: 100 });

    expect(client.isShutdown).toBe(true);
    expect(client.flushTimer).toBeNull();
  });

  it('should return safe diagnostic statistics', () => {
    const client = new GhostStackClient({
      serviceName: 'stats-test',
      environment: 'development',
    });

    const span = client.startSpan('metric-op');
    span.end();

    const stats = client.getStats();
    expect(stats.eventsBuffered).toBe(1);
    expect(stats.eventsSent).toBe(0);
    expect(stats.eventsDropped).toBe(0);

    client.shutdown();
  });
});
