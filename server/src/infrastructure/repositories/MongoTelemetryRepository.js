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
      projectId: doc.projectId || 'project-default',
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
    try {
      const doc = await TelemetryEventModel.create({
        eventId: telemetryEvent.eventId,
        projectId: telemetryEvent.projectId || 'project-default',
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
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.eventId) {
        const existing = await TelemetryEventModel.findOne({ eventId: telemetryEvent.eventId }).lean();
        return this._toDomain(existing);
      }
      throw err;
    }
  }

  async findByTimeRange(startTime, endTime, options = {}) {
    const query = {
      timestamp: { $gte: startTime, $lte: endTime },
    };
    if (options && options.projectId !== undefined) {
      query.projectId = options.projectId;
    }
    if (options && options.environment !== undefined) {
      query.environment = options.environment;
    }
    if (options && options.sourceService !== undefined) {
      query.sourceService = options.sourceService;
    }
    const docs = await TelemetryEventModel.find(query)
      .sort({ timestamp: -1 })
      .lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async findByService(serviceName, options = {}) {
    const { role = 'any', limit = 100, projectId } = options;

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
    if (projectId !== undefined) {
      query.projectId = projectId;
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

  async deleteAll(projectId) {
    const query = projectId ? { projectId } : {};
    await TelemetryEventModel.deleteMany(query);
  }
}

module.exports = MongoTelemetryRepository;
