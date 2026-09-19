const ServiceRepository = require('./ServiceRepository');
const ServiceModel = require('../database/models/ServiceModel');
const Service = require('../../domain/entities/Service');

/**
 * MongoDB implementation of ServiceRepository.
 * Maps between Mongoose documents and domain Service entities.
 */
class MongoServiceRepository extends ServiceRepository {
  /**
   * Converts a Mongoose document to a domain Service entity.
   * @param {object} doc
   * @returns {Service}
   */
  _toDomain(doc) {
    if (!doc) return null;
    return new Service({
      serviceId: doc.serviceId,
      name: doc.name,
      environment: doc.environment,
      version: doc.version,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async findById(serviceId) {
    const doc = await ServiceModel.findOne({ serviceId }).lean();
    return this._toDomain(doc);
  }

  async findByName(name, environment) {
    const query = { name };
    if (environment !== undefined) {
      query.environment = environment;
    }
    const doc = await ServiceModel.findOne(query).lean();
    return this._toDomain(doc);
  }

  async findAll() {
    const docs = await ServiceModel.find({}).sort({ name: 1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async save(service) {
    const doc = await ServiceModel.create({
      serviceId: service.serviceId,
      name: service.name,
      environment: service.environment,
      version: service.version,
      metadata: service.metadata,
    });
    return this._toDomain(doc);
  }

  async upsert(service) {
    const doc = await ServiceModel.findOneAndUpdate(
      { name: service.name, environment: service.environment },
      {
        $setOnInsert: { serviceId: service.serviceId },
        $set: {
          name: service.name,
          environment: service.environment,
          version: service.version,
          metadata: service.metadata,
        },
      },
      { upsert: true, returnDocument: "after", lean: true }
    );
    return this._toDomain(doc);
  }

  async deleteAll() {
    await ServiceModel.deleteMany({});
  }
}

module.exports = MongoServiceRepository;
