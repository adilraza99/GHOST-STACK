const { success } = require('../helpers/response');
const Deployment = require('../../../domain/entities/Deployment');

/**
 * Deployment controller — thin HTTP adapter.
 */
function createDeploymentController({
  deploymentRepository,
  deploymentAnalysisService,
  graphService,
}) {
  return {
    /** POST /api/deployments */
    async createDeployment(req, res) {
      const deployment = new Deployment(req.body);
      const saved = await deploymentRepository.save(deployment);
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
