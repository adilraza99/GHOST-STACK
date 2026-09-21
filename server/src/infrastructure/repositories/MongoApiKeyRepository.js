const ApiKeyRepository = require('./ApiKeyRepository');
const ApiKeyModel = require('../database/models/ApiKeyModel');
const ApiKey = require('../../domain/entities/ApiKey');

/**
 * MongoDB implementation of ApiKeyRepository.
 * Maps between Mongoose documents and domain ApiKey entities.
 */
class MongoApiKeyRepository extends ApiKeyRepository {
  /**
   * Converts a Mongoose document to a domain ApiKey entity.
   * @param {object} doc
   * @returns {ApiKey|null}
   */
  _toDomain(doc) {
    if (!doc) return null;
    return new ApiKey({
      keyId: doc.keyId,
      projectId: doc.projectId,
      hashedKey: doc.hashedKey,
      prefix: doc.prefix,
      name: doc.name,
      permissions: doc.permissions,
      lastUsedAt: doc.lastUsedAt,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
      revokedAt: doc.revokedAt,
    });
  }

  async findByHashedKey(hashedKey) {
    const doc = await ApiKeyModel.findOne({ hashedKey }).lean();
    return this._toDomain(doc);
  }

  async findById(keyId) {
    const doc = await ApiKeyModel.findOne({ keyId }).lean();
    return this._toDomain(doc);
  }

  async findByProjectId(projectId) {
    const docs = await ApiKeyModel.find({ projectId }).sort({ createdAt: -1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async save(apiKey) {
    const doc = await ApiKeyModel.create({
      keyId: apiKey.keyId,
      projectId: apiKey.projectId,
      hashedKey: apiKey.hashedKey,
      prefix: apiKey.prefix,
      name: apiKey.name,
      permissions: apiKey.permissions,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
    });
    return this._toDomain(doc);
  }

  async update(apiKey) {
    const doc = await ApiKeyModel.findOneAndUpdate(
      { keyId: apiKey.keyId },
      {
        $set: {
          name: apiKey.name,
          permissions: apiKey.permissions,
          lastUsedAt: apiKey.lastUsedAt,
          expiresAt: apiKey.expiresAt,
          revokedAt: apiKey.revokedAt,
        },
      },
      { returnDocument: 'after', lean: true }
    );
    return this._toDomain(doc);
  }

  async recordUsage(keyId, timestamp = new Date()) {
    await ApiKeyModel.updateOne(
      { keyId },
      { $set: { lastUsedAt: timestamp } }
    );
  }

  async deleteAll(projectId) {
    const filter = projectId ? { projectId } : {};
    await ApiKeyModel.deleteMany(filter);
  }
}

module.exports = MongoApiKeyRepository;
