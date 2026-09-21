const DeploymentRepository = require('./DeploymentRepository');
const DeploymentModel = require('../database/models/DeploymentModel');
const Deployment = require('../../domain/entities/Deployment');

/**
 * MongoDB implementation of DeploymentRepository.
 * Fully project-scoped while preserving backward compatibility.
 */
class MongoDeploymentRepository extends DeploymentRepository {
  _toDomain(doc) {
    if (!doc) return null;
    return new Deployment({
      deploymentId: doc.deploymentId,
      projectId: doc.projectId || doc.metadata?.projectId || 'project-default',
      serviceId: doc.serviceId,
      previousVersion: doc.previousVersion,
      newVersion: doc.newVersion,
      deployedAt: doc.deployedAt,
      environment: doc.environment,
      metadata: doc.metadata,
    });
  }

  async findById(arg1, arg2) {
    let query;
    if (arg2 !== undefined) {
      const projectId = arg1;
      const deploymentId = arg2;
      query = {
        deploymentId,
        $or: [{ projectId }, { 'metadata.projectId': projectId }],
      };
    } else {
      query = { deploymentId: arg1 };
    }
    const doc = await DeploymentModel.findOne(query).lean();
    return this._toDomain(doc);
  }

  async findByProject(projectId, filters = {}) {
    const query = {
      $or: [{ projectId }, { 'metadata.projectId': projectId }],
    };
    if (filters.serviceId) query.serviceId = filters.serviceId;
    if (filters.environment) query.environment = filters.environment;
    if (filters.startTime || filters.endTime) {
      query.deployedAt = {};
      if (filters.startTime) query.deployedAt.$gte = new Date(filters.startTime);
      if (filters.endTime) query.deployedAt.$lte = new Date(filters.endTime);
    }
    let mQuery = DeploymentModel.find(query).sort({ deployedAt: -1 });
    if (filters.limit) {
      mQuery = mQuery.limit(Number(filters.limit));
    }
    const docs = await mQuery.lean();
    return docs.map((d) => this._toDomain(d));
  }

  async findByService(arg1, arg2, arg3) {
    let query;
    let limit;
    if (arg2 !== undefined && typeof arg2 === 'string') {
      const projectId = arg1;
      const serviceId = arg2;
      const filters = arg3 || {};
      query = {
        serviceId,
        $or: [{ projectId }, { 'metadata.projectId': projectId }],
      };
      if (filters.environment) query.environment = filters.environment;
      if (filters.startTime || filters.endTime) {
        query.deployedAt = {};
        if (filters.startTime) query.deployedAt.$gte = new Date(filters.startTime);
        if (filters.endTime) query.deployedAt.$lte = new Date(filters.endTime);
      }
      limit = filters.limit;
    } else {
      query = { serviceId: arg1 };
    }
    let mQuery = DeploymentModel.find(query).sort({ deployedAt: -1 });
    if (limit) mQuery = mQuery.limit(Number(limit));
    const docs = await mQuery.lean();
    return docs.map((d) => this._toDomain(d));
  }

  async findRecent(projectId, options = {}) {
    return this.findByProject(projectId, { limit: options.limit || 10, ...options });
  }

  async findBetween(projectId, startTime, endTime, filters = {}) {
    return this.findByProject(projectId, {
      ...filters,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    });
  }

  async findAll(filter = {}) {
    const query = {};
    if (filter.projectId) {
      query.$or = [{ projectId: filter.projectId }, { 'metadata.projectId': filter.projectId }];
    }
    if (filter.serviceId) query.serviceId = filter.serviceId;
    if (filter.environment) query.environment = filter.environment;
    const docs = await DeploymentModel.find(query).sort({ deployedAt: -1 }).lean();
    return docs.map((d) => this._toDomain(d));
  }

  async save(deployment) {
    const doc = await DeploymentModel.create({
      deploymentId: deployment.deploymentId,
      projectId: deployment.projectId || 'project-default',
      serviceId: deployment.serviceId,
      previousVersion: deployment.previousVersion,
      newVersion: deployment.newVersion,
      deployedAt: deployment.deployedAt,
      environment: deployment.environment,
      metadata: deployment.metadata,
    });
    return this._toDomain(doc);
  }

  async deleteAll(projectId) {
    const query = projectId ? { $or: [{ projectId }, { 'metadata.projectId': projectId }] } : {};
    await DeploymentModel.deleteMany(query);
  }
}

module.exports = MongoDeploymentRepository;
