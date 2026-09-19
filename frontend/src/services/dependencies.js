import { api } from './api';

/**
 * Dependency Graph API service.
 * Interacts with GhostStack dependency and blast-radius endpoints.
 */

export const dependencyApi = {
  /** GET /api/dependencies/graph - Returns stats and all edges */
  getGraph: () => api.get('/dependencies/graph'),

  /** GET /api/services - Returns list of all registered services */
  getServices: () => api.get('/services'),

  /** GET /api/dependencies - Returns flat list of dependency entities */
  getDependencies: () => api.get('/dependencies'),

  /** GET /api/blast-radius/:serviceId - Calculates blast radius for a service */
  getBlastRadius: (serviceId) => api.get(`/blast-radius/${serviceId}`),
};
