const { success } = require('../helpers/response');

/**
 * Controller for Project & Developer API Key management endpoints.
 * Thin HTTP adapter mapping requests/responses to application services.
 */
function createProjectController({ projectService, apiKeyService }) {
  if (!projectService) {
    throw new Error('projectService is required for projectController');
  }
  if (!apiKeyService) {
    throw new Error('apiKeyService is required for projectController');
  }

  return {
    /** POST /api/projects */
    async createProject(req, res) {
      const project = await projectService.createProject(req.body);
      success(res, project.toJSON(), 201);
    },

    /** GET /api/projects */
    async listProjects(req, res) {
      const projects = await projectService.listProjects(req.query);
      success(res, { projects: projects.map((p) => p.toJSON()) }, 200);
    },

    /** GET /api/projects/:projectId */
    async getProject(req, res) {
      const project = await projectService.getProject(req.params.projectId);
      success(res, project.toJSON(), 200);
    },

    /** POST /api/projects/:projectId/archive */
    async archiveProject(req, res) {
      const project = await projectService.archiveProject(req.params.projectId);
      success(res, project.toJSON(), 200);
    },

    /** POST /api/projects/:projectId/keys */
    async createApiKey(req, res) {
      const { apiKey, plaintextKey } = await apiKeyService.createApiKey({
        projectId: req.params.projectId,
        name: req.body.name,
        permissions: req.body.permissions,
        expiresAt: req.body.expiresAt,
      });

      // plaintextKey is returned strictly once upon creation
      success(
        res,
        {
          keyId: apiKey.keyId,
          projectId: apiKey.projectId,
          name: apiKey.name,
          prefix: apiKey.prefix,
          permissions: apiKey.permissions,
          createdAt: apiKey.createdAt.toISOString(),
          expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
          plaintextKey,
        },
        201
      );
    },

    /** GET /api/projects/:projectId/keys */
    async listApiKeys(req, res) {
      const keys = await apiKeyService.listApiKeys(req.params.projectId);
      success(
        res,
        {
          keys: keys.map((k) => k.toJSON()),
        },
        200
      );
    },

    /** POST /api/projects/:projectId/keys/:keyId/revoke */
    async revokeApiKey(req, res) {
      const apiKey = await apiKeyService.revokeApiKey(req.params.projectId, req.params.keyId);
      success(res, apiKey.toJSON(), 200);
    },
  };
}

module.exports = { createProjectController };
