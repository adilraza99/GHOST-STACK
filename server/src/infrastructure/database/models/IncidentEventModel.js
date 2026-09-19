const mongoose = require('mongoose');

const incidentEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    incidentId: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    serviceId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['error', 'latency_spike', 'deployment', 'dependency_failure'],
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'incident_events',
  }
);

// Timeline query: all events for an incident, ordered by time
incidentEventSchema.index({ incidentId: 1, timestamp: 1 });
// Service-specific incident event lookup
incidentEventSchema.index({ serviceId: 1, timestamp: -1 });

const IncidentEventModel = mongoose.model('IncidentEvent', incidentEventSchema);

module.exports = IncidentEventModel;
