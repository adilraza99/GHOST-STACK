const IncidentEventRepository = require('./IncidentEventRepository');
const IncidentEventModel = require('../database/models/IncidentEventModel');
const IncidentEvent = require('../../domain/entities/IncidentEvent');

/**
 * MongoDB implementation of IncidentEventRepository.
 */
class MongoIncidentEventRepository extends IncidentEventRepository {
  _toDomain(doc) {
    if (!doc) return null;
    return new IncidentEvent({
      eventId: doc.eventId,
      incidentId: doc.incidentId,
      projectId: doc.projectId || doc.metadata?.projectId || 'project-default',
      timestamp: doc.timestamp,
      serviceId: doc.serviceId,
      type: doc.type,
      message: doc.message,
      metadata: doc.metadata,
    });
  }

  async save(incidentEvent) {
    const doc = await IncidentEventModel.create({
      eventId: incidentEvent.eventId,
      incidentId: incidentEvent.incidentId,
      projectId: incidentEvent.projectId || incidentEvent.metadata?.projectId || 'project-default',
      timestamp: incidentEvent.timestamp,
      serviceId: incidentEvent.serviceId,
      type: incidentEvent.type,
      message: incidentEvent.message,
      metadata: incidentEvent.metadata,
    });
    return this._toDomain(doc);
  }

  async findByIncidentId(arg1, arg2) {
    let query;
    if (arg2 !== undefined) {
      query = { projectId: arg1, incidentId: arg2 };
    } else {
      query = { incidentId: arg1 };
    }
    const docs = await IncidentEventModel.find(query)
      .sort({ timestamp: 1 })
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByTelemetryEventId(incidentId, telemetryEventId) {
    const doc = await IncidentEventModel.findOne({
      incidentId,
      'metadata.telemetryEventId': telemetryEventId,
    }).lean();
    return this._toDomain(doc);
  }

  async findByServiceId(serviceId, options = {}) {
    const query = { serviceId };
    if (options.projectId) query.projectId = options.projectId;
    const docs = await IncidentEventModel.find(query)
      .sort({ timestamp: -1 })
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async deleteAll(projectId) {
    const query = projectId ? { $or: [{ projectId }, { 'metadata.projectId': projectId }] } : {};
    await IncidentEventModel.deleteMany(query);
  }
}

module.exports = MongoIncidentEventRepository;
