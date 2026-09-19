/**
 * Repository interface for IncidentEvent persistence.
 */
class IncidentEventRepository {
  async save(incidentEvent) {
    throw new Error('IncidentEventRepository.save() not implemented');
  }

  /** @param {string} incidentId */
  async findByIncidentId(incidentId) {
    throw new Error('IncidentEventRepository.findByIncidentId() not implemented');
  }

  /** @param {string} serviceId */
  async findByServiceId(serviceId) {
    throw new Error('IncidentEventRepository.findByServiceId() not implemented');
  }

  async deleteAll() {
    throw new Error('IncidentEventRepository.deleteAll() not implemented');
  }
}

module.exports = IncidentEventRepository;
