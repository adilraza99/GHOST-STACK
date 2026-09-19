const LocalEventBus = require('../../../src/infrastructure/eventBus/LocalEventBus');

describe('LocalEventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new LocalEventBus();
  });

  describe('subscribe', () => {
    it('should register a handler', () => {
      bus.subscribe('test.event', () => {});
      expect(bus.subscriberCount('test.event')).toBe(1);
    });

    it('should register multiple handlers for the same event', () => {
      bus.subscribe('test.event', () => {});
      bus.subscribe('test.event', () => {});
      expect(bus.subscriberCount('test.event')).toBe(2);
    });

    it('should throw if handler is not a function', () => {
      expect(() => bus.subscribe('test.event', 'not-a-function'))
        .toThrow('Event handler must be a function');
    });

    it('should return 0 for unsubscribed events', () => {
      expect(bus.subscriberCount('unknown')).toBe(0);
    });
  });

  describe('publish', () => {
    it('should call handler with payload', async () => {
      const received = [];
      bus.subscribe('test.event', (payload) => {
        received.push(payload);
      });

      await bus.publish('test.event', { data: 'hello' });
      expect(received).toEqual([{ data: 'hello' }]);
    });

    it('should call all handlers for an event', async () => {
      let count = 0;
      bus.subscribe('test.event', () => { count += 1; });
      bus.subscribe('test.event', () => { count += 1; });
      bus.subscribe('test.event', () => { count += 1; });

      await bus.publish('test.event', {});
      expect(count).toBe(3);
    });

    it('should not throw when publishing with no subscribers', async () => {
      await expect(bus.publish('unknown.event', {})).resolves.toBeUndefined();
    });

    it('should handle async handlers', async () => {
      const results = [];
      bus.subscribe('async.event', async (payload) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(payload.value);
      });

      await bus.publish('async.event', { value: 42 });
      expect(results).toEqual([42]);
    });

    it('should isolate subscriber failures — one failing handler must not break others', async () => {
      const results = [];

      bus.subscribe('fail.event', () => {
        results.push('first');
      });
      bus.subscribe('fail.event', () => {
        throw new Error('deliberate failure');
      });
      bus.subscribe('fail.event', () => {
        results.push('third');
      });

      // Should not throw
      await bus.publish('fail.event', {});

      // First and third should still execute
      expect(results).toContain('first');
      expect(results).toContain('third');
    });

    it('should isolate async subscriber failures', async () => {
      const results = [];

      bus.subscribe('async.fail', async () => {
        results.push('success');
      });
      bus.subscribe('async.fail', async () => {
        throw new Error('async failure');
      });

      await bus.publish('async.fail', {});
      expect(results).toEqual(['success']);
    });

    it('should not mix events between different types', async () => {
      const aResults = [];
      const bResults = [];

      bus.subscribe('event.a', (p) => aResults.push(p));
      bus.subscribe('event.b', (p) => bResults.push(p));

      await bus.publish('event.a', { from: 'a' });
      expect(aResults).toEqual([{ from: 'a' }]);
      expect(bResults).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all subscribers', () => {
      bus.subscribe('a', () => {});
      bus.subscribe('b', () => {});
      bus.clear();
      expect(bus.subscriberCount('a')).toBe(0);
      expect(bus.subscriberCount('b')).toBe(0);
    });
  });
});
