const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    serviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      index: true,
    },
    environment: {
      type: String,
      default: null,
    },
    version: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true, // auto createdAt, updatedAt
    collection: 'services',
  }
);

// Compound index for name + environment lookups
serviceSchema.index({ name: 1, environment: 1 });

const ServiceModel = mongoose.model('Service', serviceSchema);

module.exports = ServiceModel;
