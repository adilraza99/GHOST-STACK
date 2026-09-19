const { Router } = require('express');
const { createTelemetryController } = require('../controllers/telemetryController');
const { validate } = require('../middleware/validate');
const { telemetrySchema, telemetryBatchSchema } = require('../validators');

function createTelemetryRoutes(container) {
  const router = Router();
  const ctrl = createTelemetryController(container);

  router.post('/telemetry', validate(telemetrySchema), ctrl.ingest);
  router.post('/telemetry/batch', validate(telemetryBatchSchema), ctrl.ingestBatch);

  return router;
}

module.exports = { createTelemetryRoutes };
