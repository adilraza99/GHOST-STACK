const mongoose = require('mongoose');

const dependencySchema = new mongoose.Schema(
  {
    dependencyId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sourceServiceId: {
      type: String,
      required: true,
    },
    targetServiceId: {
      type: String,
      required: true,
    },
    dependencyType: {
      type: String,
      required: true,
      enum: ['sync', 'async', 'database', 'external'],
    },
    firstSeenAt: {
      type: Date,
      required: true,
    },
    lastSeenAt: {
      type: Date,
      required: true,
    },
    requestCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'dependencies',
  }
);

// Composite unique constraint: one dependency per source+target+type
dependencySchema.index(
  { sourceServiceId: 1, targetServiceId: 1, dependencyType: 1 },
  { unique: true }
);

// Query indexes for graph traversal
dependencySchema.index({ sourceServiceId: 1 });
dependencySchema.index({ targetServiceId: 1 });

const DependencyModel = mongoose.model('Dependency', dependencySchema);

module.exports = DependencyModel;
