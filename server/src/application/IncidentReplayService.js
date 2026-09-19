const { EntityNotFoundError } = require('../domain/errors');

/**
 * IncidentReplayService
 *
 * Produces a deterministic, chronologically ordered replay of an incident.
 * No mutation of stored data — purely read-only.
 *
 * Output: ordered array of replay entries with relativeTimeMs
 * calculated from the incident's startedAt timestamp.
 */
class IncidentReplayService {
  /**
   * @param {object} deps
   * @param {import('../../infrastructure/repositories/IncidentRepository')} deps.incidentRepository
   * @param {import('../../infrastructure/repositories/IncidentEventRepository')} deps.incidentEventRepository
   */
  constructor({ incidentRepository, incidentEventRepository }) {
    this.incidentRepository = incidentRepository;
    this.incidentEventRepository = incidentEventRepository;
  }

  /**
   * Replays an incident timeline.
   *
   * @param {string} incidentId
   * @returns {Promise<{
   *   incident: object,
   *   timeline: Array<{
   *     timestamp: string,
   *     serviceId: string,
   *     type: string,
   *     message: string,
   *     relativeTimeMs: number
   *   }>
   * }>}
   * @throws {EntityNotFoundError} if incident not found
   */
  async replay(incidentId) {
    // 1. Fetch incident
    const incident = await this.incidentRepository.findById(incidentId);
    if (!incident) {
      throw new EntityNotFoundError('Incident', incidentId);
    }

    // 2. Fetch all events for this incident (already sorted by timestamp asc from repo)
    const events = await this.incidentEventRepository.findByIncidentId(incidentId);

    // 3. Build timeline with relativeTimeMs
    const startTime = incident.startedAt.getTime();

    const timeline = events.map((event) => ({
      timestamp: event.timestamp.toISOString(),
      serviceId: event.serviceId,
      type: event.type,
      message: event.message,
      relativeTimeMs: event.timestamp.getTime() - startTime,
      metadata: event.metadata,
    }));

    // 4. Ensure chronological ordering (defensive — repo should already sort)
    timeline.sort((a, b) => a.relativeTimeMs - b.relativeTimeMs);

    return {
      incident: incident.toJSON(),
      timeline,
    };
  }
}

module.exports = IncidentReplayService;
