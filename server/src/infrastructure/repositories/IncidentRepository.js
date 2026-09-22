/**
 * Repository interface for Incident persistence.
 */
class IncidentRepository {
  async findById(arg1, arg2) {
    throw new Error('IncidentRepository.findById() not implemented');
  }

  async findAll() {
    throw new Error('IncidentRepository.findAll() not implemented');
  }

  /** @param {string} status */
  async findByStatus(status) {
    throw new Error('IncidentRepository.findByStatus() not implemented');
  }

  /**
   * Find active incident (detected or investigating) for a service.
   * @param {string} projectId
   * @param {string} environment
   * @param {string} serviceIdOrName
   */
  async findActiveByService(projectId, environment, serviceIdOrName) {
    throw new Error('IncidentRepository.findActiveByService() not implemented');
  }

  /**
   * Find active incidents (detected or investigating).
   * @param {string} [projectId]
   * @param {string} [environment]
   */
  async findActive(projectId, environment) {
    throw new Error('IncidentRepository.findActive() not implemented');
  }

  /**
   * Find incidents by project and filters.
   * @param {string} projectId
   * @param {object} [filters]
   */
  async findByProject(projectId, filters) {
    throw new Error('IncidentRepository.findByProject() not implemented');
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
