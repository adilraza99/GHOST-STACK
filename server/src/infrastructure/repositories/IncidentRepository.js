/**
 * Repository interface for Incident persistence.
 */
class IncidentRepository {
  async findById(incidentId) {
    throw new Error('IncidentRepository.findById() not implemented');
  }

  async findAll() {
    throw new Error('IncidentRepository.findAll() not implemented');
  }

  /** @param {string} status */
  async findByStatus(status) {
    throw new Error('IncidentRepository.findByStatus() not implemented');
  }

  async save(incident) {
    throw new Error('IncidentRepository.save() not implemented');
  }

  async update(incident) {
    throw new Error('IncidentRepository.update() not implemented');
  }

  async deleteAll() {
    throw new Error('IncidentRepository.deleteAll() not implemented');
  }
}

module.exports = IncidentRepository;
