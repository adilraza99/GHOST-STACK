const { Router } = require('express');
const { createIncidentController } = require('../controllers/incidentController');

function createIncidentRoutes(container) {
  const router = Router();
  const ctrl = createIncidentController(container);

  router.get('/incidents', ctrl.listIncidents);
  router.get('/incidents/:id', ctrl.getIncident);
  router.get('/incidents/:id/replay', ctrl.replayIncident);
  router.post('/incidents/detect', ctrl.detect);

  return router;
}

module.exports = { createIncidentRoutes };
