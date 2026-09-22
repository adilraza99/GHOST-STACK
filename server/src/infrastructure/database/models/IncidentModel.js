const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema(
  {
    incidentId: {
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
    environment: {
      type: String,
      required: true,
      default: 'production',
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['detected', 'investigating', 'resolved'],
    },
    severity: {
      type: String,
      required: true,
      enum: ['critical', 'high', 'medium', 'low'],
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    trigger: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    affectedServices: {
      type: [String],
      default: [],
    },
    events: {
      type: [String],
      default: [],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'incidents',
  }
);

// Status filtering (active incidents list)
incidentSchema.index({ status: 1 });
// Time-based incident listing
incidentSchema.index({ startedAt: -1 });
// Severity filtering
incidentSchema.index({ severity: 1, startedAt: -1 });
// Project and environment compound indexes
incidentSchema.index({ projectId: 1, environment: 1, status: 1 });
incidentSchema.index({ projectId: 1, environment: 1, 'trigger.serviceName': 1, status: 1 });
incidentSchema.index({ projectId: 1, startedAt: -1 });

const IncidentModel = mongoose.model('Incident', incidentSchema);

module.exports = IncidentModel;
