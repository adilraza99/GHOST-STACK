const {
  DEPENDENCY_TYPES,
  validateDependencyType,
  SEVERITY_LEVELS,
  validateSeverity,
  INCIDENT_STATUSES,
  validateIncidentStatus,
  isValidStatusTransition,
  INCIDENT_EVENT_TYPES,
  validateIncidentEventType,
} = require('../../../src/domain/valueObjects');
const { InvalidEnumError } = require('../../../src/domain/errors');

describe('Value Objects', () => {
  describe('DependencyType', () => {
    it('should have exactly 4 allowed types', () => {
      expect(DEPENDENCY_TYPES).toEqual(['sync', 'async', 'database', 'external']);
      expect(Object.isFrozen(DEPENDENCY_TYPES)).toBe(true);
    });

    it('should validate valid types', () => {
      DEPENDENCY_TYPES.forEach((type) => {
        expect(validateDependencyType(type)).toBe(type);
      });
    });

    it('should throw InvalidEnumError for invalid type', () => {
      expect(() => validateDependencyType('grpc')).toThrow(InvalidEnumError);
      expect(() => validateDependencyType('grpc')).toThrow('dependencyType');
    });
  });

  describe('Severity', () => {
    it('should have 4 levels in order', () => {
      expect(SEVERITY_LEVELS).toEqual(['critical', 'high', 'medium', 'low']);
      expect(Object.isFrozen(SEVERITY_LEVELS)).toBe(true);
    });

    it('should validate valid severities', () => {
      SEVERITY_LEVELS.forEach((sev) => {
        expect(validateSeverity(sev)).toBe(sev);
      });
    });

    it('should reject invalid severity', () => {
      expect(() => validateSeverity('urgent')).toThrow(InvalidEnumError);
    });
  });

  describe('IncidentStatus', () => {
    it('should have 3 statuses', () => {
      expect(INCIDENT_STATUSES).toEqual(['detected', 'investigating', 'resolved']);
      expect(Object.isFrozen(INCIDENT_STATUSES)).toBe(true);
    });

    it('should validate valid statuses', () => {
      INCIDENT_STATUSES.forEach((status) => {
        expect(validateIncidentStatus(status)).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      expect(() => validateIncidentStatus('pending')).toThrow(InvalidEnumError);
    });

    describe('status transitions', () => {
      it('detected → investigating: valid', () => {
        expect(isValidStatusTransition('detected', 'investigating')).toBe(true);
      });

      it('detected → resolved: valid', () => {
        expect(isValidStatusTransition('detected', 'resolved')).toBe(true);
      });

      it('investigating → resolved: valid', () => {
        expect(isValidStatusTransition('investigating', 'resolved')).toBe(true);
      });

      it('resolved → anything: invalid (terminal)', () => {
        expect(isValidStatusTransition('resolved', 'detected')).toBe(false);
        expect(isValidStatusTransition('resolved', 'investigating')).toBe(false);
      });

      it('investigating → detected: invalid (backward)', () => {
        expect(isValidStatusTransition('investigating', 'detected')).toBe(false);
      });

      it('unknown status returns false', () => {
        expect(isValidStatusTransition('unknown', 'detected')).toBe(false);
      });
    });
  });

  describe('IncidentEventType', () => {
    it('should have 4 event types', () => {
      expect(INCIDENT_EVENT_TYPES).toEqual([
        'error', 'latency_spike', 'deployment', 'dependency_failure',
      ]);
      expect(Object.isFrozen(INCIDENT_EVENT_TYPES)).toBe(true);
    });

    it('should validate valid types', () => {
      INCIDENT_EVENT_TYPES.forEach((type) => {
        expect(validateIncidentEventType(type)).toBe(type);
      });
    });

    it('should reject invalid type', () => {
      expect(() => validateIncidentEventType('timeout')).toThrow(InvalidEnumError);
    });
  });
});
