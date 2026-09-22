const { resolveConfig, normalizeEndpoint, ConfigError } = require('../src/config');

describe('Config Resolution and Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GHOSTSTACK_API_KEY;
    delete process.env.GHOSTSTACK_SERVICE_NAME;
    delete process.env.GHOSTSTACK_ENDPOINT;
    delete process.env.GHOSTSTACK_ENVIRONMENT;
    delete process.env.GHOSTSTACK_SAMPLE_RATE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('normalizeEndpoint', () => {
    it('should normalize bare domain to /v1/traces', () => {
      expect(normalizeEndpoint('https://api.ghoststack.com'))
        .toBe('https://api.ghoststack.com/v1/traces');
    });

    it('should normalize trailing slash without double slashes', () => {
      expect(normalizeEndpoint('https://api.ghoststack.com/'))
        .toBe('https://api.ghoststack.com/v1/traces');
    });

    it('should preserve existing /v1/traces without duplicating path', () => {
      expect(normalizeEndpoint('https://api.ghoststack.com/v1/traces'))
        .toBe('https://api.ghoststack.com/v1/traces');
    });

    it('should preserve /api/otlp/v1/traces for internal compatibility', () => {
      expect(normalizeEndpoint('https://api.ghoststack.com/api/otlp/v1/traces'))
        .toBe('https://api.ghoststack.com/api/otlp/v1/traces');
    });

    it('should throw on invalid URL protocol', () => {
      expect(() => normalizeEndpoint('ftp://api.ghoststack.com'))
        .toThrow(ConfigError);
    });

    it('should throw on unparseable URL', () => {
      expect(() => normalizeEndpoint('not-a-valid-url'))
        .toThrow(ConfigError);
    });
  });

  describe('resolveConfig', () => {
    it('should throw ConfigError if serviceName is missing', () => {
      expect(() => resolveConfig({}))
        .toThrow(/serviceName is required/);
    });

    it('should resolve minimal valid development config with localhost fallback', () => {
      const cfg = resolveConfig({
        serviceName: 'dev-service',
        environment: 'development',
      });

      expect(cfg.serviceName).toBe('dev-service');
      expect(cfg.environment).toBe('development');
      expect(cfg.endpoint).toBe('http://localhost:3000/v1/traces');
      expect(cfg.sampleRate).toBe(1.0);
    });

    it('should reject localhost fallback in production when no endpoint is configured', () => {
      expect(() => resolveConfig({
        serviceName: 'prod-service',
        environment: 'production',
        apiKey: 'gh_live_12345',
      })).toThrow(/An explicit endpoint is required in production/);
    });

    it('should require apiKey in production if not disabled', () => {
      expect(() => resolveConfig({
        serviceName: 'prod-service',
        environment: 'production',
        endpoint: 'https://api.ghoststack.com',
      })).toThrow(/apiKey is required in production/);
    });

    it('should prioritize explicit options over environment variables', () => {
      process.env.GHOSTSTACK_SERVICE_NAME = 'env-service';
      process.env.GHOSTSTACK_ENVIRONMENT = 'staging';
      process.env.GHOSTSTACK_ENDPOINT = 'https://env.ghoststack.com';

      const cfg = resolveConfig({
        serviceName: 'explicit-service',
        environment: 'production',
        endpoint: 'https://explicit.ghoststack.com',
        apiKey: 'gh_live_xyz',
      });

      expect(cfg.serviceName).toBe('explicit-service');
      expect(cfg.environment).toBe('production');
      expect(cfg.endpoint).toBe('https://explicit.ghoststack.com/v1/traces');
    });

    it('should validate sampleRate is between 0.0 and 1.0', () => {
      expect(() => resolveConfig({
        serviceName: 'test',
        environment: 'development',
        sampleRate: 1.5,
      })).toThrow(/sampleRate must be a number between 0.0 and 1.0/);

      expect(() => resolveConfig({
        serviceName: 'test',
        environment: 'development',
        sampleRate: -0.1,
      })).toThrow(/sampleRate must be a number between 0.0 and 1.0/);
    });
  });
});
