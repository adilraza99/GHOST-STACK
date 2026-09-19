const { success } = require('../helpers/response');

/**
 * Service controller — thin HTTP adapter.
 * Delegates all work to repositories and services.
 */
function createServiceController({ serviceRepository }) {
  return {
    /** GET /api/services */
    async listServices(req, res) {
      const services = await serviceRepository.findAll();
      success(res, services.map((s) => s.toJSON()));
    },

    /** GET /api/services/:id */
    async getService(req, res) {
      const service = await serviceRepository.findById(req.params.id);
      if (!service) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Service not found: ${req.params.id}` },
        });
      }
      success(res, service.toJSON());
    },
  };
}

module.exports = { createServiceController };
