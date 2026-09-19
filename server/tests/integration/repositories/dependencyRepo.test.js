const mongoose = require('mongoose');
const MongoDependencyRepository = require('../../../src/infrastructure/repositories/MongoDependencyRepository');
const Dependency = require('../../../src/domain/entities/Dependency');

describe('MongoDependencyRepository', () => {
  let repo;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ghoststack-test');
    repo = new MongoDependencyRepository();
  });

  beforeEach(async () => {
    await repo.deleteAll();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const makeDep = (overrides = {}) => new Dependency({
    sourceServiceId: 'source-1',
    targetServiceId: 'target-1',
    dependencyType: 'sync',
    ...overrides,
  });

  describe('save', () => {
    it('should persist and return a domain entity', async () => {
      const dep = makeDep();
      const saved = await repo.save(dep);

      expect(saved).toBeInstanceOf(Dependency);
      expect(saved.dependencyId).toBe(dep.dependencyId);
      expect(saved.sourceServiceId).toBe('source-1');
      expect(saved.targetServiceId).toBe('target-1');
    });
  });

  describe('findById', () => {
    it('should find by dependencyId', async () => {
      const dep = makeDep();
      await repo.save(dep);
      const found = await repo.findById(dep.dependencyId);
      expect(found).toBeInstanceOf(Dependency);
      expect(found.dependencyId).toBe(dep.dependencyId);
    });

    it('should return null when not found', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findBySource', () => {
    it('should return all dependencies from a source', async () => {
      await repo.save(makeDep({ targetServiceId: 'target-a' }));
      await repo.save(makeDep({ targetServiceId: 'target-b' }));
      await repo.save(makeDep({ sourceServiceId: 'other-source', targetServiceId: 'target-c' }));

      const results = await repo.findBySource('source-1');
      expect(results).toHaveLength(2);
      results.forEach((d) => expect(d.sourceServiceId).toBe('source-1'));
    });
  });

  describe('findByTarget', () => {
    it('should return all dependencies targeting a service', async () => {
      await repo.save(makeDep({ sourceServiceId: 'src-a' }));
      await repo.save(makeDep({ sourceServiceId: 'src-b' }));

      const results = await repo.findByTarget('target-1');
      expect(results).toHaveLength(2);
    });
  });

  describe('findAll', () => {
    it('should return all dependencies', async () => {
      await repo.save(makeDep({ targetServiceId: 'a' }));
      await repo.save(makeDep({ targetServiceId: 'b' }));
      const all = await repo.findAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('upsert', () => {
    it('should create on first upsert with requestCount=1', async () => {
      const dep = makeDep();
      const result = await repo.upsert(dep);

      expect(result).toBeInstanceOf(Dependency);
      expect(result.requestCount).toBe(1);
      expect(result.failureCount).toBe(0);
    });

    it('should increment requestCount on repeated upsert', async () => {
      const dep = makeDep();
      await repo.upsert(dep);
      await repo.upsert(dep);
      const result = await repo.upsert(dep);

      expect(result.requestCount).toBe(3);
    });

    it('should increment failureCount when failed=true', async () => {
      const dep = makeDep();
      await repo.upsert(dep, { failed: true });
      await repo.upsert(dep, { failed: false });
      const result = await repo.upsert(dep, { failed: true });

      expect(result.requestCount).toBe(3);
      expect(result.failureCount).toBe(2);
    });

    it('should enforce composite uniqueness', async () => {
      const dep1 = makeDep();
      const dep2 = makeDep(); // same source+target+type
      await repo.upsert(dep1);
      await repo.upsert(dep2);

      const all = await repo.findAll();
      expect(all).toHaveLength(1); // only one dependency
      expect(all[0].requestCount).toBe(2); // counted twice
    });

    it('should allow different types for same source+target', async () => {
      await repo.upsert(makeDep({ dependencyType: 'sync' }));
      await repo.upsert(makeDep({ dependencyType: 'async' }));

      const all = await repo.findAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('UUID integrity', () => {
    it('should preserve UUID through persistence', async () => {
      const dep = makeDep({ dependencyId: 'custom-dep-uuid-456' });
      await repo.save(dep);
      const found = await repo.findById('custom-dep-uuid-456');
      expect(found.dependencyId).toBe('custom-dep-uuid-456');
    });
  });
});
