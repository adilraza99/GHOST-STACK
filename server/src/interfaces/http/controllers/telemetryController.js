const { success } = require('../helpers/response');

/**
 * Telemetry controller — thin HTTP adapter.
 */
function createTelemetryController({ telemetryProcessingService }) {
  return {
    /** POST /api/telemetry */
    async ingest(req, res) {
      const projectId = req.ghostStack ? req.ghostStack.projectId : 'project-default';

      if (req.body.projectId && req.body.projectId !== projectId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Payload projectId '${req.body.projectId}' does not match authenticated project '${projectId}'`,
          },
        });
      }

      const data = {
        ...req.body,
        projectId,
        timestamp: req.body.timestamp || new Date(),
      };
      const result = await telemetryProcessingService.process(data);
      success(res, {
        event: result.event.toJSON(),
        sourceService: result.sourceService.toJSON(),
        targetService: result.targetService ? result.targetService.toJSON() : null,
        dependency: result.dependency ? result.dependency.toJSON() : null,
      }, 201);
    },

    /** POST /api/telemetry/batch */
    async ingestBatch(req, res) {
      const projectId = req.ghostStack ? req.ghostStack.projectId : 'project-default';
      const results = [];
      for (const eventData of req.body.events) {
        if (eventData.projectId && eventData.projectId !== projectId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `Payload event projectId '${eventData.projectId}' does not match authenticated project '${projectId}'`,
            },
          });
        }
        const data = {
          ...eventData,
          projectId,
          timestamp: eventData.timestamp || new Date(),
        };
        const result = await telemetryProcessingService.process(data);
        results.push({
          eventId: result.event.eventId,
          sourceService: result.sourceService.name,
          targetService: result.targetService ? result.targetService.name : null,
        });
      }
      success(res, { processed: results.length, events: results }, 201);
    },
  };
}

module.exports = { createTelemetryController };
