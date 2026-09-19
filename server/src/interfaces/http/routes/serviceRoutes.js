const { Router } = require('express');
const { createServiceController } = require('../controllers/serviceController');

function createServiceRoutes(container) {
  const router = Router();
  const ctrl = createServiceController(container);

  router.get('/services', ctrl.listServices);
  router.get('/services/:id', ctrl.getService);

  return router;
}

module.exports = { createServiceRoutes };
