const { EntityNotFoundError, ForbiddenError } = require('../domain/errors');

/**
 * ChangeCorrelationService
 *
 * Correlates detected or investigated incidents with recent deployments
 * across direct service changes and upstream/downstream dependency relationships.
 *
 * Core Principles:
 * - Distinguishes Observed Facts, Correlations, and Inferences.
 * - Enforces strict multi-tenant project boundaries.
 * - Enforces environment matching (production incident only correlates with production deployments).
 * - Bounded 30-minute correlation window prior to incident start.
 * - Does NOT claim deterministic causality without mathematical proof.
 */
class ChangeCorrelationService {
  /**
   * @param {object} deps
   * @param {import('../infrastructure/repositories/DeploymentRepository')} deps.deploymentRepository
   * @param {import('../infrastructure/repositories/IncidentRepository')} deps.incidentRepository
   * @param {import('../infrastructure/repositories/ServiceRepository')} deps.serviceRepository
   * @param {import('./DependencyGraphService')} deps.graphService
   * @param {import('../infrastructure/repositories/ProjectRepository')} [deps.projectRepository]
   */
  constructor({
    deploymentRepository,
    incidentRepository,
    serviceRepository,
    graphService,
    projectRepository,
  }) {
    if (!deploymentRepository) throw new Error('deploymentRepository is required');
    if (!incidentRepository) throw new Error('incidentRepository is required');
    if (!serviceRepository) throw new Error('serviceRepository is required');
    if (!graphService) throw new Error('graphService is required');

    this.deploymentRepository = deploymentRepository;
    this.incidentRepository = incidentRepository;
    this.serviceRepository = serviceRepository;
    this.graphService = graphService;
    this.projectRepository = projectRepository;
  }

  /**
   * Correlates an incident with deployments in the preceding 30-minute window.
   *
   * @param {string} projectId
   * @param {string|import('../domain/entities/Incident')} incidentOrId
   * @returns {Promise<Array<object>>} Structured correlation candidates
   */
  async correlateIncident(projectId, incidentOrId) {
    if (!projectId) {
      throw new Error('projectId is required for correlation');
    }

    // 1. Verify project exists if projectRepository is configured
    if (this.projectRepository && projectId !== 'project-default' && projectId !== 'project-demo') {
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new EntityNotFoundError('Project', projectId);
      }
    }

    // 2. Fetch and verify incident
    let incident;
    if (typeof incidentOrId === 'string') {
      incident = await this.incidentRepository.findById(incidentOrId);
      if (!incident) {
        throw new EntityNotFoundError('Incident', incidentOrId);
      }
    } else {
      incident = incidentOrId;
    }

    // 3. Enforce strict project isolation for incident
    const incidentProject = incident.projectId || incident.metadata?.projectId || 'project-default';
    if (incidentProject !== projectId) {
      throw new ForbiddenError(`Incident '${incident.incidentId}' does not belong to project '${projectId}'`);
    }

    // 4. Determine temporal window (incident.startedAt - 30 minutes -> incident.startedAt)
    const incidentStart = incident.startedAt instanceof Date
      ? incident.startedAt
      : new Date(incident.startedAt);
    const windowStart = new Date(incidentStart.getTime() - 30 * 60 * 1000);
    const windowEnd = incidentStart;

    // 5. Determine environment
    const incidentEnv = incident.trigger?.environment || incident.metadata?.environment || 'production';

    // 6. Build project-scoped dependency graph
    await this.graphService.build({ projectId });

    // 7. Resolve trigger service
    const triggerServiceName = incident.trigger?.serviceName || null;
    const triggerServiceIdParam = incident.trigger?.serviceId || null;

    let triggerService = null;
    if (triggerServiceIdParam) {
      triggerService = await this.serviceRepository.findById(triggerServiceIdParam);
    }
    if (!triggerService && triggerServiceName) {
      triggerService = await this.serviceRepository.findByName(triggerServiceName, incidentEnv, projectId);
      if (!triggerService) {
        triggerService = await this.serviceRepository.findByName(triggerServiceName, undefined, projectId);
      }
    }

    const triggerServiceId = triggerService ? triggerService.serviceId : triggerServiceIdParam;
    const resolvedTriggerName = triggerService ? triggerService.name : (triggerServiceName || 'unknown-service');

    // 8. Discover dependency relationships
    const upstreamServiceIds = new Set();
    const downstreamServiceIds = new Set();

    if (triggerServiceId) {
      // What trigger depends on (upstream dependencies)
      const directDeps = this.graphService.getDirectDependencies(triggerServiceId);
      const allDownstreamInGraph = this.graphService.getDownstream(triggerServiceId);
      for (const id of [...directDeps, ...allDownstreamInGraph]) {
        upstreamServiceIds.add(id);
      }

      // What depends on trigger (downstream dependents)
      const directDependents = this.graphService.getDirectDependents(triggerServiceId);
      const allUpstreamInGraph = this.graphService.getUpstream(triggerServiceId);
      for (const id of [...directDependents, ...allUpstreamInGraph]) {
        downstreamServiceIds.add(id);
      }
    }

