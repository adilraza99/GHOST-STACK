const mongoose = require('mongoose');
const MongoServiceRepository = require('../../../src/infrastructure/repositories/MongoServiceRepository');
const Service = require('../../../src/domain/entities/Service');

describe('MongoServiceRepository', () => {
  let repo;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test');
    repo = new MongoServiceRepository();
  });

  beforeEach(async () => {
    await repo.deleteAll();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('save', () => {
    it('should persist a service and return a domain entity', async () => {
      const service = new Service({ name: 'payment-service', environment: 'demo', version: '1.0' });
      const saved = await repo.save(service);

      expect(saved).toBeInstanceOf(Service);
      expect(saved.serviceId).toBe(service.serviceId);
      expect(saved.name).toBe('payment-service');
      expect(saved.environment).toBe('demo');
    });
  });

  describe('findById', () => {
    it('should find by serviceId', async () => {
      const service = new Service({ name: 'orders-service' });
      await repo.save(service);

      const found = await repo.findById(service.serviceId);
      expect(found).toBeInstanceOf(Service);
      expect(found.serviceId).toBe(service.serviceId);
      expect(found.name).toBe('orders-service');
    });

    it('should return null when not found', async () => {
      const found = await repo.findById('nonexistent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should find by name', async () => {
      await repo.save(new Service({ name: 'auth-service' }));
      const found = await repo.findByName('auth-service');
      expect(found).toBeInstanceOf(Service);
      expect(found.name).toBe('auth-service');
    });

    it('should find by name and environment', async () => {
      await repo.save(new Service({ name: 'api', environment: 'prod' }));
      await repo.save(new Service({ name: 'api', environment: 'staging' }));

      const found = await repo.findByName('api', 'prod');
      expect(found.environment).toBe('prod');
    });

    it('should return null when name not found', async () => {
      const found = await repo.findByName('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all services sorted by name', async () => {
      await repo.save(new Service({ name: 'z-service' }));
      await repo.save(new Service({ name: 'a-service' }));

      const all = await repo.findAll();
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('a-service');
      expect(all[1].name).toBe('z-service');
    });

    it('should return empty array when no services', async () => {
      const all = await repo.findAll();
      expect(all).toEqual([]);
    });
  });

  describe('upsert', () => {
    it('should create a new service on first upsert', async () => {
      const service = new Service({ name: 'new-svc', environment: 'demo' });
      const result = await repo.upsert(service);

      expect(result).toBeInstanceOf(Service);
      expect(result.name).toBe('new-svc');
    });

    it('should update existing service on second upsert', async () => {
      const svc1 = new Service({ name: 'svc', environment: 'demo', version: '1.0' });
      await repo.upsert(svc1);

      const svc2 = new Service({ name: 'svc', environment: 'demo', version: '2.0' });
      const result = await repo.upsert(svc2);

      expect(result.version).toBe('2.0');

      // Should still be only 1 service
      const all = await repo.findAll();
      expect(all).toHaveLength(1);
    });

    it('should preserve original serviceId on update', async () => {
      const svc1 = new Service({ name: 'svc', environment: 'demo' });
      const created = await repo.upsert(svc1);

      const svc2 = new Service({ name: 'svc', environment: 'demo', version: '2.0' });
      const updated = await repo.upsert(svc2);

      expect(updated.serviceId).toBe(created.serviceId);
    });
  });

  describe('UUID integrity', () => {
    it('should preserve UUID through save and retrieve', async () => {
      const service = new Service({ serviceId: 'my-custom-uuid-123', name: 'test' });
      await repo.save(service);

      const found = await repo.findById('my-custom-uuid-123');
      expect(found.serviceId).toBe('my-custom-uuid-123');
    });
  });
});
