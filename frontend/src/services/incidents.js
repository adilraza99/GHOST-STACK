import { api } from './api';

/**
 * Incident Intelligence & Timeline Replay API client.
 * Connects to GhostStack incident endpoints.
 */

export const incidentApi = {
  /**
   * GET /api/incidents
   * @param {string} [status] - Optional filter by status ('detected', 'investigating', 'resolved')
   */
  getIncidents: (status) => {
    const endpoint = status ? `/incidents?status=${encodeURIComponent(status)}` : '/incidents';
    return api.get(endpoint);
  },

  /**
   * GET /api/incidents/:id
   * @param {string} id - Incident UUID
   */
  getIncident: (id) => api.get(`/incidents/${id}`),

  /**
   * GET /api/incidents/:id/replay
   * @param {string} id - Incident UUID
   * @returns {Promise<{ incident: object, timeline: Array<object> }>}
   */
  getIncidentReplay: (id) => api.get(`/incidents/${id}/replay`),

  /**
   * POST /api/incidents/detect
   * @param {object} [payload] - Optional options like { now: string }
   * @returns {Promise<{ detected: number, incidents: Array<object> }>}
   */
  triggerDetection: (payload = {}) => api.post('/incidents/detect', payload),
};