    // Also include affectedServices listed in incident
    if (Array.isArray(incident.affectedServices)) {
      for (const aff of incident.affectedServices) {
        downstreamServiceIds.add(aff);
      }
    }

    // 9. Query deployments within the 30-minute window for this project
    const deployments = await this.deploymentRepository.findBetween(
      projectId,
      windowStart,
      windowEnd
    );

    // 10. Correlate deployments with observed facts, correlations, and inferences
    const correlations = [];

    for (const dep of deployments) {
      // Ignore deployments that occurred strictly AFTER incident start
      const deployedTime = dep.deployedAt instanceof Date ? dep.deployedAt : new Date(dep.deployedAt);
      if (deployedTime > incidentStart) continue;

      // Environment matching: strictly isolate production from staging
      if (dep.environment && incidentEnv && dep.environment !== incidentEnv) {
        continue;
      }

      // Resolve service identity
      let depService = await this.serviceRepository.findById(dep.serviceId);
      if (!depService) {
        depService = await this.serviceRepository.findByName(dep.serviceId, dep.environment, projectId);
      }
      const depServiceId = depService ? depService.serviceId : dep.serviceId;
      const depServiceName = depService ? depService.name : dep.serviceId;

      const timeDeltaMs = incidentStart.getTime() - deployedTime.getTime();
      const timeDeltaMinutes = Math.max(0, Math.round(timeDeltaMs / 60000));

      const isDirect =
        (triggerServiceId && depServiceId === triggerServiceId) ||
        (resolvedTriggerName && depServiceName === resolvedTriggerName);

      const isUpstream =
        upstreamServiceIds.has(depServiceId) ||
        upstreamServiceIds.has(depServiceName);

      const isDownstream =
        downstreamServiceIds.has(depServiceId) ||
        downstreamServiceIds.has(depServiceName);

      if (!isDirect && !isUpstream && !isDownstream) {
        // Do not manufacture correlation if no relationship exists
        continue;
      }

      let relationship;
      let correlationType;
      let confidence;
      const evidence = [];

      const prevVer = dep.previousVersion || 'initial';
      const newVer = dep.newVersion;

      if (isDirect) {
        relationship = 'direct';
        correlationType = 'direct';
        confidence = 'high';
        evidence.push(
          `Observed: Deployment '${dep.deploymentId}' of '${depServiceName}' (${prevVer} -> ${newVer}) occurred at ${deployedTime.toISOString()}`
        );
        evidence.push(`Observed: Incident started at ${incidentStart.toISOString()}`);
        evidence.push(`Correlated: Deployment occurred ${timeDeltaMinutes} minute(s) before incident on the same service`);
        evidence.push('Inferred: Service version change is a primary trigger candidate for the detected anomaly');
      } else if (isUpstream) {
        relationship = 'upstream';
        correlationType = 'upstream_dependency';
        confidence = 'medium';
        evidence.push(
          `Observed: Deployment '${dep.deploymentId}' of upstream dependency '${depServiceName}' (${prevVer} -> ${newVer}) occurred at ${deployedTime.toISOString()}`
        );
        evidence.push(`Observed: Incident trigger '${resolvedTriggerName}' depends on '${depServiceName}'`);
        evidence.push(`Correlated: Upstream dependency deployed ${timeDeltaMinutes} minute(s) before incident`);
        evidence.push('Inferred: Upstream dependency change may have propagated latency, errors, or contract drift');
      } else {
        relationship = 'downstream';
        correlationType = 'downstream_dependency';
        confidence = 'low';
        evidence.push(
          `Observed: Deployment '${dep.deploymentId}' of downstream service '${depServiceName}' (${prevVer} -> ${newVer}) occurred at ${deployedTime.toISOString()}`
        );
        evidence.push(`Observed: '${depServiceName}' is downstream or listed as an affected service in incident`);
        evidence.push(`Correlated: Downstream service deployed ${timeDeltaMinutes} minute(s) before incident`);
        evidence.push('Inferred: Possible cascading correlation or concurrent service deployment');
      }

      correlations.push({
        deploymentId: dep.deploymentId,
        projectId,
        serviceId: depServiceId,
        serviceName: depServiceName,
        previousVersion: dep.previousVersion,
        newVersion: dep.newVersion,
        deployedAt: deployedTime.toISOString(),
        environment: dep.environment || incidentEnv,
        incidentId: incident.incidentId,
        relationship,
        timeDeltaMs,
        evidence,
        confidence,
        correlationType,
      });
    }

    // 11. Sort deterministically by deployedAt descending (most recent first)
    correlations.sort((a, b) => {
      const timeDiff = new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.deploymentId.localeCompare(b.deploymentId);
    });

    return correlations;
  }
}

module.exports = ChangeCorrelationService;
