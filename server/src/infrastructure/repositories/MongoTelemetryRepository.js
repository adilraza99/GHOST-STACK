const TelemetryRepository = require('./TelemetryRepository');
const TelemetryEventModel = require('../database/models/TelemetryEventModel');
const TelemetryEvent = require('../../domain/entities/TelemetryEvent');

/**
 * MongoDB implementation of TelemetryRepository.
 */
class MongoTelemetryRepository extends TelemetryRepository {
  _toDomain(doc) {
    if (!doc) return null;
    return new TelemetryEvent({
      eventId: doc.eventId,
      timestamp: doc.timestamp,
      sourceService: doc.sourceService,
      targetService: doc.targetService,
      endpoint: doc.endpoint,
      method: doc.method,
      statusCode: doc.statusCode,
      latencyMs: doc.latencyMs,
      traceId: doc.traceId,
      requestId: doc.requestId,
      environment: doc.environment,
      metadata: doc.metadata,
    });
  }

  async save(telemetryEvent) {
    const doc = await TelemetryEventModel.create({
      eventId: telemetryEvent.eventId,
      timestamp: telemetryEvent.timestamp,
      sourceService: telemetryEvent.sourceService,
      targetService: telemetryEvent.targetService,
      endpoint: telemetryEvent.endpoint,
      method: telemetryEvent.method,
      statusCode: telemetryEvent.statusCode,
      latencyMs: telemetryEvent.latencyMs,
      traceId: telemetryEvent.traceId,
      requestId: telemetryEvent.requestId,
      environment: telemetryEvent.environment,
      metadata: telemetryEvent.metadata,
    });
    return this._toDomain(doc);
  }

  async findByTimeRange(startTime, endTime) {
    const docs = await TelemetryEventModel.find({
      timestamp: { $gte: startTime, $lte: endTime },
    })
      .sort({ timestamp: -1 })
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByService(serviceName, options = {}) {
    const { role = 'any', limit = 100 } = options;

    let query;
    if (role === 'source') {
      query = { sourceService: serviceName };
    } else if (role === 'target') {
      query = { targetService: serviceName };
    } else {
      query = {
        $or: [{ sourceService: serviceName }, { targetService: serviceName }],
      };
    }

    const docs = await TelemetryEventModel.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByTraceId(traceId) {
    const docs = await TelemetryEventModel.find({ traceId })
      .sort({ timestamp: 1 })
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async deleteAll() {
    await TelemetryEventModel.deleteMany({});
  }
}

module.exports = MongoTelemetryRepository;
