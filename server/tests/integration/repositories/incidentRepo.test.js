const mongoose = require('mongoose');
const MongoIncidentRepository = require('../../../src/infrastructure/repositories/MongoIncidentRepository');
const MongoIncidentEventRepository = require('../../../src/infrastructure/repositories/MongoIncidentEventRepository');
const Incident = require('../../../src/domain/entities/Incident');
const IncidentEvent = require('../../../src/domain/entities/IncidentEvent');

describe('MongoIncidentRepository', () => {
  let repo;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test');
    repo = new MongoIncidentRepository();
  });

  beforeEach(async () => {
    await repo.deleteAll();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const makeIncident = (overrides = {}) => new Incident({
    title: 'Test incident',
    severity: 'high',
    ...overrides,
  });

  describe('save and findById', () => {
    it('should persist and retrieve an incident', async () => {
      const incident = makeIncident();
      await repo.save(incident);

      const found = await repo.findById(incident.incidentId);
      expect(found).toBeInstanceOf(Incident);
      expect(found.incidentId).toBe(incident.incidentId);
      expect(found.title).toBe('Test incident');
      expect(found.severity).toBe('high');
      expect(found.status).toBe('detected');
    });

    it('should return null for nonexistent incident', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return incidents sorted by startedAt descending', async () => {
      await repo.save(makeIncident({ title: 'old', startedAt: new Date('2026-01-01') }));
      await repo.save(makeIncident({ title: 'new', startedAt: new Date('2026-01-15') }));

      const all = await repo.findAll();
      expect(all).toHaveLength(2);
      expect(all[0].title).toBe('new');
    });
  });

  describe('findByStatus', () => {
    it('should filter by status', async () => {
      await repo.save(makeIncident({ status: 'detected' }));
      await repo.save(makeIncident({ status: 'investigating' }));
      await repo.save(makeIncident({ status: 'resolved', endedAt: new Date() }));

      const detected = await repo.findByStatus('detected');
      expect(detected).toHaveLength(1);
      expect(detected[0].status).toBe('detected');
    });
  });

  describe('update', () => {
    it('should update incident fields', async () => {
      const incident = makeIncident();
      await repo.save(incident);

      incident.transitionTo('investigating');
      incident.addAffectedService('svc-1');
      const updated = await repo.update(incident);

      expect(updated.status).toBe('investigating');
      expect(updated.affectedServices).toContain('svc-1');
    });
  });
});

describe('MongoIncidentEventRepository', () => {
  let repo;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test');
    repo = new MongoIncidentEventRepository();
  });

  beforeEach(async () => {
    await repo.deleteAll();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('save and findByIncidentId', () => {
    it('should save and retrieve events in timestamp order', async () => {
      const incidentId = 'incident-123';
      await repo.save(new IncidentEvent({
        incidentId,
        timestamp: new Date('2026-01-15T12:02:00Z'),
        serviceId: 'svc-1',
        type: 'error',
        message: 'Second event',
      }));
      await repo.save(new IncidentEvent({
        incidentId,
        timestamp: new Date('2026-01-15T12:01:00Z'),
        serviceId: 'svc-1',
        type: 'deployment',
        message: 'First event',
      }));

      const events = await repo.findByIncidentId(incidentId);
      expect(events).toHaveLength(2);
      expect(events[0].message).toBe('First event'); // ascending order
      expect(events[1].message).toBe('Second event');
    });
  });

  describe('findByServiceId', () => {
    it('should find events for a service', async () => {
      await repo.save(new IncidentEvent({
        incidentId: 'inc-1',
        timestamp: new Date(),
        serviceId: 'svc-a',
        type: 'error',
        message: 'Error in A',
      }));
      await repo.save(new IncidentEvent({
        incidentId: 'inc-1',
        timestamp: new Date(),
        serviceId: 'svc-b',
        type: 'error',
        message: 'Error in B',
      }));

      const results = await repo.findByServiceId('svc-a');
      expect(results).toHaveLength(1);
      expect(results[0].serviceId).toBe('svc-a');
    });
  });
});
