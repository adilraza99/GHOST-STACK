const { success } = require('../helpers/response');

/**
 * Blast radius controller — thin HTTP adapter.
 */
function createBlastRadiusController({ blastRadiusService, graphService, serviceRepository }) {
  return {
    /** GET /api/blast-radius/:serviceId */
    async analyze(req, res) {
      const { serviceId } = req.params;

      // Verify service exists
      const service = await serviceRepository.findById(serviceId);
      if (!service) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Service not found: ${serviceId}` },
        });
      }

      // Rebuild graph from current data
      await graphService.build();

      const result = blastRadiusService.analyze(serviceId);
      success(res, result);
    },
  };
}

module.exports = { createBlastRadiusController };
