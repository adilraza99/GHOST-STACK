const ApiKey = require('../../../domain/entities/ApiKey');

/**
 * Creates an authentication middleware for securing ingestion routes.
 *
 * Checks:
 *   1. X-GhostStack-Key header
 *   2. Authorization: Bearer <key> header
 *
 * Validates the key against ApiKeyRepository, checks expiration and revocation,
 * verifies required permissions, and attaches authenticated project context to req.ghostStack.
 *
 * @param {object} options
 * @param {import('../../../infrastructure/repositories/ApiKeyRepository')} options.apiKeyRepository
 * @param {import('../../../infrastructure/repositories/ProjectRepository')} [options.projectRepository]
 * @param {string} [options.requiredPermission] - Permission required for this route (e.g. 'telemetry:write')
 * @param {boolean} [options.optional] - If true, requests without API keys are allowed through
 * @returns {import('express').RequestHandler}
 */
function createAuthMiddleware({ apiKeyRepository, projectRepository, requiredPermission = 'telemetry:write', optional = false }) {
  if (!apiKeyRepository) {
    throw new Error('apiKeyRepository is required to create authMiddleware');
  }

  return async function authMiddleware(req, res, next) {
    // 1. Extract API key from headers
    let presentedKey = req.headers['x-ghoststack-key'];

    if (!presentedKey && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
        presentedKey = parts[1];
      }
    }

    if (!presentedKey || typeof presentedKey !== 'string' || presentedKey.trim().length === 0) {
      if (optional) {
        return next();
      }
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key is required',
        },
      });
    }

    presentedKey = presentedKey.trim();

    // 2. Hash presented key deterministically (SHA-256)
    let hashedKey;
    try {
      hashedKey = ApiKey.hashKey(presentedKey);
    } catch (_err) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key format',
        },
      });
    }

    // 3. Look up key in repository
    let apiKey;
    try {
      apiKey = await apiKeyRepository.findByHashedKey(hashedKey);
    } catch (_err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to verify API key',
        },
      });
    }

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        },
      });
    }

    // 4. Check revocation
    if (apiKey.isRevoked()) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key has been revoked',
        },
      });
    }

    // 5. Check expiration
    if (apiKey.isExpired()) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key has expired',
        },
      });
    }

    // 6. Check required permission
    if (requiredPermission && !apiKey.hasPermission(requiredPermission)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions: missing ${requiredPermission}`,
        },
      });
    }

    // 7. Check project lifecycle status if projectRepository is configured
    if (projectRepository && apiKey.projectId !== 'project-default' && apiKey.projectId !== 'project-demo') {
      try {
        const project = await projectRepository.findById(apiKey.projectId);
        if (!project) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Project not found',
            },
          });
        }
        if (project.isArchived()) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Project is archived and cannot accept telemetry',
            },
          });
        }
      } catch (_err) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to verify project state',
          },
        });
      }
    }

    // 8. Record usage asynchronously (non-blocking)
    apiKeyRepository.recordUsage(apiKey.keyId).catch(() => {});

    // 9. Attach authenticated project context
    req.ghostStack = {
      projectId: apiKey.projectId,
      apiKeyId: apiKey.keyId,
      permissions: [...apiKey.permissions],
    };

    next();
  };
}

module.exports = { createAuthMiddleware };
