/**
 * Bounded telemetry queue with deterministic drop-oldest backpressure policy.
 *
 * Guarantees:
 * 1. Strictly bounded memory: buffer length never exceeds maxBufferSize.
 * 2. Predictable drop policy: oldest spans are dropped to accommodate new spans.
 * 3. Diagnostics: records dropped and buffered counts to SDKStats.
 */

class BoundedBuffer {
  /**
   * @param {object} options
   * @param {number} [options.maxBufferSize=1000]
   * @param {import('./stats')} [options.stats]
   */
  constructor({ maxBufferSize = 1000, stats = null } = {}) {
    this.maxBufferSize = Math.max(1, maxBufferSize);
    this.stats = stats;
    this.queue = [];
  }

  get size() {
    return this.queue.length;
  }

  get length() {
    return this.queue.length;
  }

  /**
   * Enqueues an item into the buffer.
   * If capacity is reached, drops the oldest item to preserve memory bounds.
   *
   * @param {*} item
   * @returns {boolean} True if accepted without drop, false if dropped oldest
   */
  push(item) {
    let dropped = false;

    if (this.queue.length >= this.maxBufferSize) {
      this.queue.shift(); // Drop oldest
      dropped = true;
      if (this.stats) {
        this.stats.recordDropped(1);
      }
    }

    this.queue.push(item);
    if (this.stats) {
      this.stats.recordBuffered(1);
    }

    return !dropped;
  }

  /**
   * Drains up to batchSize items from the front of the queue.
   *
   * @param {number} batchSize
   * @returns {Array<*>} Drained items
   */
  drain(batchSize = 100) {
    if (this.queue.length === 0) return [];
    const count = Math.min(this.queue.length, Math.max(1, batchSize));
    return this.queue.splice(0, count);
  }

  /**
   * Returns a copy of all current items without draining.
   * @returns {Array<*>}
   */
  peekAll() {
    return [...this.queue];
  }

  /**
   * Returns current queue length.
   * @returns {number}
   */
  get length() {
    return this.queue.length;
  }

  /**
   * Checks if buffer is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.queue.length === 0;
  }

  /**
   * Clears all items in the queue.
   */
  clear() {
    const droppedCount = this.queue.length;
    this.queue = [];
    if (this.stats && droppedCount > 0) {
      this.stats.recordDropped(droppedCount);
    }
  }
}

module.exports = BoundedBuffer;
