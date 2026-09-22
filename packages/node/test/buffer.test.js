const BoundedBuffer = require('../src/buffer');
const SDKStats = require('../src/stats');

describe('BoundedBuffer & Backpressure (Correction 13)', () => {
  it('should accept items up to maxBufferSize without dropping', () => {
    const stats = new SDKStats();
    const buffer = new BoundedBuffer({ maxBufferSize: 5, stats });

    for (let i = 1; i <= 5; i++) {
      const accepted = buffer.push({ id: i });
      expect(accepted).toBe(true);
    }

    expect(buffer.length).toBe(5);
    expect(stats.eventsBuffered).toBe(5);
    expect(stats.eventsDropped).toBe(0);
  });

  it('should drop oldest items when buffer exceeds capacity (drop-oldest policy)', () => {
    const stats = new SDKStats();
    const buffer = new BoundedBuffer({ maxBufferSize: 3, stats });

    buffer.push({ id: 1 });
    buffer.push({ id: 2 });
    buffer.push({ id: 3 });

    // Exceed capacity
    const accepted4 = buffer.push({ id: 4 });
    expect(accepted4).toBe(false); // dropped oldest
    expect(buffer.length).toBe(3);
    expect(stats.eventsDropped).toBe(1);

    const accepted5 = buffer.push({ id: 5 });
    expect(accepted5).toBe(false);
    expect(buffer.length).toBe(3);
    expect(stats.eventsDropped).toBe(2);

    // Remaining items should be 3, 4, 5 (1 and 2 dropped)
    const items = buffer.drain(10);
    expect(items).toEqual([{ id: 3 }, { id: 4 }, { id: 5 }]);
    expect(buffer.isEmpty()).toBe(true);
  });

  it('should drain up to requested batchSize', () => {
    const buffer = new BoundedBuffer({ maxBufferSize: 10 });
    for (let i = 1; i <= 7; i++) {
      buffer.push({ id: i });
    }

    const batch1 = buffer.drain(3);
    expect(batch1).toHaveLength(3);
    expect(buffer.length).toBe(4);

    const batch2 = buffer.drain(5);
    expect(batch2).toHaveLength(4);
    expect(buffer.isEmpty()).toBe(true);
  });

  it('should clear buffer and record dropped stats', () => {
    const stats = new SDKStats();
    const buffer = new BoundedBuffer({ maxBufferSize: 10, stats });
    buffer.push({ id: 1 });
    buffer.push({ id: 2 });

    buffer.clear();
    expect(buffer.isEmpty()).toBe(true);
    expect(stats.eventsDropped).toBe(2);
  });
});
