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

  async findById(incidentId) {
    const doc = await IncidentModel.findOne({ incidentId }).lean();
    return this._toDomain(doc);
  }

  async findAll() {
    const docs = await IncidentModel.find({}).sort({ startedAt: -1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByStatus(status) {
    const docs = await IncidentModel.find({ status }).sort({ startedAt: -1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async save(incident) {
    const doc = await IncidentModel.create({
      incidentId: incident.incidentId,
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

  async deleteAll() {
    await IncidentModel.deleteMany({});
  }
}

module.exports = MongoIncidentRepository;
