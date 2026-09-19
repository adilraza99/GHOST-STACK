import { api } from './api';

/**
 * Deployment Analysis & Verification API client.
 * Connects to GhostStack deployment endpoints.
 */

export const deploymentApi = {
  /**
   * POST /api/deployments/analyze
   * Analyzes the potential dependency impact of deploying a new version.
   *
   * @param {object} params
   * @param {string} params.serviceId - UUID or service identifier
   * @param {string} params.newVersion - Version string (e.g. '1.1.0')
   * @returns {Promise<{
   *   deployment: object,
   *   directDependents: string[],
   *   indirectDependents: string[],
   *   downstreamDependencies: string[],
   *   affectedPaths: Array<string[]>,
   *   totalPotentiallyAffected: number
   * }>}
   */
  analyzeDeployment: ({ serviceId, newVersion }) => {
    return api.post('/deployments/analyze', { serviceId, newVersion });
  },

  /**
   * POST /api/deployments
   * Records a new deployment event in the system.
   *
   * @param {object} params
   * @param {string} params.serviceId
   * @param {string} params.previousVersion
   * @param {string} params.newVersion
   * @param {string} [params.environment]
   * @param {object} [params.metadata]
   * @returns {Promise<object>} The saved deployment record
   */
  recordDeployment: (params) => {
    return api.post('/deployments', params);
  },

  /**
   * GET /api/services
   * Fetches registered services for deployment target selection.
   */
  getServices: () => api.get('/services'),

  /**
   * GET /api/dependencies/graph
   * Fetches dependency graph for resolving service names on paths.
   */
  getGraph: () => api.get('/dependencies/graph'),
};
