const { Router } = require('express');
const { createTelemetryController } = require('../controllers/telemetryController');
const { validate } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/authMiddleware');
const { telemetrySchema, telemetryBatchSchema } = require('../validators');

function createTelemetryRoutes(container) {
  const router = Router();
  const ctrl = createTelemetryController(container);
  const auth = createAuthMiddleware({
    apiKeyRepository: container.apiKeyRepository,
    projectRepository: container.projectRepository,
    requiredPermission: 'telemetry:write',
  });

  router.post('/telemetry', auth, validate(telemetrySchema), ctrl.ingest);
  router.post('/telemetry/batch', auth, validate(telemetryBatchSchema), ctrl.ingestBatch);

  return router;
}

module.exports = { createTelemetryRoutes };
