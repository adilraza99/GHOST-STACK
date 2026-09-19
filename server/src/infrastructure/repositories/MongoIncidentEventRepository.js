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
      timestamp: incidentEvent.timestamp,
      serviceId: incidentEvent.serviceId,
      type: incidentEvent.type,
      message: incidentEvent.message,
      metadata: incidentEvent.metadata,
    });
    return this._toDomain(doc);
  }

  async findByIncidentId(incidentId) {
    const docs = await IncidentEventModel.find({ incidentId })
      .sort({ timestamp: 1 })
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByServiceId(serviceId) {
    const docs = await IncidentEventModel.find({ serviceId })
      .sort({ timestamp: -1 })
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async deleteAll() {
    await IncidentEventModel.deleteMany({});
  }
}

module.exports = MongoIncidentEventRepository;
