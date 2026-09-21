const { Router } = require('express');
const { createProjectController } = require('../controllers/projectController');
const { validate } = require('../middleware/validate');
const { createProjectSchema, createApiKeySchema } = require('../validators');

/**
 * Creates Project and Developer API Key management routes.
 *
 * @param {object} container
 * @returns {Router}
 */
function createProjectRoutes(container) {
  const router = Router();
  const ctrl = createProjectController(container);

  // Project endpoints
  router.post('/projects', validate(createProjectSchema), ctrl.createProject);
  router.get('/projects', ctrl.listProjects);
  router.get('/projects/:projectId', ctrl.getProject);
  router.post('/projects/:projectId/archive', ctrl.archiveProject);

  // API Key endpoints
  router.post('/projects/:projectId/keys', validate(createApiKeySchema), ctrl.createApiKey);
  router.get('/projects/:projectId/keys', ctrl.listApiKeys);
  router.post('/projects/:projectId/keys/:keyId/revoke', ctrl.revokeApiKey);

  return router;
}

module.exports = { createProjectRoutes };
