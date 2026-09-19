const { success } = require('../helpers/response');

/**
 * Telemetry controller — thin HTTP adapter.
 */
function createTelemetryController({ telemetryProcessingService }) {
  return {
    /** POST /api/telemetry */
    async ingest(req, res) {
      const data = {
        ...req.body,
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
      const results = [];
      for (const eventData of req.body.events) {
        const data = {
          ...eventData,
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
