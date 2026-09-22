const IncidentRepository = require('./IncidentRepository');
const IncidentModel = require('../database/models/IncidentModel');
const Incident = require('../../domain/entities/Incident');

/**
 * MongoDB implementation of IncidentRepository.
 */
class MongoIncidentRepository extends IncidentRepository {
  _toDomain(doc) {
    if (!doc) return null;
    return new Incident({
      incidentId: doc.incidentId,
      projectId: doc.projectId || doc.metadata?.projectId || 'project-default',
      environment: doc.environment || doc.metadata?.environment || 'production',
      title: doc.title,
      status: doc.status,
      severity: doc.severity,
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
      trigger: doc.trigger,
      affectedServices: doc.affectedServices,
      events: doc.events,
      metadata: doc.metadata,
    });
  }

  async findById(arg1, arg2) {
    let query;
    if (arg2 !== undefined) {
      query = { projectId: arg1, incidentId: arg2 };
    } else {
      query = { incidentId: arg1 };
    }
    const doc = await IncidentModel.findOne(query).lean();
    return this._toDomain(doc);
  }

  async findAll(filter = {}) {
    const query = {};
    if (filter.projectId) query.projectId = filter.projectId;
    if (filter.environment) query.environment = filter.environment;
    if (filter.status) query.status = filter.status;
    const docs = await IncidentModel.find(query).sort({ startedAt: -1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByStatus(status, options = {}) {
    const query = { status };
    if (options.projectId) query.projectId = options.projectId;
    if (options.environment) query.environment = options.environment;
    const docs = await IncidentModel.find(query).sort({ startedAt: -1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findActiveByService(projectId, environment, serviceIdOrName) {
    const query = {
      projectId: projectId || 'project-default',
      environment: environment || 'production',
      status: { $in: ['detected', 'investigating'] },
      $or: [
        { affectedServices: serviceIdOrName },
        { 'trigger.serviceName': serviceIdOrName },
        { 'trigger.serviceId': serviceIdOrName },
      ],
    };
    const doc = await IncidentModel.findOne(query).sort({ startedAt: -1 }).lean();
    return this._toDomain(doc);
  }

  async findActive(projectId, environment) {
    const query = {
      status: { $in: ['detected', 'investigating'] },
    };
    if (projectId) query.projectId = projectId;
    if (environment) query.environment = environment;
    const docs = await IncidentModel.find(query).sort({ startedAt: -1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByProject(projectId, filters = {}) {
    const query = { projectId };
    if (filters.environment) query.environment = filters.environment;
    if (filters.status) query.status = filters.status;
    if (filters.severity) query.severity = filters.severity;
    if (filters.startTime) {
      query.startedAt = query.startedAt || {};
      query.startedAt.$gte = new Date(filters.startTime);
    }
    if (filters.endTime) {
      query.startedAt = query.startedAt || {};
      query.startedAt.$lte = new Date(filters.endTime);
    }
    const limit = filters.limit || 100;
    const docs = await IncidentModel.find(query)
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async save(incident) {
    const doc = await IncidentModel.create({
      incidentId: incident.incidentId,
      projectId: incident.projectId || incident.metadata?.projectId || 'project-default',
      environment: incident.environment || incident.metadata?.environment || 'production',
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      startedAt: incident.startedAt,
      endedAt: incident.endedAt,
      trigger: incident.trigger,
      affectedServices: incident.affectedServices,
      events: incident.events,
      metadata: incident.metadata,
    });
    return this._toDomain(doc);
  }

  async update(incident) {
    const doc = await IncidentModel.findOneAndUpdate(
      { incidentId: incident.incidentId },
      {
        $set: {
          projectId: incident.projectId || incident.metadata?.projectId || 'project-default',
          environment: incident.environment || incident.metadata?.environment || 'production',
          title: incident.title,
          status: incident.status,
          severity: incident.severity,
          endedAt: incident.endedAt,
          trigger: incident.trigger,
          affectedServices: incident.affectedServices,
          events: incident.events,
          metadata: incident.metadata,
        },
      },
      { returnDocument: "after", lean: true }
    );
    return this._toDomain(doc);
  }

  async deleteAll(projectId) {
    const query = projectId ? { $or: [{ projectId }, { 'metadata.projectId': projectId }] } : {};
    await IncidentModel.deleteMany(query);
  }
}

module.exports = MongoIncidentRepository;
