const { z } = require('zod');

/**
 * POST /api/telemetry — single telemetry event
 */
const telemetrySchema = z.object({
  sourceService: z.string().min(1, 'sourceService is required'),
  timestamp: z.string().or(z.date()).optional(),
  targetService: z.string().optional(),
  endpoint: z.string().optional(),
  method: z.string().optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  latencyMs: z.number().min(0).optional(),
  traceId: z.string().optional(),
  requestId: z.string().optional(),
  environment: z.string().optional(),
  dependencyType: z.enum(['sync', 'async', 'database', 'external']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/telemetry/batch — array of telemetry events
 */
const telemetryBatchSchema = z.object({
  events: z.array(telemetrySchema).min(1, 'At least one event is required').max(100, 'Maximum 100 events per batch'),
});

/**
 * POST /api/deployments
 */
const deploymentSchema = z.object({
  serviceId: z.string().min(1, 'serviceId is required'),
  previousVersion: z.string().min(1, 'previousVersion is required'),
  newVersion: z.string().min(1, 'newVersion is required'),
  environment: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/deployments/analyze
 */
const deploymentAnalyzeSchema = z.object({
  serviceId: z.string().min(1, 'serviceId is required'),
  newVersion: z.string().min(1, 'newVersion is required'),
});

/**
 * POST /api/incidents/detect
 */
const incidentDetectSchema = z.object({
  now: z.string().datetime().optional(),
}).optional();

/**
 * POST /api/demo/reset, /api/demo/start — no body or optional
 */
const demoResetSchema = z.object({}).optional();

const demoStartSchema = z.object({
  scenario: z.string().optional(),
}).optional();

module.exports = {
  telemetrySchema,
  telemetryBatchSchema,
  deploymentSchema,
  deploymentAnalyzeSchema,
  incidentDetectSchema,
  demoResetSchema,
  demoStartSchema,
};
