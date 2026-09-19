const { success } = require('../helpers/response');

/**
 * Incident controller — thin HTTP adapter.
 */
function createIncidentController({
  incidentRepository,
  incidentDetectionService,
  incidentReplayService,
  graphService,
}) {
  return {
    /** GET /api/incidents */
    async listIncidents(req, res) {
      const { status } = req.query;
      let incidents;
      if (status) {
        incidents = await incidentRepository.findByStatus(status);
      } else {
        incidents = await incidentRepository.findAll();
      }
      success(res, incidents.map((i) => i.toJSON()));
    },

    /** GET /api/incidents/:id */
    async getIncident(req, res) {
      const incident = await incidentRepository.findById(req.params.id);
      if (!incident) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Incident not found: ${req.params.id}` },
        });
      }
      success(res, incident.toJSON());
    },

    /** GET /api/incidents/:id/replay */
    async replayIncident(req, res) {
      const result = await incidentReplayService.replay(req.params.id);
      success(res, result);
    },

    /** POST /api/incidents/detect */
    async detect(req, res) {
      // Rebuild graph for blast radius correlation
      await graphService.build();

      const options = {};
      if (req.body && req.body.now) {
        options.now = new Date(req.body.now);
      }

      const incidents = await incidentDetectionService.detect(options);
      success(res, {
        detected: incidents.length,
        incidents: incidents.map((i) => i.toJSON()),
      }, incidents.length > 0 ? 201 : 200);
    },
  };
}

module.exports = { createIncidentController };
