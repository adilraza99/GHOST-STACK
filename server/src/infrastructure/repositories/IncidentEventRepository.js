/**
 * Repository interface for IncidentEvent persistence.
 */
class IncidentEventRepository {
  async save(incidentEvent) {
    throw new Error('IncidentEventRepository.save() not implemented');
  }

  /**
   * @param {string} arg1 - incidentId or projectId
   * @param {string} [arg2] - incidentId when arg1 is projectId
   */
  async findByIncidentId(arg1, arg2) {
    throw new Error('IncidentEventRepository.findByIncidentId() not implemented');
  }

  /**
   * @param {string} incidentId
   * @param {string} telemetryEventId
   */
  async findByTelemetryEventId(incidentId, telemetryEventId) {
    throw new Error('IncidentEventRepository.findByTelemetryEventId() not implemented');
  }

  /** @param {string} serviceId */
  async findByServiceId(serviceId, options) {
    throw new Error('IncidentEventRepository.findByServiceId() not implemented');
  }

  async deleteAll() {
    throw new Error('IncidentEventRepository.deleteAll() not implemented');
  }
}

module.exports = IncidentEventRepository;
