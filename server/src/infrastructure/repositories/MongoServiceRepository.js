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
      projectId: doc.projectId || 'project-default',
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

  async findByName(name, environment, projectId) {
    const query = { name };
    if (environment !== undefined) {
      query.environment = environment;
    }
    if (projectId !== undefined) {
      query.projectId = projectId;
    }
    const doc = await ServiceModel.findOne(query).lean();
    return this._toDomain(doc);
  }

  async findAll(filter = {}) {
    const query = {};
    if (filter && filter.projectId !== undefined) {
      query.projectId = filter.projectId;
    }
    if (filter && filter.environment !== undefined) {
      query.environment = filter.environment;
    }
    const docs = await ServiceModel.find(query).sort({ name: 1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async save(service) {
    const doc = await ServiceModel.create({
      serviceId: service.serviceId,
      projectId: service.projectId || 'project-default',
      name: service.name,
      environment: service.environment,
      version: service.version,
      metadata: service.metadata,
    });
    return this._toDomain(doc);
  }

  async upsert(service) {
    const projectId = service.projectId || 'project-default';
    const doc = await ServiceModel.findOneAndUpdate(
      {
        projectId,
        name: service.name,
        environment: service.environment,
      },
      {
        $setOnInsert: { serviceId: service.serviceId },
        $set: {
          projectId,
          name: service.name,
          environment: service.environment,
          version: service.version,
          metadata: service.metadata,
        },
      },
      { upsert: true, returnDocument: 'after', lean: true }
    );
    return this._toDomain(doc);
  }

  async deleteAll(projectId) {
    const query = projectId ? { projectId } : {};
    await ServiceModel.deleteMany(query);
  }
}

module.exports = MongoServiceRepository;
