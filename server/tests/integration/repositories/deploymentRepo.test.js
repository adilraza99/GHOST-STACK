const mongoose = require('mongoose');
const MongoDeploymentRepository = require('../../../src/infrastructure/repositories/MongoDeploymentRepository');
const Deployment = require('../../../src/domain/entities/Deployment');

describe('MongoDeploymentRepository', () => {
  let repo;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test');
    repo = new MongoDeploymentRepository();
  });

  beforeEach(async () => {
    await repo.deleteAll();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('save and findById', () => {
    it('should persist and retrieve a deployment', async () => {
      const dep = new Deployment({
        serviceId: 'svc-1',
        previousVersion: '1.0.0',
        newVersion: '1.1.0',
        environment: 'demo',
      });
      await repo.save(dep);

      const found = await repo.findById(dep.deploymentId);
      expect(found).toBeInstanceOf(Deployment);
      expect(found.deploymentId).toBe(dep.deploymentId);
      expect(found.serviceId).toBe('svc-1');
      expect(found.previousVersion).toBe('1.0.0');
      expect(found.newVersion).toBe('1.1.0');
    });

    it('should return null for nonexistent', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findByService', () => {
    it('should return deployments for a service sorted by deployedAt desc', async () => {
      await repo.save(new Deployment({
        serviceId: 'svc-1',
        previousVersion: '1.0',
        newVersion: '1.1',
        deployedAt: new Date('2026-01-10'),
      }));
      await repo.save(new Deployment({
        serviceId: 'svc-1',
        previousVersion: '1.1',
        newVersion: '1.2',
        deployedAt: new Date('2026-01-15'),
      }));
      await repo.save(new Deployment({
        serviceId: 'svc-2',
        previousVersion: '1.0',
        newVersion: '2.0',
      }));

      const results = await repo.findByService('svc-1');
      expect(results).toHaveLength(2);
      expect(results[0].newVersion).toBe('1.2'); // most recent first
    });
  });

  describe('findAll', () => {
    it('should return all deployments', async () => {
      await repo.save(new Deployment({ serviceId: 'a', previousVersion: '1', newVersion: '2' }));
      await repo.save(new Deployment({ serviceId: 'b', previousVersion: '1', newVersion: '2' }));

      const all = await repo.findAll();
      expect(all).toHaveLength(2);
    });
  });
});
