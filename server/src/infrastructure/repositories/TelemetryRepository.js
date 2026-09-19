/**
 * Repository interface for TelemetryEvent persistence.
 */
class TelemetryRepository {
  async save(telemetryEvent) {
    throw new Error('TelemetryRepository.save() not implemented');
  }

  /**
   * @param {Date} startTime
   * @param {Date} endTime
   * @returns {Promise<import('../../domain/entities/TelemetryEvent')[]>}
   */
  async findByTimeRange(startTime, endTime) {
    throw new Error('TelemetryRepository.findByTimeRange() not implemented');
  }

  /**
   * @param {string} serviceName
   * @param {object} [options] - { role: 'source'|'target'|'any', limit }
   */
  async findByService(serviceName, options) {
    throw new Error('TelemetryRepository.findByService() not implemented');
  }

  /** @param {string} traceId */
  async findByTraceId(traceId) {
    throw new Error('TelemetryRepository.findByTraceId() not implemented');
  }

  async deleteAll() {
    throw new Error('TelemetryRepository.deleteAll() not implemented');
  }
}

module.exports = TelemetryRepository;
