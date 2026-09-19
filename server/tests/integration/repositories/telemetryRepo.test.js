const mongoose = require('mongoose');
const MongoTelemetryRepository = require('../../../src/infrastructure/repositories/MongoTelemetryRepository');
const TelemetryEvent = require('../../../src/domain/entities/TelemetryEvent');

describe('MongoTelemetryRepository', () => {
  let repo;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test');
    repo = new MongoTelemetryRepository();
  });

  beforeEach(async () => {
    await repo.deleteAll();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const makeEvent = (overrides = {}) => new TelemetryEvent({
    sourceService: 'checkout',
    timestamp: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  });

  describe('save', () => {
    it('should persist and return a domain entity', async () => {
      const event = makeEvent({ targetService: 'payment', statusCode: 200 });
      const saved = await repo.save(event);

      expect(saved).toBeInstanceOf(TelemetryEvent);
      expect(saved.eventId).toBe(event.eventId);
      expect(saved.sourceService).toBe('checkout');
    });
  });

  describe('findByTimeRange', () => {
    it('should find events within time range', async () => {
      await repo.save(makeEvent({ timestamp: new Date('2026-01-15T11:00:00Z') }));
      await repo.save(makeEvent({ timestamp: new Date('2026-01-15T12:00:00Z') }));
      await repo.save(makeEvent({ timestamp: new Date('2026-01-15T13:00:00Z') }));
      await repo.save(makeEvent({ timestamp: new Date('2026-01-15T14:00:00Z') }));

      const results = await repo.findByTimeRange(
        new Date('2026-01-15T11:30:00Z'),
        new Date('2026-01-15T13:30:00Z')
      );

      expect(results).toHaveLength(2);
    });

    it('should return results in descending timestamp order', async () => {
      await repo.save(makeEvent({ timestamp: new Date('2026-01-15T11:00:00Z') }));
      await repo.save(makeEvent({ timestamp: new Date('2026-01-15T13:00:00Z') }));

      const results = await repo.findByTimeRange(
        new Date('2026-01-15T10:00:00Z'),
        new Date('2026-01-15T14:00:00Z')
      );

      expect(results[0].timestamp.getTime()).toBeGreaterThan(results[1].timestamp.getTime());
    });
  });

  describe('findByService', () => {
    it('should find by source service', async () => {
      await repo.save(makeEvent({ sourceService: 'checkout' }));
      await repo.save(makeEvent({ sourceService: 'payment' }));

      const results = await repo.findByService('checkout', { role: 'source' });
      expect(results).toHaveLength(1);
      expect(results[0].sourceService).toBe('checkout');
    });

    it('should find by target service', async () => {
      await repo.save(makeEvent({ targetService: 'payment' }));
      await repo.save(makeEvent({ targetService: 'orders' }));

      const results = await repo.findByService('payment', { role: 'target' });
      expect(results).toHaveLength(1);
    });

    it('should find by either role with role=any', async () => {
      await repo.save(makeEvent({ sourceService: 'checkout', targetService: 'payment' }));
      await repo.save(makeEvent({ sourceService: 'payment', targetService: 'orders' }));
      await repo.save(makeEvent({ sourceService: 'auth', targetService: 'db' }));

      const results = await repo.findByService('payment');
      expect(results).toHaveLength(2);
    });

    it('should respect limit option', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(makeEvent({ timestamp: new Date(Date.now() + i * 1000) }));
      }
      const results = await repo.findByService('checkout', { limit: 3 });
      expect(results).toHaveLength(3);
    });
  });

  describe('findByTraceId', () => {
    it('should find all events with same traceId', async () => {
      await repo.save(makeEvent({ traceId: 'trace-abc' }));
      await repo.save(makeEvent({ traceId: 'trace-abc', sourceService: 'payment' }));
      await repo.save(makeEvent({ traceId: 'trace-other' }));

      const results = await repo.findByTraceId('trace-abc');
      expect(results).toHaveLength(2);
    });

    it('should return results in ascending timestamp order', async () => {
      await repo.save(makeEvent({ traceId: 'trace-1', timestamp: new Date('2026-01-15T13:00:00Z') }));
      await repo.save(makeEvent({ traceId: 'trace-1', timestamp: new Date('2026-01-15T11:00:00Z'), sourceService: 'other' }));

      const results = await repo.findByTraceId('trace-1');
      expect(results[0].timestamp.getTime()).toBeLessThan(results[1].timestamp.getTime());
    });
  });
});
