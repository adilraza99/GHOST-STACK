const TelemetryEvent = require('../../../src/domain/entities/TelemetryEvent');
const { ValidationError } = require('../../../src/domain/errors');

describe('TelemetryEvent Entity', () => {
  const validProps = {
    sourceService: 'checkout-service',
    timestamp: new Date('2026-01-15T12:00:00Z'),
  };

  describe('creation', () => {
    it('should create with only required fields', () => {
      const event = new TelemetryEvent(validProps);

      expect(event.eventId).toBeDefined();
      expect(event.eventId.length).toBe(36);
      expect(event.sourceService).toBe('checkout-service');
      expect(event.timestamp).toEqual(new Date('2026-01-15T12:00:00Z'));
      expect(event.targetService).toBeNull();
      expect(event.endpoint).toBeNull();
      expect(event.method).toBeNull();
      expect(event.statusCode).toBeNull();
      expect(event.latencyMs).toBeNull();
      expect(event.traceId).toBeNull();
      expect(event.requestId).toBeNull();
      expect(event.environment).toBeNull();
      expect(event.metadata).toEqual({});
    });

    it('should create with all fields', () => {
      const event = new TelemetryEvent({
        sourceService: 'checkout-service',
        targetService: 'payment-service',
        timestamp: new Date('2026-01-15T12:00:00Z'),
        endpoint: '/api/payment',
        method: 'post',
        statusCode: 200,
        latencyMs: 150,
        traceId: 'trace-123',
        requestId: 'req-456',
        environment: 'demo',
        metadata: { region: 'us-east-1' },
      });

      expect(event.targetService).toBe('payment-service');
      expect(event.endpoint).toBe('/api/payment');
      expect(event.method).toBe('POST'); // uppercased
      expect(event.statusCode).toBe(200);
      expect(event.latencyMs).toBe(150);
      expect(event.traceId).toBe('trace-123');
      expect(event.environment).toBe('demo');
    });

    it('should parse string timestamps', () => {
      const event = new TelemetryEvent({
        ...validProps,
        timestamp: '2026-01-15T12:00:00Z',
      });
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestamp.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    });

    it('should uppercase HTTP method', () => {
      const event = new TelemetryEvent({ ...validProps, method: 'get' });
      expect(event.method).toBe('GET');
    });

    it('should trim service names', () => {
      const event = new TelemetryEvent({
        ...validProps,
        sourceService: '  checkout  ',
        targetService: '  payment  ',
      });
      expect(event.sourceService).toBe('checkout');
      expect(event.targetService).toBe('payment');
    });
  });

  describe('validation', () => {
    it('should throw when props is null', () => {
      expect(() => new TelemetryEvent(null)).toThrow(ValidationError);
    });

    it('should throw when sourceService is missing', () => {
      expect(() => new TelemetryEvent({ timestamp: new Date() }))
        .toThrow('Source service is required');
    });

    it('should throw when timestamp is missing', () => {
      expect(() => new TelemetryEvent({ sourceService: 'svc' }))
        .toThrow('Timestamp is required');
    });

    it('should throw on invalid timestamp', () => {
      expect(() => new TelemetryEvent({
        sourceService: 'svc',
        timestamp: 'not-a-date',
      })).toThrow('Invalid timestamp');
    });

    it('should throw on invalid statusCode (too low)', () => {
      expect(() => new TelemetryEvent({ ...validProps, statusCode: 99 }))
        .toThrow('Status code must be between 100 and 599');
    });

    it('should throw on invalid statusCode (too high)', () => {
      expect(() => new TelemetryEvent({ ...validProps, statusCode: 600 }))
        .toThrow('Status code must be between 100 and 599');
    });

    it('should throw on negative latencyMs', () => {
      expect(() => new TelemetryEvent({ ...validProps, latencyMs: -1 }))
        .toThrow('Latency must be a non-negative number');
    });

    it('should throw on non-numeric latencyMs', () => {
      expect(() => new TelemetryEvent({ ...validProps, latencyMs: 'fast' }))
        .toThrow('Latency must be a non-negative number');
    });
  });

  describe('helper methods', () => {
    it('isError should return true for 5xx', () => {
      const event = new TelemetryEvent({ ...validProps, statusCode: 500 });
      expect(event.isError()).toBe(true);
    });

    it('isError should return false for 2xx', () => {
      const event = new TelemetryEvent({ ...validProps, statusCode: 200 });
      expect(event.isError()).toBe(false);
    });

    it('isError should return false when no statusCode', () => {
      const event = new TelemetryEvent(validProps);
      expect(event.isError()).toBe(false);
    });

    it('isClientError should return true for 4xx', () => {
      const event = new TelemetryEvent({ ...validProps, statusCode: 404 });
      expect(event.isClientError()).toBe(true);
    });

    it('isClientError should return false for 5xx', () => {
      const event = new TelemetryEvent({ ...validProps, statusCode: 500 });
      expect(event.isClientError()).toBe(false);
    });

    it('hasDependency should return true when targetService exists', () => {
      const event = new TelemetryEvent({ ...validProps, targetService: 'payment' });
      expect(event.hasDependency()).toBe(true);
    });

    it('hasDependency should return false when no targetService', () => {
      const event = new TelemetryEvent(validProps);
      expect(event.hasDependency()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should serialize timestamp as ISO string', () => {
      const event = new TelemetryEvent(validProps);
      const json = event.toJSON();
      expect(typeof json.timestamp).toBe('string');
      expect(json.timestamp).toBe(event.timestamp.toISOString());
    });
  });
});
