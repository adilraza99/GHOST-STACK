const { Router } = require('express');
const { createIncidentController } = require('../controllers/incidentController');
const { validate, validateQuery } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/authMiddleware');
const {
  incidentDetectSchema,
  listIncidentsQuerySchema,
} = require('../validators');

function createIncidentRoutes(container) {
  const router = Router();
  const ctrl = createIncidentController(container);
  const optionalAuth = createAuthMiddleware({
    apiKeyRepository: container.apiKeyRepository,
    projectRepository: container.projectRepository,
    requiredPermission: null,
    optional: true,
  });

  // Global endpoints
  router.get('/incidents', ctrl.listIncidents);
  router.get('/incidents/:id', ctrl.getIncident);
  router.get('/incidents/:id/replay', ctrl.replayIncident);
  router.post('/incidents/detect', validate(incidentDetectSchema), ctrl.detect);

  // Project-scoped endpoints
  router.get('/projects/:projectId/incidents', optionalAuth, validateQuery(listIncidentsQuerySchema), ctrl.listIncidents);
  router.get('/projects/:projectId/incidents/:id', optionalAuth, ctrl.getIncident);
  router.get('/projects/:projectId/incidents/:id/replay', optionalAuth, ctrl.replayIncident);
  router.post('/projects/:projectId/incidents/detect', optionalAuth, validate(incidentDetectSchema), ctrl.detect);

  return router;
}

module.exports = { createIncidentRoutes };
