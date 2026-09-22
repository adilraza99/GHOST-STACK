const OtlpSpanTranslator = require('../../../domain/adapters/OtlpSpanTranslator');
const OtlpProtoDecoder = require('../../../infrastructure/otlp/OtlpProtoDecoder');
const { logger } = require('../../../infrastructure/logging');
const { error } = require('../helpers/response');

/**
 * OtlpController
 *
 * Thin HTTP adapter for OpenTelemetry (OTLP) trace ingestion.
 * Normalizes incoming spans and routes them directly into the
 * canonical TelemetryProcessingService.process() pipeline.
 */
function createOtlpController({ telemetryProcessingService, config }) {
  const maxSpans = config?.otlp?.maxSpansPerRequest || 1000;

  return {
    /**
     * POST /v1/traces or POST /api/otlp/v1/traces
     */
    async ingestTraces(req, res) {
      const projectId = req.ghostStack ? req.ghostStack.projectId : 'project-default';

      // 1. Decode body depending on content type
      let payload;
      const contentType = req.headers['content-type'] || '';

      if (Buffer.isBuffer(req.body) || contentType.includes('protobuf')) {
        try {
          payload = OtlpProtoDecoder.decode(req.body);
        } catch (err) {
          return error(
            res,
            'MALFORMED_PROTOBUF',
            `Failed to decode OTLP binary protobuf: ${err.message}`,
            400
          );
        }
      } else {
        payload = req.body;
      }

      if (!payload || typeof payload !== 'object') {
        return error(res, 'INVALID_PAYLOAD', 'OTLP trace payload must be a JSON object or protobuf binary', 400);
      }

      const resourceSpans = payload.resourceSpans || payload.resource_spans || [];
      if (!Array.isArray(resourceSpans)) {
        return error(res, 'INVALID_PAYLOAD', 'resourceSpans must be an array', 400);
      }

      // 2. Count total spans and enforce bounded request limits
      let totalSpans = 0;
      for (const rs of resourceSpans) {
        const scopeSpans = rs?.scopeSpans || rs?.scope_spans || rs?.instrumentationLibrarySpans || [];
        if (Array.isArray(scopeSpans)) {
          for (const ss of scopeSpans) {
            const spans = ss?.spans || [];
            if (Array.isArray(spans)) {
              totalSpans += spans.length;
            }
          }
        }
      }

      if (totalSpans > maxSpans) {
        return error(
          res,
          'SPAN_LIMIT_EXCEEDED',
          `Span count (${totalSpans}) exceeds maximum allowed per request (${maxSpans})`,
          400
        );
      }

      // 3. Normalize and translate spans
      const { events, rejectedCount, rejections } = OtlpSpanTranslator.translateBatch(
        resourceSpans,
        { projectId }
      );

      // Safe structured logging for rejections (never log full payload)
      if (rejections.length > 0) {
        for (const rej of rejections) {
          logger.warn(
            {
              reason: rej.reason,
              traceId: rej.traceId,
              spanId: rej.spanId,
              projectId,
            },
            'Rejected OTLP span during normalization'
          );
        }
      }

      // 4. Feed canonical events into TelemetryProcessingService
      let processingFailures = 0;
      for (const eventData of events) {
        try {
          await telemetryProcessingService.process(eventData);
        } catch (err) {
          processingFailures++;
          logger.warn(
            {
              err: err.message,
              traceId: eventData.traceId,
              requestId: eventData.requestId,
              projectId,
            },
            'Failed to process normalized telemetry event'
          );
        }
      }

      const totalRejected = rejectedCount + processingFailures;

      // 5. Build OTLP-compliant partialSuccess response
      const responsePayload = {
        partialSuccess: {
          rejectedSpans: totalRejected,
        },
      };

      if (totalRejected > 0) {
        responsePayload.partialSuccess.errorMessage = `${totalRejected} span(s) rejected (${rejectedCount} invalid/missing service.name, ${processingFailures} processing failures)`;
      }

      return res.status(200).json(responsePayload);
    },

    /**
     * POST /v1/metrics or POST /api/otlp/v1/metrics
     */
    async rejectMetrics(_req, res) {
      return error(
        res,
        'NOT_IMPLEMENTED',
        'Metrics ingestion is not supported in this version of GHOST-STACK. Only trace ingestion via /v1/traces is supported.',
        501
      );
    },

    /**
     * POST /v1/logs or POST /api/otlp/v1/logs
     */
    async rejectLogs(_req, res) {
      return error(
        res,
        'NOT_IMPLEMENTED',
        'Logs ingestion is not supported in this version of GHOST-STACK. Only trace ingestion via /v1/traces is supported.',
        501
      );
    },
  };
}

module.exports = { createOtlpController };
