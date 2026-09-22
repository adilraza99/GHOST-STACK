const { Router } = require('express');
const { createOtlpController } = require('../controllers/otlpController');
const { createAuthMiddleware } = require('../middleware/authMiddleware');
const { config } = require('../../../config');

/**
 * Creates the OpenTelemetry (OTLP) HTTP router.
 *
 * Routes:
 * - POST /v1/traces  (canonical trace ingestion)
 * - POST /v1/metrics (explicit 501 unsupported)
 * - POST /v1/logs    (explicit 501 unsupported)
 *
 * Designed to be mounted at both `/` and `/api/otlp` without code duplication.
 *
 * @param {object} container
 * @returns {import('express').Router}
 */
function createOtlpRoutes(container) {
  const router = Router();
  const ctrl = createOtlpController({
    telemetryProcessingService: container.telemetryProcessingService,
    config,
  });

  const auth = createAuthMiddleware({
    apiKeyRepository: container.apiKeyRepository,
    projectRepository: container.projectRepository,
    requiredPermission: 'telemetry:write',
  });

  router.post('/v1/traces', auth, ctrl.ingestTraces);
  router.post('/v1/metrics', auth, ctrl.rejectMetrics);
  router.post('/v1/logs', auth, ctrl.rejectLogs);

  return router;
}

module.exports = { createOtlpRoutes };
