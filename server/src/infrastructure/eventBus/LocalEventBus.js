const { logger } = require('../logging');

/**
 * Local in-process event bus.
 *
 * Simple pub/sub for decoupling application components.
 * Interface is designed to be replaceable with AWS EventBridge/SQS later.
 *
 * Key guarantees:
 * - One failing subscriber does NOT break other subscribers.
 * - Async handlers are awaited but failures are caught individually.
 * - Events are fire-and-forget from the publisher's perspective.
 */
class LocalEventBus {
  constructor() {
    /** @type {Map<string, Function[]>} */
    this._subscribers = new Map();
  }

  /**
   * Subscribe to an event type.
   * @param {string} eventType
   * @param {Function} handler - async or sync function(payload)
   */
  subscribe(eventType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }
    if (!this._subscribers.has(eventType)) {
      this._subscribers.set(eventType, []);
    }
    this._subscribers.get(eventType).push(handler);
  }

  /**
   * Publish an event to all subscribers of the given type.
   * Each subscriber is called independently — one failure doesn't affect others.
   *
   * @param {string} eventType
   * @param {object} payload
   */
  async publish(eventType, payload) {
    const handlers = this._subscribers.get(eventType);
    if (!handlers || handlers.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      handlers.map((handler) => {
        try {
          return Promise.resolve(handler(payload));
        } catch (err) {
          return Promise.reject(err);
        }
      })
    );

    // Log failures but don't throw — publisher should not be affected
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error(
          { eventType, err: result.reason },
          'Event subscriber failed'
        );
      }
    }
  }

  /**
   * Returns the count of subscribers for an event type.
   * @param {string} eventType
   * @returns {number}
   */
  subscriberCount(eventType) {
    const handlers = this._subscribers.get(eventType);
    return handlers ? handlers.length : 0;
  }

  /**
   * Removes all subscribers. Useful for testing and demo reset.
   */
  clear() {
    this._subscribers.clear();
  }
}

module.exports = LocalEventBus;
