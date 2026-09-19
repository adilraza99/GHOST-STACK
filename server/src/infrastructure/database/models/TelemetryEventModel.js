const mongoose = require('mongoose');

const telemetryEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
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

// Time-range queries (most common access pattern for telemetry)
telemetryEventSchema.index({ timestamp: -1 });
// Service-specific telemetry lookup
telemetryEventSchema.index({ sourceService: 1, timestamp: -1 });
telemetryEventSchema.index({ targetService: 1, timestamp: -1 });
// Trace correlation
telemetryEventSchema.index({ traceId: 1 });
// Environment filtering
telemetryEventSchema.index({ environment: 1, timestamp: -1 });

const TelemetryEventModel = mongoose.model('TelemetryEvent', telemetryEventSchema);

module.exports = TelemetryEventModel;
