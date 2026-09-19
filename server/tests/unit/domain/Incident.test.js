const Incident = require('../../../src/domain/entities/Incident');
const { ValidationError, InvalidEnumError, InvalidStateError } = require('../../../src/domain/errors');

describe('Incident Entity', () => {
  const validProps = {
    title: 'Payment service degradation',
    severity: 'high',
  };

  describe('creation', () => {
    it('should create with required fields and defaults', () => {
      const incident = new Incident(validProps);

      expect(incident.incidentId).toBeDefined();
      expect(incident.incidentId.length).toBe(36);
      expect(incident.title).toBe('Payment service degradation');
      expect(incident.status).toBe('detected'); // default
      expect(incident.severity).toBe('high');
      expect(incident.startedAt).toBeInstanceOf(Date);
      expect(incident.endedAt).toBeNull();
      expect(incident.trigger).toBeNull();
      expect(incident.affectedServices).toEqual([]);
      expect(incident.events).toEqual([]);
      expect(incident.metadata).toEqual({});
    });

    it('should accept all valid severity levels', () => {
      ['critical', 'high', 'medium', 'low'].forEach((sev) => {
        const incident = new Incident({ ...validProps, severity: sev });
        expect(incident.severity).toBe(sev);
      });
    });

    it('should accept all valid statuses', () => {
      ['detected', 'investigating'].forEach((status) => {
        const incident = new Incident({ ...validProps, status });
        expect(incident.status).toBe(status);
      });
    });

    it('should accept resolved status with endedAt', () => {
      const ended = new Date();
      const incident = new Incident({
        ...validProps,
        status: 'resolved',
        endedAt: ended,
      });
      expect(incident.status).toBe('resolved');
      expect(incident.endedAt).toBe(ended);
    });

    it('should make defensive copies of arrays', () => {
      const services = ['svc-1', 'svc-2'];
      const incident = new Incident({ ...validProps, affectedServices: services });
      services.push('svc-3');
      expect(incident.affectedServices).toEqual(['svc-1', 'svc-2']);
    });
  });

  describe('validation', () => {
    it('should throw when props is null', () => {
      expect(() => new Incident(null)).toThrow(ValidationError);
    });

    it('should throw when title is missing', () => {
      expect(() => new Incident({ severity: 'high' })).toThrow('Incident title is required');
    });

    it('should throw when title is empty', () => {
      expect(() => new Incident({ title: '  ', severity: 'high' }))
        .toThrow('Incident title is required');
    });

    it('should throw when severity is missing', () => {
      expect(() => new Incident({ title: 'test' })).toThrow('Incident severity is required');
    });

    it('should throw InvalidEnumError for invalid severity', () => {
      expect(() => new Incident({ title: 'test', severity: 'extreme' }))
        .toThrow(InvalidEnumError);
    });

    it('should throw InvalidEnumError for invalid status', () => {
      expect(() => new Incident({ ...validProps, status: 'pending' }))
        .toThrow(InvalidEnumError);
    });

    it('should throw InvalidStateError when endedAt set on non-resolved incident', () => {
      expect(() => new Incident({ ...validProps, endedAt: new Date() }))
        .toThrow(InvalidStateError);
      expect(() => new Incident({ ...validProps, endedAt: new Date() }))
        .toThrow('endedAt can only be set when status is resolved');
    });
  });

  describe('transitionTo', () => {
    it('should transition from detected to investigating', () => {
      const incident = new Incident(validProps);
      incident.transitionTo('investigating');
      expect(incident.status).toBe('investigating');
    });

    it('should transition from detected to resolved', () => {
      const incident = new Incident(validProps);
      incident.transitionTo('resolved');
      expect(incident.status).toBe('resolved');
      expect(incident.endedAt).toBeInstanceOf(Date);
    });

    it('should transition from investigating to resolved', () => {
      const incident = new Incident({ ...validProps, status: 'investigating' });
      incident.transitionTo('resolved');
      expect(incident.status).toBe('resolved');
    });

    it('should NOT allow transition from resolved (terminal state)', () => {
      const incident = new Incident({ ...validProps, status: 'resolved', endedAt: new Date() });
      expect(() => incident.transitionTo('investigating'))
        .toThrow(InvalidStateError);
    });

    it('should NOT allow transition from investigating to detected', () => {
      const incident = new Incident({ ...validProps, status: 'investigating' });
      expect(() => incident.transitionTo('detected'))
        .toThrow(InvalidStateError);
    });

    it('should throw on invalid target status', () => {
      const incident = new Incident(validProps);
      expect(() => incident.transitionTo('invalid'))
        .toThrow(InvalidEnumError);
    });
  });

  describe('addAffectedService', () => {
    it('should add a service', () => {
      const incident = new Incident(validProps);
      incident.addAffectedService('svc-1');
      expect(incident.affectedServices).toContain('svc-1');
    });

    it('should not add duplicates', () => {
      const incident = new Incident(validProps);
      incident.addAffectedService('svc-1');
      incident.addAffectedService('svc-1');
      expect(incident.affectedServices).toEqual(['svc-1']);
    });
  });

  describe('addEvent', () => {
    it('should add an event ID', () => {
      const incident = new Incident(validProps);
      incident.addEvent('evt-1');
      expect(incident.events).toContain('evt-1');
    });

    it('should not add duplicate event IDs', () => {
      const incident = new Incident(validProps);
      incident.addEvent('evt-1');
      incident.addEvent('evt-1');
      expect(incident.events).toEqual(['evt-1']);
    });
  });

  describe('isActive', () => {
    it('should return true when detected', () => {
      expect(new Incident(validProps).isActive()).toBe(true);
    });

    it('should return true when investigating', () => {
      expect(new Incident({ ...validProps, status: 'investigating' }).isActive()).toBe(true);
    });

    it('should return false when resolved', () => {
      expect(new Incident({ ...validProps, status: 'resolved', endedAt: new Date() }).isActive())
        .toBe(false);
    });
  });

  describe('getDurationMs', () => {
    it('should return null when not resolved', () => {
      expect(new Incident(validProps).getDurationMs()).toBeNull();
    });

    it('should return duration when resolved', () => {
      const start = new Date('2026-01-15T12:00:00Z');
      const end = new Date('2026-01-15T12:05:00Z');
      const incident = new Incident({
        ...validProps,
        status: 'resolved',
        startedAt: start,
        endedAt: end,
      });
      expect(incident.getDurationMs()).toBe(5 * 60 * 1000); // 5 minutes
    });
  });

  describe('toJSON', () => {
    it('should include durationMs', () => {
      const incident = new Incident(validProps);
      const json = incident.toJSON();
      expect(json.durationMs).toBeNull();
      expect(typeof json.startedAt).toBe('string');
      expect(json.endedAt).toBeNull();
    });
  });
});
