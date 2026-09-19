const { Router } = require('express');
const { createDemoController } = require('../controllers/demoController');

function createDemoRoutes(container) {
  const router = Router();
  const ctrl = createDemoController(container);

  router.post('/demo/reset', ctrl.reset);
  router.post('/demo/start', ctrl.start);
  router.get('/demo/scenarios', ctrl.listScenarios);
  router.post('/demo/scenarios/:scenario', ctrl.runScenario);

  return router;
}

module.exports = { createDemoRoutes };
