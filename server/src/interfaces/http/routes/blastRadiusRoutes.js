const { Router } = require('express');
const { createBlastRadiusController } = require('../controllers/blastRadiusController');

function createBlastRadiusRoutes(container) {
  const router = Router();
  const ctrl = createBlastRadiusController(container);

  router.get('/blast-radius/:serviceId', ctrl.analyze);

  return router;
}

module.exports = { createBlastRadiusRoutes };
