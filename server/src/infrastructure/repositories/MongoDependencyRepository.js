const DependencyRepository = require('./DependencyRepository');
const DependencyModel = require('../database/models/DependencyModel');
const Dependency = require('../../domain/entities/Dependency');

/**
 * MongoDB implementation of DependencyRepository.
 */
class MongoDependencyRepository extends DependencyRepository {
  _toDomain(doc) {
    if (!doc) return null;
    return new Dependency({
      dependencyId: doc.dependencyId,
      sourceServiceId: doc.sourceServiceId,
      targetServiceId: doc.targetServiceId,
      dependencyType: doc.dependencyType,
      firstSeenAt: doc.firstSeenAt,
      lastSeenAt: doc.lastSeenAt,
      requestCount: doc.requestCount,
      failureCount: doc.failureCount,
      metadata: doc.metadata,
    });
  }

  async findById(dependencyId) {
    const doc = await DependencyModel.findOne({ dependencyId }).lean();
    return this._toDomain(doc);
  }

  async findBySource(sourceServiceId) {
    const docs = await DependencyModel.find({ sourceServiceId }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByTarget(targetServiceId) {
    const docs = await DependencyModel.find({ targetServiceId }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findAll() {
    const docs = await DependencyModel.find({}).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  /**
   * Upserts a dependency by composite key (source+target+type).
   * Increments counters atomically. Preserves firstSeenAt on insert.
   *
   * @param {Dependency} dependency
   * @param {object} [counters] - { failed: boolean }
   */
  async upsert(dependency, counters = {}) {
    const filter = {
      sourceServiceId: dependency.sourceServiceId,
      targetServiceId: dependency.targetServiceId,
      dependencyType: dependency.dependencyType,
    };

    const incrementOps = { requestCount: 1 };
    if (counters.failed) {
      incrementOps.failureCount = 1;
    }

    const doc = await DependencyModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          dependencyId: dependency.dependencyId,
          firstSeenAt: dependency.firstSeenAt,
        },
        $set: {
          lastSeenAt: new Date(),
          metadata: dependency.metadata,
        },
        $inc: incrementOps,
      },
      { upsert: true, returnDocument: "after", lean: true }
    );
    return this._toDomain(doc);
  }

  async save(dependency) {
    const doc = await DependencyModel.create({
      dependencyId: dependency.dependencyId,
      sourceServiceId: dependency.sourceServiceId,
      targetServiceId: dependency.targetServiceId,
      dependencyType: dependency.dependencyType,
      firstSeenAt: dependency.firstSeenAt,
      lastSeenAt: dependency.lastSeenAt,
      requestCount: dependency.requestCount,
      failureCount: dependency.failureCount,
      metadata: dependency.metadata,
    });
    return this._toDomain(doc);
  }

  async deleteAll() {
    await DependencyModel.deleteMany({});
  }
}

module.exports = MongoDependencyRepository;
