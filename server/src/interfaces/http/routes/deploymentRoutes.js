const { Router } = require('express');
const { createDeploymentController } = require('../controllers/deploymentController');
const { validate } = require('../middleware/validate');
const { deploymentSchema, deploymentAnalyzeSchema } = require('../validators');

function createDeploymentRoutes(container) {
  const router = Router();
  const ctrl = createDeploymentController(container);

  router.post('/deployments', validate(deploymentSchema), ctrl.createDeployment);
  router.post('/deployments/analyze', validate(deploymentAnalyzeSchema), ctrl.analyzeDeployment);

  return router;
}

module.exports = { createDeploymentRoutes };
