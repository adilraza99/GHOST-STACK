const IncidentEvent = require('../../../src/domain/entities/IncidentEvent');
const { ValidationError, InvalidEnumError } = require('../../../src/domain/errors');

describe('IncidentEvent Entity', () => {
  const validProps = {
    incidentId: 'incident-uuid-111',
    timestamp: new Date('2026-01-15T12:01:00Z'),
    serviceId: 'service-uuid-222',
    type: 'error',
    message: 'HTTP 500 from payment-service',
  };

  describe('creation', () => {
    it('should create with all required fields', () => {
      const event = new IncidentEvent(validProps);

      expect(event.eventId).toBeDefined();
      expect(event.eventId.length).toBe(36);
      expect(event.incidentId).toBe('incident-uuid-111');
      expect(event.timestamp).toEqual(new Date('2026-01-15T12:01:00Z'));
      expect(event.serviceId).toBe('service-uuid-222');
      expect(event.type).toBe('error');
      expect(event.message).toBe('HTTP 500 from payment-service');
      expect(event.metadata).toEqual({});
    });

    it('should accept all valid event types', () => {
      ['error', 'latency_spike', 'deployment', 'dependency_failure'].forEach((type) => {
        const event = new IncidentEvent({ ...validProps, type });
        expect(event.type).toBe(type);
      });
    });

    it('should parse string timestamps', () => {
      const event = new IncidentEvent({
        ...validProps,
        timestamp: '2026-01-15T12:01:00Z',
      });
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should trim the message', () => {
      const event = new IncidentEvent({ ...validProps, message: '  trimmed  ' });
      expect(event.message).toBe('trimmed');
    });
  });

  describe('validation', () => {
    it('should throw when props is null', () => {
      expect(() => new IncidentEvent(null)).toThrow(ValidationError);
    });

    it('should throw when incidentId is missing', () => {
      const { incidentId, ...rest } = validProps;
      expect(() => new IncidentEvent(rest)).toThrow('Incident ID is required');
    });

    it('should throw when serviceId is missing', () => {
      const { serviceId, ...rest } = validProps;
      expect(() => new IncidentEvent(rest)).toThrow('Service ID is required');
    });

    it('should throw when type is missing', () => {
      const { type, ...rest } = validProps;
      expect(() => new IncidentEvent(rest)).toThrow('Event type is required');
    });

    it('should throw when message is missing', () => {
      const { message, ...rest } = validProps;
      expect(() => new IncidentEvent(rest)).toThrow('Event message is required');
    });

    it('should throw when message is empty', () => {
      expect(() => new IncidentEvent({ ...validProps, message: '   ' }))
        .toThrow('Event message is required');
    });

    it('should throw InvalidEnumError for invalid type', () => {
      expect(() => new IncidentEvent({ ...validProps, type: 'timeout' }))
        .toThrow(InvalidEnumError);
    });

    it('should throw when timestamp is missing', () => {
      const { timestamp, ...rest } = validProps;
      expect(() => new IncidentEvent(rest)).toThrow('Timestamp is required');
    });

    it('should throw on invalid timestamp', () => {
      expect(() => new IncidentEvent({ ...validProps, timestamp: 'bad' }))
        .toThrow('Invalid timestamp');
    });
  });

  describe('toJSON', () => {
    it('should serialize correctly', () => {
      const event = new IncidentEvent(validProps);
      const json = event.toJSON();

      expect(json.eventId).toBe(event.eventId);
      expect(json.incidentId).toBe('incident-uuid-111');
      expect(typeof json.timestamp).toBe('string');
      expect(json.type).toBe('error');
      expect(json.message).toBe('HTTP 500 from payment-service');
    });
  });
});
