import { api } from './api';

/**
 * Services Registry & Catalog API client.
 * Connects to GhostStack service, dependency, blast-radius, and incident endpoints.
 */

export const serviceApi = {
  /**
   * GET /api/services
   * List all discovered services.
   * @returns {Promise<Array<object>>}
   */
  getServices: () => api.get('/services'),

  /**
   * GET /api/services/:id
   * Get specific service details by serviceId.
   * @param {string} id - Service UUID
   * @returns {Promise<object>}
   */
  getService: (id) => api.get(`/services/${encodeURIComponent(id)}`),

  /**
   * GET /api/dependencies
   * List all service dependencies (directed edges).
   * @returns {Promise<Array<object>>}
   */
  getDependencies: () => api.get('/dependencies'),

  /**
   * GET /api/blast-radius/:serviceId
   * Calculate the blast radius of a service if it fails.
   * @param {string} serviceId - Service UUID
   * @returns {Promise<object>}
   */
  getBlastRadius: (serviceId) => api.get(`/blast-radius/${encodeURIComponent(serviceId)}`),

  /**
   * GET /api/incidents
   * List all detected incidents.
   * @param {string} [status] - Optional status filter
   * @returns {Promise<Array<object>>}
   */
  getIncidents: (status) => {
    const endpoint = status ? `/incidents?status=${encodeURIComponent(status)}` : '/incidents';
    return api.get(endpoint);
  },
};
