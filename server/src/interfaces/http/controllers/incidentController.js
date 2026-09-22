const { success } = require('../helpers/response');

/**
 * Incident controller — thin HTTP adapter.
 */
function createIncidentController({
  incidentRepository,
  incidentDetectionService,
  incidentReplayService,
  graphService,
  projectRepository,
}) {
  return {
    /** GET /api/incidents or GET /api/projects/:projectId/incidents */
    async listIncidents(req, res) {
      const { projectId } = req.params;
      const authProjectId = req.ghostStack?.projectId;

      if (projectId) {
        if (authProjectId && authProjectId !== projectId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `API key project '${authProjectId}' does not match URL project '${projectId}'`,
            },
          });
        }

        if (projectRepository) {
          const project = await projectRepository.findById(projectId);
          if (!project) {
            return res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: `Project not found: ${projectId}` },
            });
          }
        }

        const incidents = await incidentRepository.findByProject(projectId, req.query);
        return success(res, { incidents: incidents.map((i) => i.toJSON()) });
      }

      // Global endpoint (legacy / dashboard)
      const { status } = req.query;
      let incidents;
      if (status) {
        incidents = await incidentRepository.findByStatus(status);
      } else {
        incidents = await incidentRepository.findAll();
      }
      return success(res, incidents.map((i) => i.toJSON()));
    },

    /** GET /api/incidents/:id or GET /api/projects/:projectId/incidents/:id */
    async getIncident(req, res) {
      const { projectId, id } = req.params;
      const authProjectId = req.ghostStack?.projectId;

      if (projectId) {
        if (authProjectId && authProjectId !== projectId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `API key project '${authProjectId}' does not match URL project '${projectId}'`,
            },
          });
        }

        if (projectRepository) {
          const project = await projectRepository.findById(projectId);
          if (!project) {
            return res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: `Project not found: ${projectId}` },
            });
          }
        }

        const incident = await incidentRepository.findById(projectId, id);
        if (!incident) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: `Incident not found: ${id}` },
          });
        }
        return success(res, incident.toJSON());
      }

      const incident = await incidentRepository.findById(id);
      if (!incident) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Incident not found: ${id}` },
        });
      }
      return success(res, incident.toJSON());
    },

    /** GET /api/incidents/:id/replay or GET /api/projects/:projectId/incidents/:id/replay */
    async replayIncident(req, res) {
      const { projectId, id } = req.params;
      const authProjectId = req.ghostStack?.projectId;

      if (projectId) {
        if (authProjectId && authProjectId !== projectId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `API key project '${authProjectId}' does not match URL project '${projectId}'`,
            },
          });
        }

        if (projectRepository) {
          const project = await projectRepository.findById(projectId);
          if (!project) {
            return res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: `Project not found: ${projectId}` },
            });
          }
        }

        const result = await incidentReplayService.replay(projectId, id);
        return success(res, result);
      }

      const result = await incidentReplayService.replay(id);
      return success(res, result);
    },

    /** POST /api/incidents/detect or POST /api/projects/:projectId/incidents/detect */
    async detect(req, res) {
      // Rebuild graph for blast radius correlation
      if (graphService) {
        await graphService.build();
      }

      const options = {};
      if (req.body && req.body.now) {
        options.now = new Date(req.body.now);
      }

      const { projectId } = req.params;
      if (projectId) {
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

        if (projectRepository) {
          const project = await projectRepository.findById(projectId);
          if (!project) {
            return res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: `Project not found: ${projectId}` },
            });
          }
        }

        options.projectId = projectId;
      }

      const incidents = await incidentDetectionService.detect(options);
      return success(res, {
        detected: incidents.length,
        incidents: incidents.map((i) => i.toJSON()),
      }, incidents.length > 0 ? 201 : 200);
    },
  };
}

module.exports = { createIncidentController };
