const { Router } = require('express');
const { createDependencyController } = require('../controllers/dependencyController');

function createDependencyRoutes(container) {
  const router = Router();
  const ctrl = createDependencyController(container);

  router.get('/dependencies', ctrl.listDependencies);
  router.get('/dependencies/graph', ctrl.getGraph);

  return router;
}

module.exports = { createDependencyRoutes };
