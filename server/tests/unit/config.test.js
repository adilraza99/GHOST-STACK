describe('Config', () => {
  it('should load default configuration values', () => {
    // Clear any cached module to test defaults
    delete require.cache[require.resolve('../../src/config')];

    // Preserve original env and set clean state for test
    const originalEnv = { ...process.env };
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.MONGO_URI;
    delete process.env.LOG_LEVEL;

    const { config } = require('../../src/config');

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.mongoUri).toBe('mongodb://localhost:27017/ghoststack');
    expect(config.logLevel).toBe('info');

    // Restore env
    Object.assign(process.env, originalEnv);
  });

  it('should detect environment correctly', () => {
    delete require.cache[require.resolve('../../src/config')];
    process.env.NODE_ENV = 'production';
    const { config } = require('../../src/config');
    expect(config.isProduction()).toBe(true);
    expect(config.isDevelopment()).toBe(false);
    expect(config.isTest()).toBe(false);
    process.env.NODE_ENV = 'development';
  });

  it('should validate config and throw on invalid port', () => {
    delete require.cache[require.resolve('../../src/config')];
    process.env.PORT = '99999';
    const { config, validateConfig } = require('../../src/config');
    expect(() => validateConfig()).toThrow('PORT must be between 1 and 65535');
    delete process.env.PORT;
  });

  it('should validate config and throw on invalid log level', () => {
    delete require.cache[require.resolve('../../src/config')];
    process.env.LOG_LEVEL = 'invalid';
    const { validateConfig } = require('../../src/config');
    expect(() => validateConfig()).toThrow('LOG_LEVEL must be one of');
    delete process.env.LOG_LEVEL;
  });

  it('should load incident thresholds with defaults', () => {
    delete require.cache[require.resolve('../../src/config')];
    const { config } = require('../../src/config');
    expect(config.incidents.errorRateThreshold).toBe(0.5);
    expect(config.incidents.latencyThresholdMs).toBe(5000);
    expect(config.incidents.minimumEvents).toBe(5);
    expect(config.incidents.timeWindowMs).toBe(60000);
  });
});
