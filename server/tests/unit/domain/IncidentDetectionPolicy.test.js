const IncidentDetectionPolicy = require('../../../src/domain/entities/IncidentDetectionPolicy');

describe('IncidentDetectionPolicy', () => {
  let policy;

  beforeEach(() => {
    policy = new IncidentDetectionPolicy({
      timeWindowMs: 60000,
      minimumEvents: 5,
      errorRateThreshold: 0.5,
      latencyThresholdMs: 5000,
      recoveryErrorRateThreshold: 0.1,
      recoveryLatencyThresholdMs: 2000,
      recoveryObservationWindowMs: 30000,
      minimumRecoveryEvents: 3,
    });
  });

  describe('defaults', () => {
    it('should initialize with sane defaults when options are omitted', () => {
      const defaultPolicy = new IncidentDetectionPolicy();
      expect(defaultPolicy.timeWindowMs).toBe(60000);
      expect(defaultPolicy.minimumEvents).toBe(5);
      expect(defaultPolicy.errorRateThreshold).toBe(0.5);
      expect(defaultPolicy.latencyThresholdMs).toBe(5000);
      expect(defaultPolicy.recoveryErrorRateThreshold).toBe(0.1);
      expect(defaultPolicy.recoveryLatencyThresholdMs).toBe(2000);
      expect(defaultPolicy.recoveryObservationWindowMs).toBe(30000);
      expect(defaultPolicy.minimumRecoveryEvents).toBe(3);
    });
  });

  describe('evaluateAnomaly', () => {
    it('should not trigger anomaly when eventCount < minimumEvents', () => {
      const result = policy.evaluateAnomaly({ errorRate: 0.8, avgLatency: 8000 }, 4);
      expect(result.isAnomaly).toBe(false);
      expect(result.triggers).toEqual([]);
    });

    it('should trigger on errorRate exceeding threshold', () => {
      const result = policy.evaluateAnomaly({ errorRate: 0.55, avgLatency: 100 }, 5);
      expect(result.isAnomaly).toBe(true);
      expect(result.triggers).toEqual(['error_rate']);
    });

    it('should trigger on latency exceeding threshold', () => {
      const result = policy.evaluateAnomaly({ errorRate: 0.0, avgLatency: 5200 }, 6);
      expect(result.isAnomaly).toBe(true);
      expect(result.triggers).toEqual(['latency']);
    });

    it('should trigger on both errorRate and latency', () => {
      const result = policy.evaluateAnomaly({ errorRate: 0.6, avgLatency: 6000 }, 10);
      expect(result.isAnomaly).toBe(true);
      expect(result.triggers).toEqual(['error_rate', 'latency']);
    });

    it('should NOT trigger when metrics are exactly at threshold', () => {
      const result = policy.evaluateAnomaly({ errorRate: 0.5, avgLatency: 5000 }, 10);
      expect(result.isAnomaly).toBe(false);
      expect(result.triggers).toEqual([]);
    });
  });

  describe('evaluateRecovery', () => {
    it('should not confirm recovery when eventCount < minimumRecoveryEvents', () => {
      const result = policy.evaluateRecovery({ errorRate: 0.0, avgLatency: 50 }, 2);
      expect(result.isRecovered).toBe(false);
      expect(result.reason).toBe('insufficient_sample');
    });

    it('should confirm recovery when errorRate and latency are within recovery thresholds', () => {
      const result = policy.evaluateRecovery({ errorRate: 0.05, avgLatency: 300 }, 3);
      expect(result.isRecovered).toBe(true);
      expect(result.reason).toBe('metrics_normalized');
    });

    it('should confirm recovery when avgLatency is null (no latency values) and errorRate is low', () => {
      const result = policy.evaluateRecovery({ errorRate: 0.0, avgLatency: null }, 5);
      expect(result.isRecovered).toBe(true);
      expect(result.reason).toBe('metrics_normalized');
    });

    it('should not confirm recovery if errorRate is still above recovery threshold', () => {
      const result = policy.evaluateRecovery({ errorRate: 0.2, avgLatency: 200 }, 5);
      expect(result.isRecovered).toBe(false);
      expect(result.reason).toBe('metrics_still_elevated');
    });

    it('should not confirm recovery if avgLatency is still above recovery threshold', () => {
      const result = policy.evaluateRecovery({ errorRate: 0.05, avgLatency: 3000 }, 5);
      expect(result.isRecovered).toBe(false);
      expect(result.reason).toBe('metrics_still_elevated');
    });
  });

  describe('calculateSeverity', () => {
    it('should return critical when both triggers and errorRate > 0.8', () => {
      expect(policy.calculateSeverity({ errorRate: 0.85, avgLatency: 7000 }, ['error_rate', 'latency'])).toBe('critical');
    });

    it('should return high when both triggers but errorRate <= 0.8', () => {
      expect(policy.calculateSeverity({ errorRate: 0.6, avgLatency: 7000 }, ['error_rate', 'latency'])).toBe('high');
    });

    it('should return high when only error_rate trigger but errorRate > 0.8', () => {
      expect(policy.calculateSeverity({ errorRate: 0.9, avgLatency: 100 }, ['error_rate'])).toBe('high');
    });

    it('should return medium when only error_rate trigger and errorRate <= 0.8', () => {
      expect(policy.calculateSeverity({ errorRate: 0.6, avgLatency: 100 }, ['error_rate'])).toBe('medium');
    });

    it('should return medium when only latency trigger', () => {
      expect(policy.calculateSeverity({ errorRate: 0.0, avgLatency: 6000 }, ['latency'])).toBe('medium');
    });
  });
});
