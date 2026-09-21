const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema(
  {
    deploymentId: {
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
    serviceId: {
      type: String,
      required: true,
    },
    previousVersion: {
      type: String,
      default: null,
    },
    newVersion: {
      type: String,
      required: true,
    },
    deployedAt: {
      type: Date,
      required: true,
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
    collection: 'deployments',
  }
);

// Project deployment history & correlation indexes
deploymentSchema.index({ projectId: 1, deployedAt: -1 });
deploymentSchema.index({ projectId: 1, serviceId: 1, deployedAt: -1 });
deploymentSchema.index({ projectId: 1, environment: 1, deployedAt: -1 });

// Service deployment history
deploymentSchema.index({ serviceId: 1, deployedAt: -1 });
// Time-based deployment listing
deploymentSchema.index({ deployedAt: -1 });

const DeploymentModel = mongoose.model('Deployment', deploymentSchema);

module.exports = DeploymentModel;
