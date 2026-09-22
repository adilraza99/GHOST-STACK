/**
 * IncidentDetectionPolicy
 *
 * Domain policy encapsulating thresholds, sample sizes, and evaluation
 * logic for anomaly detection, severity calculation, and recovery verification.
 */
class IncidentDetectionPolicy {
  /**
   * @param {object} [options]
   * @param {number} [options.timeWindowMs=60000] - Rolling window for anomaly detection
   * @param {number} [options.minimumEvents=5] - Minimum requests required to trigger detection
   * @param {number} [options.errorRateThreshold=0.5] - Error rate threshold (>= 500 server errors)
   * @param {number} [options.latencyThresholdMs=5000] - Average latency threshold
   * @param {number} [options.recoveryErrorRateThreshold=0.1] - Error rate threshold for recovery (<= 10%)
   * @param {number} [options.recoveryLatencyThresholdMs=2000] - Latency threshold for recovery
   * @param {number} [options.recoveryObservationWindowMs=30000] - Window for recovery observation
   * @param {number} [options.minimumRecoveryEvents=3] - Minimum sample size to confirm recovery
   */
  constructor(options = {}) {
    this.timeWindowMs = options.timeWindowMs ?? options.detectionWindowMs ?? 60000;
    this.minimumEvents = options.minimumEvents ?? 5;
    this.errorRateThreshold = options.errorRateThreshold ?? 0.5;
    this.latencyThresholdMs = options.latencyThresholdMs ?? 5000;
    this.recoveryErrorRateThreshold = options.recoveryErrorRateThreshold ?? 0.1;
    this.recoveryLatencyThresholdMs = options.recoveryLatencyThresholdMs ?? 2000;
    this.recoveryObservationWindowMs = options.recoveryObservationWindowMs ?? 30000;
    this.minimumRecoveryEvents = options.minimumRecoveryEvents ?? 3;
  }

  /**
   * Analyzes an array of telemetry events to compute error rate and average latency.
   *
   * @param {Array<object>} events
   * @returns {{ errorCount: number, eventsWithStatus: number, errorRate: number, avgLatency: number|null, eventCount: number }}
   */
  analyzeEvents(events) {
    let errorCount = 0;
    let eventsWithStatus = 0;
    let latencySum = 0;
    let latencyCount = 0;

    for (const event of events) {
      if (event.statusCode !== null && event.statusCode !== undefined) {
        eventsWithStatus++;
        if (event.statusCode >= 500) {
          errorCount++;
        }
      }
      if (event.latencyMs !== null && event.latencyMs !== undefined) {
        latencySum += event.latencyMs;
        latencyCount++;
      }
    }

    return {
      errorCount,
      eventsWithStatus,
      errorRate: eventsWithStatus > 0 ? errorCount / eventsWithStatus : 0,
      avgLatency: latencyCount > 0 ? latencySum / latencyCount : null,
      eventCount: events.length,
    };
  }

  /**
   * Evaluates whether service analysis indicates an anomaly.
   *
   * @param {Array<object>|{ errorRate: number, avgLatency: number|null }} input - Array of events or analysis object
   * @param {number} [eventCount]
   * @returns {{ isAnomaly: boolean, triggers: string[], analysis: object }}
   */
  evaluateAnomaly(input, eventCount) {
    let analysis;
    let count;

    if (Array.isArray(input)) {
      analysis = this.analyzeEvents(input);
      count = input.length;
    } else {
      analysis = input;
      count = eventCount !== undefined ? eventCount : 0;
    }

    if (count < this.minimumEvents) {
      return { isAnomaly: false, triggers: [], analysis };
    }

    const triggers = [];
    if (analysis.errorRate > this.errorRateThreshold) {
      triggers.push('error_rate');
    }
    if (analysis.avgLatency !== null && analysis.avgLatency > this.latencyThresholdMs) {
      triggers.push('latency');
    }

    return {
      isAnomaly: triggers.length > 0,
      triggers,
      analysis,
    };
  }

  /**
   * Evaluates whether service health has recovered sufficiently to resolve an active incident.
   *
   * @param {Array<object>|{ errorRate: number, avgLatency: number|null }} input - Array of events or analysis object
   * @param {number} [eventCount]
   * @returns {{ isRecovered: boolean, recovered: boolean, reason: string, analysis: object }}
   */
  evaluateRecovery(input, eventCount) {
    let analysis;
    let count;

    if (Array.isArray(input)) {
      analysis = this.analyzeEvents(input);
      count = input.length;
    } else {
      analysis = input;
      count = eventCount !== undefined ? eventCount : 0;
    }

    if (count < this.minimumRecoveryEvents) {
      return { isRecovered: false, recovered: false, reason: 'insufficient_sample', analysis };
    }

    const errorRecovered = analysis.errorRate <= this.recoveryErrorRateThreshold;
    const latencyRecovered =
      analysis.avgLatency === null || analysis.avgLatency <= this.recoveryLatencyThresholdMs;

    if (errorRecovered && latencyRecovered) {
      return { isRecovered: true, recovered: true, reason: 'metrics_normalized', analysis };
    }

    return { isRecovered: false, recovered: false, reason: 'metrics_still_elevated', analysis };
  }

  /**
   * Calculates incident severity deterministically from anomaly metrics.
   *
   * @param {{ errorRate: number, avgLatency: number|null }} analysis
   * @param {string[]} triggers
   * @returns {'critical'|'high'|'medium'|'low'}
   */
  calculateSeverity(analysis, triggers) {
    const hasBothTriggers = triggers.includes('error_rate') && triggers.includes('latency');

    if (hasBothTriggers && analysis.errorRate > 0.8) return 'critical';
    if (hasBothTriggers) return 'high';
    if (analysis.errorRate > 0.8) return 'high';
    if (triggers.includes('error_rate')) return 'medium';
    return 'medium';
  }
}

module.exports = IncidentDetectionPolicy;
