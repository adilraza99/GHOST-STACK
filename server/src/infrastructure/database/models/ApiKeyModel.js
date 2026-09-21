const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {
    keyId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    hashedKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    prefix: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    permissions: {
      type: [String],
      default: ['telemetry:write'],
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'api_keys',
  }
);

// Query indexes
apiKeySchema.index({ hashedKey: 1, revokedAt: 1 });
apiKeySchema.index({ projectId: 1, createdAt: -1 });

const ApiKeyModel = mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKeyModel;
