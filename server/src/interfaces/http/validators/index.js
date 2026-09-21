const { z } = require('zod');

/**
 * POST /api/telemetry — single telemetry event
 */
const telemetrySchema = z.object({
  projectId: z.string().optional(),
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

/**
 * POST /api/projects
 */
const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(100, 'Project name cannot exceed 100 characters'),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must consist only of lowercase alphanumeric characters and single hyphens').optional(),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional(),
});

/**
 * POST /api/projects/:projectId/keys
 */
const createApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Key name cannot be empty').max(100, 'Key name cannot exceed 100 characters').optional(),
  permissions: z.array(z.string().min(1)).min(1, 'At least one permission is required').optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

module.exports = {
  telemetrySchema,
  telemetryBatchSchema,
  deploymentSchema,
  deploymentAnalyzeSchema,
  incidentDetectSchema,
  demoResetSchema,
  demoStartSchema,
  createProjectSchema,
  createApiKeySchema,
};
