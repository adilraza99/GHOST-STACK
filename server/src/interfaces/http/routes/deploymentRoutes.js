const { Router } = require('express');
const { createDeploymentController } = require('../controllers/deploymentController');
const { validate, validateQuery } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/authMiddleware');
const {
  deploymentSchema,
  deploymentAnalyzeSchema,
  listDeploymentsQuerySchema,
} = require('../validators');

function createDeploymentRoutes(container) {
  const router = Router();
  const ctrl = createDeploymentController(container);
  const optionalAuth = createAuthMiddleware({
    apiKeyRepository: container.apiKeyRepository,
    projectRepository: container.projectRepository,
    requiredPermission: null,
    optional: true,
  });

  // Global / legacy deployment endpoints
  router.post('/deployments', optionalAuth, validate(deploymentSchema), ctrl.createDeployment);
  router.post('/deployments/analyze', validate(deploymentAnalyzeSchema), ctrl.analyzeDeployment);

  // Project-scoped deployment endpoints
  router.post('/projects/:projectId/deployments', optionalAuth, validate(deploymentSchema), ctrl.createDeployment);
  router.get('/projects/:projectId/deployments', optionalAuth, validateQuery(listDeploymentsQuerySchema), ctrl.listDeployments);
  router.get('/projects/:projectId/deployments/:deploymentId', optionalAuth, ctrl.getDeployment);

  // Project-scoped incident change correlation
  router.get('/projects/:projectId/incidents/:incidentId/correlations', optionalAuth, ctrl.getCorrelations);

  return router;
}

module.exports = { createDeploymentRoutes };
