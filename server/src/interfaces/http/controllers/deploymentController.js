const { success } = require('../helpers/response');

/**
 * Deployment controller — thin HTTP adapter.
 */
function createDeploymentController({
  deploymentService,
  deploymentAnalysisService,
  changeCorrelationService,
  graphService,
}) {
  return {
    /** POST /api/deployments and POST /api/projects/:projectId/deployments */
    async createDeployment(req, res) {
      const paramProjectId = req.params.projectId;
      const authProjectId = req.ghostStack?.projectId;
      const bodyProjectId = req.body?.projectId;

      if (authProjectId && paramProjectId && authProjectId !== paramProjectId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `API key project '${authProjectId}' does not match URL project '${paramProjectId}'`,
          },
        });
      }

      const projectId = paramProjectId || authProjectId || bodyProjectId || 'project-default';

      const saved = await deploymentService.create({
        ...req.body,
        projectId,
      });
      success(res, saved.toJSON(), 201);
    },

    /** GET /api/projects/:projectId/deployments */
    async listDeployments(req, res) {
      const { projectId } = req.params;
      const authProjectId = req.ghostStack?.projectId;

      if (authProjectId && authProjectId !== projectId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `API key project '${authProjectId}' does not match URL project '${projectId}'`,
          },
        });
      }

      const deployments = await deploymentService.listDeployments(projectId, req.query);
      success(res, { deployments: deployments.map((d) => d.toJSON()) });
    },

    /** GET /api/projects/:projectId/deployments/:deploymentId */
    async getDeployment(req, res) {
      const { projectId, deploymentId } = req.params;
      const authProjectId = req.ghostStack?.projectId;

      if (authProjectId && authProjectId !== projectId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `API key project '${authProjectId}' does not match URL project '${projectId}'`,
          },
        });
      }

      const deployment = await deploymentService.getDeployment(projectId, deploymentId);
      if (!deployment) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Deployment not found: ${deploymentId}` },
        });
      }
      success(res, deployment.toJSON());
    },

    /** GET /api/projects/:projectId/incidents/:incidentId/correlations */
    async getCorrelations(req, res) {
      const { projectId, incidentId } = req.params;
      const authProjectId = req.ghostStack?.projectId;

      if (authProjectId && authProjectId !== projectId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `API key project '${authProjectId}' does not match URL project '${projectId}'`,
          },
        });
      }

      const correlations = await changeCorrelationService.correlateIncident(projectId, incidentId);
      success(res, {
        projectId,
        incidentId,
        correlations,
        count: correlations.length,
      });
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
