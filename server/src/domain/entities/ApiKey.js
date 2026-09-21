const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../errors');

/**
 * ApiKey domain entity.
 *
 * Represents an authentication credential for an external application/project.
 * Database-agnostic — uses UUID identifiers, no Mongoose/MongoDB.
 * Never stores or returns plaintext secrets.
 */
class ApiKey {
  /**
   * @param {object} props
   * @param {string} [props.keyId] - UUID (auto-generated if not provided)
   * @param {string} props.projectId - Associated project identifier (required)
   * @param {string} props.hashedKey - SHA-256 hash of the plaintext secret (required)
   * @param {string} props.prefix - Key prefix for identification, e.g. 'gs_live_abc12345' (required)
   * @param {string} props.name - Human-readable key name (required)
   * @param {string[]} [props.permissions] - Granted permissions, defaults to ['telemetry:write']
   * @param {Date} [props.lastUsedAt] - Last usage timestamp
   * @param {Date} [props.expiresAt] - Expiration timestamp (null if never expires)
   * @param {Date} [props.createdAt] - Creation timestamp
   * @param {Date} [props.revokedAt] - Revocation timestamp (null if active)
   */
  constructor(props) {
    if (!props) {
      throw new ValidationError('props', 'ApiKey properties are required');
    }
    if (!props.projectId || typeof props.projectId !== 'string' || props.projectId.trim().length === 0) {
      throw new ValidationError('projectId', 'Project ID is required');
    }
    if (!props.hashedKey || typeof props.hashedKey !== 'string' || props.hashedKey.trim().length === 0) {
      throw new ValidationError('hashedKey', 'Hashed key is required');
    }
    if (!props.prefix || typeof props.prefix !== 'string' || props.prefix.trim().length === 0) {
      throw new ValidationError('prefix', 'Key prefix is required');
    }
    if (!props.name || typeof props.name !== 'string' || props.name.trim().length === 0) {
      throw new ValidationError('name', 'Key name is required');
    }

    // Validate 64-character hex format for SHA-256
    const cleanHash = props.hashedKey.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(cleanHash)) {
      throw new ValidationError('hashedKey', 'Hashed key must be a valid 64-character hex SHA-256 digest');
    }

    this.keyId = props.keyId || uuidv4();
    this.projectId = props.projectId.trim();
    this.hashedKey = cleanHash;
    this.prefix = props.prefix.trim();
    this.name = props.name.trim();
    this.permissions = Array.isArray(props.permissions) && props.permissions.length > 0
      ? [...props.permissions]
      : ['telemetry:write'];
    this.lastUsedAt = props.lastUsedAt instanceof Date ? props.lastUsedAt : (props.lastUsedAt ? new Date(props.lastUsedAt) : null);
    this.expiresAt = props.expiresAt instanceof Date ? props.expiresAt : (props.expiresAt ? new Date(props.expiresAt) : null);
    this.createdAt = props.createdAt instanceof Date ? props.createdAt : (props.createdAt ? new Date(props.createdAt) : new Date());
    this.revokedAt = props.revokedAt instanceof Date ? props.revokedAt : (props.revokedAt ? new Date(props.revokedAt) : null);

    if (this.expiresAt && isNaN(this.expiresAt.getTime())) {
      throw new ValidationError('expiresAt', 'Invalid expiresAt timestamp');
    }
    if (this.lastUsedAt && isNaN(this.lastUsedAt.getTime())) {
      throw new ValidationError('lastUsedAt', 'Invalid lastUsedAt timestamp');
    }
    if (this.revokedAt && isNaN(this.revokedAt.getTime())) {
      throw new ValidationError('revokedAt', 'Invalid revokedAt timestamp');
    }
  }

  /**
   * Hashes a plaintext API key string deterministically using SHA-256.
   * @param {string} plaintextKey
   * @returns {string} 64-character lowercase hex digest
   */
  static hashKey(plaintextKey) {
    if (!plaintextKey || typeof plaintextKey !== 'string') {
      throw new ValidationError('plaintextKey', 'Valid plaintext API key string is required');
    }
    return crypto.createHash('sha256').update(plaintextKey).digest('hex');
  }

  /**
   * Generates a cryptographically secure API key pair (domain entity + single-use plaintext key).
   *
   * Secret format: gs_live_<48 hex chars>
   *
   * @param {object} params
   * @param {string} params.projectId
   * @param {string} [params.name]
   * @param {string[]} [params.permissions]
   * @param {Date} [params.expiresAt]
   * @returns {{ apiKey: ApiKey, plaintextKey: string }}
   */
  static generate({ projectId, name = 'Default Ingestion Key', permissions = ['telemetry:write'], expiresAt = null }) {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ValidationError('projectId', 'Project ID is required');
    }

    // 24 cryptographically secure random bytes -> 48 hex characters
    const secret = crypto.randomBytes(24).toString('hex');
    const plaintextKey = `gs_live_${secret}`;
    const prefix = `gs_live_${secret.slice(0, 8)}`;
    const hashedKey = ApiKey.hashKey(plaintextKey);

    const apiKey = new ApiKey({
      projectId: projectId.trim(),
      name: (name || 'Default Ingestion Key').trim(),
      hashedKey,
      prefix,
      permissions,
      expiresAt,
    });

    return { apiKey, plaintextKey };
  }

  /**
   * Returns whether the key has been revoked.
   * @returns {boolean}
   */
  isRevoked() {
    return this.revokedAt !== null;
  }

  /**
   * Returns whether the key has expired relative to a given timestamp.
   * @param {Date} [now=new Date()]
   * @returns {boolean}
   */
  isExpired(now = new Date()) {
    if (!this.expiresAt) return false;
    const checkTime = now instanceof Date ? now : new Date(now);
    return checkTime > this.expiresAt;
  }

  /**
   * Returns whether the key is active (not revoked and not expired).
   * @param {Date} [now=new Date()]
   * @returns {boolean}
   */
  isValid(now = new Date()) {
    return !this.isRevoked() && !this.isExpired(now);
  }

  /**
   * Revokes the API key immediately.
   * @param {Date} [revokedAt=new Date()]
   */
  revoke(revokedAt = new Date()) {
    this.revokedAt = revokedAt instanceof Date ? revokedAt : new Date(revokedAt);
  }

  /**
   * Records usage timestamp.
   * @param {Date} [lastUsedAt=new Date()]
   */
  recordUsage(lastUsedAt = new Date()) {
    this.lastUsedAt = lastUsedAt instanceof Date ? lastUsedAt : new Date(lastUsedAt);
  }

  /**
   * Checks if the key grants a specific permission.
   * Wildcard '*' grants all permissions.
   * @param {string} permission
   * @returns {boolean}
   */
  hasPermission(permission) {
    if (this.permissions.includes('*')) return true;
    return this.permissions.includes(permission);
  }

  /**
   * Safe JSON representation for serialization and API responses.
   * NEVER exposes plaintextKey or full hashedKey.
   */
  toJSON() {
    return {
      keyId: this.keyId,
      projectId: this.projectId,
      name: this.name,
      prefix: this.prefix,
      permissions: [...this.permissions],
      lastUsedAt: this.lastUsedAt ? this.lastUsedAt.toISOString() : null,
      expiresAt: this.expiresAt ? this.expiresAt.toISOString() : null,
      createdAt: this.createdAt.toISOString(),
      revokedAt: this.revokedAt ? this.revokedAt.toISOString() : null,
    };
  }
}

module.exports = ApiKey;
