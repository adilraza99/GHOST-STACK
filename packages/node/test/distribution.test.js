const fs = require('fs');
const path = require('path');

const ghoststack = require('../index');

describe('SDK Distribution & Package Metadata', () => {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  it('should have correct package.json metadata for distribution', () => {
    expect(pkg.name).toBe('@ghoststack/node');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.main).toBe('index.js');
    expect(pkg.types).toBe('index.d.ts');
    expect(pkg.license).toBe('Apache-2.0');
  });

  it('should have zero runtime npm dependencies', () => {
    expect(pkg.dependencies).toEqual({});
    expect(Object.keys(pkg.dependencies || {}).length).toBe(0);
  });

  it('should define modern standard exports mapping', () => {
    expect(pkg.exports).toBeDefined();
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['.'].types).toBe('./index.d.ts');
    expect(pkg.exports['.'].default).toBe('./index.js');
    expect(pkg.exports['./package.json']).toBe('./package.json');
  });

  it('should include all required distribution files on disk', () => {
    expect(pkg.files).toContain('index.js');
    expect(pkg.files).toContain('index.d.ts');
    expect(pkg.files).toContain('src/');
    expect(pkg.files).toContain('README.md');
    expect(pkg.files).toContain('LICENSE');

    for (const file of pkg.files) {
      const fullPath = path.resolve(__dirname, '..', file);
      expect(fs.existsSync(fullPath), `File or directory ${file} must exist`).toBe(true);
    }
  });

  it('should export all public API members from index.js', () => {
    expect(typeof ghoststack.init).toBe('function');
    expect(typeof ghoststack.getClient).toBe('function');
    expect(typeof ghoststack.shutdown).toBe('function');
    expect(typeof ghoststack.middleware).toBe('function');
    expect(typeof ghoststack.GhostStackClient).toBe('function');
    expect(typeof ghoststack.ConfigError).toBe('function');
    expect(typeof ghoststack.parseTraceparent).toBe('function');
    expect(typeof ghoststack.formatTraceparent).toBe('function');
    expect(typeof ghoststack.injectTraceContext).toBe('function');
    expect(typeof ghoststack.getActiveSpan).toBe('function');
    expect(typeof ghoststack.runWithSpan).toBe('function');
  });

  it('should verify index.d.ts exists and declares all public API members', () => {
    const dtsPath = path.resolve(__dirname, '../index.d.ts');
    const dtsContent = fs.readFileSync(dtsPath, 'utf8');

    expect(dtsContent).toContain('export function init');
    expect(dtsContent).toContain('export function getClient');
    expect(dtsContent).toContain('export function shutdown');
    expect(dtsContent).toContain('export function middleware');
    expect(dtsContent).toContain('export function parseTraceparent');
    expect(dtsContent).toContain('export function formatTraceparent');
    expect(dtsContent).toContain('export function injectTraceContext');
    expect(dtsContent).toContain('export function getActiveSpan');
    expect(dtsContent).toContain('export function runWithSpan');
    expect(dtsContent).toContain('export class GhostStackClient');
    expect(dtsContent).toContain('export class ConfigError');
  });
});

describe('SDK Initialization & Lifecycle', () => {
  beforeEach(async () => {
    await ghoststack.shutdown();
  });

  afterEach(async () => {
    await ghoststack.shutdown();
  });

  it('should return existing singleton when init() is called more than once', () => {
    const client1 = ghoststack.init({
      serviceName: 'test-service',
      environment: 'development',
      endpoint: 'http://localhost:3000',
    });

    const client2 = ghoststack.init({
      serviceName: 'different-service',
      environment: 'development',
      endpoint: 'http://localhost:3000',
    });

    expect(client1).toBe(client2);
    expect(ghoststack.getClient()).toBe(client1);
    expect(client1.config.serviceName).toBe('test-service');
  });

  it('should safely shutdown idempotently', async () => {
    const client = ghoststack.init({
      serviceName: 'test-service',
      environment: 'development',
      endpoint: 'http://localhost:3000',
    });

    expect(ghoststack.getClient()).toBe(client);
    await ghoststack.shutdown();
    expect(ghoststack.getClient()).toBeNull();

    // Calling shutdown again should not throw
    await expect(ghoststack.shutdown()).resolves.toBeUndefined();
  });

  it('should support complete circuit-breaker disabled mode with NoopSpan', () => {
    const client = ghoststack.init({
      serviceName: 'disabled-service',
      environment: 'development',
      disabled: true,
    });

    expect(client.config.disabled).toBe(true);
    expect(client.flushTimer).toBeNull();

    const span = client.startSpan('test-operation');
    span.setAttribute('test.key', 'value');
    span.setStatus({ code: 'OK' });
    span.recordError(new Error('test'));
    span.end();

    expect(span.toOtlpSpan()).toBeNull();
    expect(client.buffer.length).toBe(0);
    expect(client.getStats().eventsBuffered).toBe(0);
    expect(client.getStats().eventsSent).toBe(0);
  });
});

describe('SDK Configuration Validation', () => {
  beforeEach(async () => {
    await ghoststack.shutdown();
  });

  it('should throw ConfigError if serviceName is missing', () => {
    expect(() => {
      ghoststack.init({
        serviceName: '',
        environment: 'development',
      });
    }).toThrow(ghoststack.ConfigError);
  });

  it('should throw ConfigError in production if apiKey is missing', () => {
    expect(() => {
      ghoststack.init({
        serviceName: 'prod-svc',
        environment: 'production',
        endpoint: 'https://ghoststack.example.com',
        apiKey: '',
      });
    }).toThrow(ghoststack.ConfigError);
  });

  it('should throw ConfigError in production if endpoint is missing (no silent localhost fallback)', () => {
    expect(() => {
      ghoststack.init({
        serviceName: 'prod-svc',
        environment: 'production',
        apiKey: 'gs_live_secret123',
        endpoint: '',
      });
    }).toThrow(ghoststack.ConfigError);
  });

  it('should throw ConfigError if endpoint protocol is not http or https', () => {
    expect(() => {
      ghoststack.init({
        serviceName: 'test-svc',
        environment: 'development',
        endpoint: 'ftp://localhost:3000',
      });
    }).toThrow(ghoststack.ConfigError);
  });

  it('should throw ConfigError if sampleRate is out of range', () => {
    expect(() => {
      ghoststack.init({
        serviceName: 'test-svc',
        environment: 'development',
        sampleRate: 1.5,
      });
    }).toThrow(ghoststack.ConfigError);

    expect(() => {
      ghoststack.init({
        serviceName: 'test-svc',
        environment: 'development',
        sampleRate: -0.1,
      });
    }).toThrow(ghoststack.ConfigError);
  });
});
