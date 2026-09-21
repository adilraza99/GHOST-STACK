const TelemetryEvent = require('../domain/entities/TelemetryEvent');
const Service = require('../domain/entities/Service');
const Dependency = require('../domain/entities/Dependency');

/**
 * TelemetryProcessingService
 *
 * Orchestrates the telemetry ingestion workflow:
 *   validate → save event → upsert source service → upsert target service →
 *   upsert dependency → publish event through EventBus
 *
 * Failure determination rule:
 *   A telemetry event is considered a FAILURE when its statusCode >= 500.
 *   4xx errors are client errors and are NOT counted as service failures.
 *   Events without a statusCode are treated as non-failures.
 *
 * Dependencies are injected — this service never imports Mongoose or Express.
 */
class TelemetryProcessingService {
  /**
   * @param {object} deps
   * @param {import('../../infrastructure/repositories/TelemetryRepository')} deps.telemetryRepository
   * @param {import('../../infrastructure/repositories/ServiceRepository')} deps.serviceRepository
   * @param {import('../../infrastructure/repositories/DependencyRepository')} deps.dependencyRepository
   * @param {import('../../infrastructure/eventBus/LocalEventBus')} deps.eventBus
   */
  constructor({ telemetryRepository, serviceRepository, dependencyRepository, eventBus }) {
    this.telemetryRepository = telemetryRepository;
    this.serviceRepository = serviceRepository;
    this.dependencyRepository = dependencyRepository;
    this.eventBus = eventBus;
  }

  /**
   * Processes a single telemetry event through the full pipeline.
   *
   * @param {object} data - Raw telemetry data (not an HTTP request)
   * @returns {Promise<{event: TelemetryEvent, sourceService: Service, targetService: Service|null, dependency: Dependency|null}>}
   */
  async process(data) {
    // 1. Create and validate domain entity (throws ValidationError on bad data)
    const event = new TelemetryEvent(data);

    // 2. Persist the telemetry event
    await this.telemetryRepository.save(event);

    // 3. Upsert source service
    const sourceService = await this.serviceRepository.upsert(
      new Service({
        projectId: event.projectId,
        name: event.sourceService,
        environment: event.environment,
      })
    );

    // 4. Upsert target service (if present)
    let targetService = null;
    if (event.targetService) {
      targetService = await this.serviceRepository.upsert(
        new Service({
          projectId: event.projectId,
          name: event.targetService,
          environment: event.environment,
        })
      );
    }

    // 5. Upsert dependency (when both source and target exist)
    let dependency = null;
    if (targetService) {
      const failed = this._isFailure(event);
      dependency = await this.dependencyRepository.upsert(
        new Dependency({
          projectId: event.projectId,
          sourceServiceId: sourceService.serviceId,
          targetServiceId: targetService.serviceId,
          dependencyType: data.dependencyType || 'sync',
        }),
        { failed }
      );
    }

    // 6. Publish event through EventBus
    await this.eventBus.publish('telemetry.processed', {
      event: event.toJSON(),
      projectId: event.projectId,
      sourceServiceId: sourceService.serviceId,
      targetServiceId: targetService ? targetService.serviceId : null,
    });

    return { event, sourceService, targetService, dependency };
  }

  /**
   * Determines whether a telemetry event represents a failure.
   *
   * Rule: statusCode >= 500 is a server failure.
   * 4xx are client errors (not server failures).
   * Missing statusCode is treated as non-failure.
   *
   * @param {TelemetryEvent} event
   * @returns {boolean}
   */
  _isFailure(event) {
    return event.statusCode !== null && event.statusCode >= 500;
  }
}

module.exports = TelemetryProcessingService;
