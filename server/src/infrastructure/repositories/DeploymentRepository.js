/**
 * Repository interface for Deployment persistence.
 */
class DeploymentRepository {
  async findById(deploymentId) {
    throw new Error('DeploymentRepository.findById() not implemented');
  }

  /** @param {string} serviceId */
  async findByService(serviceId) {
    throw new Error('DeploymentRepository.findByService() not implemented');
  }

  async findAll() {
    throw new Error('DeploymentRepository.findAll() not implemented');
  }

  async save(deployment) {
    throw new Error('DeploymentRepository.save() not implemented');
  }

  async deleteAll() {
    throw new Error('DeploymentRepository.deleteAll() not implemented');
  }
}

module.exports = DeploymentRepository;
