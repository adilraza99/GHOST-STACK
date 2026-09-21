const mongoose = require('mongoose');

const telemetryEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    projectId: {
      type: String,
      required: true,
      default: 'project-default',
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    sourceService: {
      type: String,
      required: true,
    },
    targetService: {
      type: String,
      default: null,
    },
    endpoint: {
      type: String,
      default: null,
    },
    method: {
      type: String,
      default: null,
    },
    statusCode: {
      type: Number,
      default: null,
    },
    latencyMs: {
      type: Number,
      default: null,
    },
    traceId: {
      type: String,
      default: null,
    },
    requestId: {
      type: String,
      default: null,
    },
    environment: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'telemetry_events',
  }
);

// Project-scoped query indexes
telemetryEventSchema.index({ projectId: 1, environment: 1, timestamp: -1 });
telemetryEventSchema.index({ projectId: 1, timestamp: -1 });
telemetryEventSchema.index({ projectId: 1, sourceService: 1, timestamp: -1 });
telemetryEventSchema.index({ projectId: 1, targetService: 1, timestamp: -1 });
telemetryEventSchema.index({ projectId: 1, traceId: 1 });

// Global/fallback indexes
telemetryEventSchema.index({ timestamp: -1 });
telemetryEventSchema.index({ sourceService: 1, timestamp: -1 });
telemetryEventSchema.index({ targetService: 1, timestamp: -1 });
telemetryEventSchema.index({ traceId: 1 });
telemetryEventSchema.index({ environment: 1, timestamp: -1 });

const TelemetryEventModel = mongoose.model('TelemetryEvent', telemetryEventSchema);

module.exports = TelemetryEventModel;
