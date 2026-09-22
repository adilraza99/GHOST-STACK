/**
 * Safe diagnostic statistics tracker for @ghoststack/node.
 *
 * Tracks:
 * - eventsBuffered: currently in buffer
 * - eventsSent: total successfully transmitted
 * - eventsDropped: total discarded due to buffer overflow
 * - eventsFailed: total failed transmissions
 * - eventsRetried: total retry attempts
 * - attributesTruncated: total attributes truncated to fit bounds
 * - lastSuccessAt: ISO string timestamp of last successful flush
 * - lastFailureAt: ISO string timestamp of last transmission error
 */

class SDKStats {
  constructor() {
    this.eventsBuffered = 0;
    this.eventsSent = 0;
    this.eventsDropped = 0;
    this.eventsFailed = 0;
    this.eventsRetried = 0;
    this.attributesTruncated = 0;
    this.lastSuccessAt = null;
    this.lastFailureAt = null;
  }

  recordBuffered(count = 1) {
    this.eventsBuffered += count;
  }

  recordSent(count = 1) {
    this.eventsSent += count;
    this.eventsBuffered = Math.max(0, this.eventsBuffered - count);
    this.lastSuccessAt = new Date().toISOString();
  }

  recordDropped(count = 1) {
    this.eventsDropped += count;
    this.eventsBuffered = Math.max(0, this.eventsBuffered - count);
  }

  recordFailed(count = 1) {
    this.eventsFailed += count;
    this.lastFailureAt = new Date().toISOString();
  }

  recordRetried(count = 1) {
    this.eventsRetried += count;
  }

  recordAttributeTruncated(count = 1) {
    this.attributesTruncated += count;
  }

  getSnapshot() {
    return this.toJSON();
  }

  toJSON() {
    return {
      eventsBuffered: this.eventsBuffered,
      eventsSent: this.eventsSent,
      eventsDropped: this.eventsDropped,
      eventsFailed: this.eventsFailed,
      eventsRetried: this.eventsRetried,
      attributesTruncated: this.attributesTruncated,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
    };
  }

  reset() {
    this.eventsBuffered = 0;
    this.eventsSent = 0;
    this.eventsDropped = 0;
    this.eventsFailed = 0;
    this.eventsRetried = 0;
    this.attributesTruncated = 0;
    this.lastSuccessAt = null;
    this.lastFailureAt = null;
  }
}

module.exports = SDKStats;
