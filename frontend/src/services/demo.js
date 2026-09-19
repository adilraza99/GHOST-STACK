import { api } from './api';

/**
 * Demo Simulator API client.
 * Connects to GhostStack deterministic demo simulation endpoints.
 */

export const demoApi = {
  /**
   * GET /api/demo/scenarios
   * Fetches metadata for all available demo scenarios.
   * @returns {Promise<Array<{ id: string, name: string, description: string }>>}
   */
  getScenarios: () => api.get('/demo/scenarios'),

  /**
   * POST /api/demo/scenarios/:scenario
   * Executes a named deterministic simulation scenario.
   * @param {string} scenario - Scenario identifier (e.g. 'normal-traffic', 'payment-failure')
   * @returns {Promise<object>} Simulation execution results
   */
  runScenario: (scenario) => api.post(`/demo/scenarios/${encodeURIComponent(scenario)}`),

  /**
   * POST /api/demo/start
   * Starts the complete incident cascade simulation.
   * @returns {Promise<object>} Simulation execution results
   */
  startCompleteIncident: () => api.post('/demo/start'),

  /**
   * POST /api/demo/reset
   * Clears all simulated services, dependencies, telemetry, incidents, and deployments.
   * @returns {Promise<{ message: string }>}
   */
  resetDemo: () => api.post('/demo/reset'),
};
