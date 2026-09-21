const { LocalEventBus } = require('./infrastructure/eventBus');
const {
  MongoServiceRepository,
  MongoDependencyRepository,
  MongoTelemetryRepository,
  MongoIncidentRepository,
  MongoIncidentEventRepository,
  MongoDeploymentRepository,
  MongoApiKeyRepository,
  MongoProjectRepository,
} = require('./infrastructure/repositories');
const {
  TelemetryProcessingService,
  DependencyGraphService,
  BlastRadiusService,
  IncidentDetectionService,
  IncidentReplayService,
  DeploymentAnalysisService,
  DeploymentService,
  DemoSimulator,
  ProjectService,
  ApiKeyService,
} = require('./application');
const { config } = require('./config');

/**
 * Composition root — wires all dependencies.
 *
 * Creates a single set of repositories, services, and event bus.
 * Avoids circular dependencies and duplicate instantiation.
 *
 * Dependency graph:
 *   HTTP Controllers
 *     ↓
 *   Application Services
 *     ↓
 *   Domain + Repository Interfaces
 *     ↓
 *   Infrastructure (Mongo repos, EventBus)
 */
function createContainer() {
  // Infrastructure
  const eventBus = new LocalEventBus();
  const serviceRepository = new MongoServiceRepository();
  const dependencyRepository = new MongoDependencyRepository();
  const telemetryRepository = new MongoTelemetryRepository();
  const incidentRepository = new MongoIncidentRepository();
  const incidentEventRepository = new MongoIncidentEventRepository();
  const deploymentRepository = new MongoDeploymentRepository();
  const apiKeyRepository = new MongoApiKeyRepository();
  const projectRepository = new MongoProjectRepository();

  // Application services
  const projectService = new ProjectService({
    projectRepository,
  });

  const apiKeyService = new ApiKeyService({
    apiKeyRepository,
    projectRepository,
  });

  const graphService = new DependencyGraphService({
    serviceRepository,
    dependencyRepository,
  });

  const blastRadiusService = new BlastRadiusService({
    graphService,
  });

  const telemetryProcessingService = new TelemetryProcessingService({
    telemetryRepository,
    serviceRepository,
    dependencyRepository,
    eventBus,
  });

  const incidentDetectionService = new IncidentDetectionService({
    telemetryRepository,
    incidentRepository,
    incidentEventRepository,
    blastRadiusService,
    config: config.incidents,
  });

  const incidentReplayService = new IncidentReplayService({
    incidentRepository,
    incidentEventRepository,
  });

  const deploymentAnalysisService = new DeploymentAnalysisService({
    graphService,
    deploymentRepository,
    serviceRepository,
  });

  const deploymentService = new DeploymentService({
    deploymentRepository,
  });

  const demoSimulator = new DemoSimulator({
    telemetryProcessingService,
    deploymentService,
    deploymentAnalysisService,
    incidentDetectionService,
    blastRadiusService,
    graphService,
    serviceRepository,
    dependencyRepository,
    telemetryRepository,
    incidentRepository,
    incidentEventRepository,
    deploymentRepository,
  });

  return {
    // Repositories (for controllers that need direct reads)
    serviceRepository,
    dependencyRepository,
    telemetryRepository,
    incidentRepository,
    incidentEventRepository,
    deploymentRepository,
    apiKeyRepository,
    projectRepository,
    // Services
    eventBus,
    graphService,
    blastRadiusService,
    telemetryProcessingService,
    incidentDetectionService,
    incidentReplayService,
    deploymentAnalysisService,
    deploymentService,
    demoSimulator,
    projectService,
    apiKeyService,
  };
}

module.exports = { createContainer };
