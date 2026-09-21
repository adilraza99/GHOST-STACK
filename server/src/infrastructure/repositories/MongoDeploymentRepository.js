const DeploymentRepository = require('./DeploymentRepository');
const DeploymentModel = require('../database/models/DeploymentModel');
const Deployment = require('../../domain/entities/Deployment');

/**
 * MongoDB implementation of DeploymentRepository.
 */
class MongoDeploymentRepository extends DeploymentRepository {
  _toDomain(doc) {
    if (!doc) return null;
    return new Deployment({
      deploymentId: doc.deploymentId,
      serviceId: doc.serviceId,
      previousVersion: doc.previousVersion,
      newVersion: doc.newVersion,
      deployedAt: doc.deployedAt,
      environment: doc.environment,
      metadata: doc.metadata,
    });
  }

  async findById(deploymentId) {
    const doc = await DeploymentModel.findOne({ deploymentId }).lean();
    return this._toDomain(doc);
  }

  async findByService(serviceId) {
    const docs = await DeploymentModel.find({ serviceId })
      .sort({ deployedAt: -1 })
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findAll() {
    const docs = await DeploymentModel.find({}).sort({ deployedAt: -1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async save(deployment) {
    const doc = await DeploymentModel.create({
      deploymentId: deployment.deploymentId,
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
