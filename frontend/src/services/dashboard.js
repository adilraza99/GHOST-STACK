import { api } from './api';

/**
 * Dashboard-specific API functions.
 * Each function returns the unwrapped data payload from the GhostStack envelope.
 */

export const dashboardApi = {
  /** GET /api/health */
  getHealth: () => api.get('/health'),

  /** GET /api/services */
  getServices: () => api.get('/services'),

  /** GET /api/incidents */
  getIncidents: () => api.get('/incidents'),

  /** GET /api/dependencies/graph */
  getDependencyGraph: () => api.get('/dependencies/graph'),
};
