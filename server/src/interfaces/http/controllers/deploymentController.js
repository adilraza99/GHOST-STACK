const { success } = require('../helpers/response');

/**
 * Deployment controller — thin HTTP adapter.
 */
function createDeploymentController({
  deploymentService,
  deploymentAnalysisService,
  graphService,
}) {
  return {
    /** POST /api/deployments */
    async createDeployment(req, res) {
      const saved = await deploymentService.create(req.body);
      success(res, saved.toJSON(), 201);
    },

    /** POST /api/deployments/analyze */
    async analyzeDeployment(req, res) {
      // Rebuild graph for impact analysis
      await graphService.build();

      const result = await deploymentAnalysisService.analyze({
        serviceId: req.body.serviceId,
        newVersion: req.body.newVersion,
      });
      success(res, result);
    },
  };
}

module.exports = { createDeploymentController };
