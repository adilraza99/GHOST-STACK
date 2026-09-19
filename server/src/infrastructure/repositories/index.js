const ServiceRepository = require('./ServiceRepository');
const DependencyRepository = require('./DependencyRepository');
const TelemetryRepository = require('./TelemetryRepository');
const IncidentRepository = require('./IncidentRepository');
const IncidentEventRepository = require('./IncidentEventRepository');
const DeploymentRepository = require('./DeploymentRepository');

const MongoServiceRepository = require('./MongoServiceRepository');
const MongoDependencyRepository = require('./MongoDependencyRepository');
const MongoTelemetryRepository = require('./MongoTelemetryRepository');
const MongoIncidentRepository = require('./MongoIncidentRepository');
const MongoIncidentEventRepository = require('./MongoIncidentEventRepository');
const MongoDeploymentRepository = require('./MongoDeploymentRepository');

module.exports = {
  // Interfaces
  ServiceRepository,
  DependencyRepository,
  TelemetryRepository,
  IncidentRepository,
  IncidentEventRepository,
  DeploymentRepository,
  // Mongo implementations
  MongoServiceRepository,
  MongoDependencyRepository,
  MongoTelemetryRepository,
  MongoIncidentRepository,
  MongoIncidentEventRepository,
  MongoDeploymentRepository,
};
