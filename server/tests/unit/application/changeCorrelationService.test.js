const ChangeCorrelationService = require('../../../src/application/ChangeCorrelationService');
const DependencyGraphService = require('../../../src/application/DependencyGraphService');
const Service = require('../../../src/domain/entities/Service');
const Dependency = require('../../../src/domain/entities/Dependency');
const Deployment = require('../../../src/domain/entities/Deployment');
const Incident = require('../../../src/domain/entities/Incident');
const Project = require('../../../src/domain/entities/Project');
const {
  FakeServiceRepository,
  FakeDependencyRepository,
  FakeDeploymentRepository,
  FakeIncidentRepository,
  FakeProjectRepository,
} = require('../../helpers/fakes');
const { EntityNotFoundError, ForbiddenError } = require('../../../src/domain/errors');

describe('ChangeCorrelationService', () => {
  let correlationService, graphService;
  let serviceRepo, depRepo, deploymentRepo, incidentRepo, projectRepo;

  beforeEach(async () => {
    serviceRepo = new FakeServiceRepository();
    depRepo = new FakeDependencyRepository();
    deploymentRepo = new FakeDeploymentRepository();
    incidentRepo = new FakeIncidentRepository();
    projectRepo = new FakeProjectRepository();

    graphService = new DependencyGraphService({
      serviceRepository: serviceRepo,
      dependencyRepository: depRepo,
    });

    correlationService = new ChangeCorrelationService({
      deploymentRepository: deploymentRepo,
      incidentRepository: incidentRepo,
      serviceRepository: serviceRepo,
      graphService,
      projectRepository: projectRepo,
    });

    // Default project setup
    await projectRepo.save(new Project({
      projectId: 'proj-ecommerce',
      name: 'Ecommerce',
      slug: 'ecommerce',
      status: 'active',
    }));
  });

  describe('Constructor Validation', () => {
    it('should throw if deploymentRepository is missing', () => {
      expect(() => new ChangeCorrelationService({
        incidentRepository: incidentRepo,
        serviceRepository: serviceRepo,
        graphService,
      })).toThrow('deploymentRepository is required');
    });

    it('should throw if incidentRepository is missing', () => {
      expect(() => new ChangeCorrelationService({
        deploymentRepository: deploymentRepo,
        serviceRepository: serviceRepo,
        graphService,
      })).toThrow('incidentRepository is required');
    });
  });

  describe('Direct Change Correlation', () => {
    it('should correlate a deployment on the trigger service within 30m window', async () => {
      const paymentService = new Service({
        serviceId: 'svc-payment',
        name: 'payment-service',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      await serviceRepo.save(paymentService);

      const incidentTime = new Date('2026-09-21T14:30:00Z');
      const deployTime = new Date('2026-09-21T14:25:00Z'); // 5 minutes before

      const deployment = new Deployment({
        deploymentId: 'dep-1',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-payment',
        previousVersion: '1.0.0',
        newVersion: '1.1.0',
        environment: 'production',
        deployedAt: deployTime,
      });
      await deploymentRepo.save(deployment);

      const incident = new Incident({
        incidentId: 'inc-1',
        projectId: 'proj-ecommerce',
        title: 'High error rate in payment-service',
        severity: 'high',
        trigger: {
          serviceId: 'svc-payment',
          serviceName: 'payment-service',
          metric: 'error_rate',
          value: 0.25,
          threshold: 0.05,
          environment: 'production',
        },
        startedAt: incidentTime,
      });
      await incidentRepo.save(incident);

      const correlations = await correlationService.correlateIncident('proj-ecommerce', 'inc-1');

      expect(correlations).toHaveLength(1);
      const candidate = correlations[0];
      expect(candidate.deploymentId).toBe('dep-1');
      expect(candidate.serviceName).toBe('payment-service');
      expect(candidate.relationship).toBe('direct');
      expect(candidate.confidence).toBe('high');
      expect(candidate.correlationType).toBe('direct');
      expect(candidate.timeDeltaMs).toBe(5 * 60 * 1000);
      expect(candidate.environment).toBe('production');
      expect(candidate.evidence).toHaveLength(4);
      expect(candidate.evidence[0]).toContain('Observed:');
      expect(candidate.evidence[2]).toContain('Correlated:');
      expect(candidate.evidence[3]).toContain('Inferred:');
    });
  });

  describe('Upstream and Downstream Correlation', () => {
    it('should correlate upstream dependency deployment', async () => {
      // checkout -> payment (checkout depends on payment)
      const checkout = new Service({
        serviceId: 'svc-checkout',
        name: 'checkout-service',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      const payment = new Service({
        serviceId: 'svc-payment',
        name: 'payment-service',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      await serviceRepo.save(checkout);
      await serviceRepo.save(payment);

      await depRepo.save(new Dependency({
        projectId: 'proj-ecommerce',
        sourceServiceId: 'svc-checkout',
        targetServiceId: 'svc-payment',
        dependencyType: 'sync',
      }));

      const incidentTime = new Date('2026-09-21T14:30:00Z');
      const deployTime = new Date('2026-09-21T14:20:00Z'); // 10 minutes before

      // Deployment on payment (upstream for checkout)
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-upstream',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-payment',
        previousVersion: '2.0.0',
        newVersion: '2.1.0',
        environment: 'production',
        deployedAt: deployTime,
      }));

      // Incident on checkout (trigger)
      await incidentRepo.save(new Incident({
        incidentId: 'inc-checkout',
        projectId: 'proj-ecommerce',
        title: 'Checkout timeout spike',
        severity: 'high',
        trigger: {
          serviceId: 'svc-checkout',
          serviceName: 'checkout-service',
          environment: 'production',
        },
        startedAt: incidentTime,
      }));

      const correlations = await correlationService.correlateIncident('proj-ecommerce', 'inc-checkout');

      expect(correlations).toHaveLength(1);
      expect(correlations[0].relationship).toBe('upstream');
      expect(correlations[0].correlationType).toBe('upstream_dependency');
      expect(correlations[0].confidence).toBe('medium');
      expect(correlations[0].serviceName).toBe('payment-service');
    });

    it('should correlate downstream dependent deployment', async () => {
      // api-gateway -> checkout (api-gateway depends on checkout)
      const gateway = new Service({
        serviceId: 'svc-gateway',
        name: 'api-gateway',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      const checkout = new Service({
        serviceId: 'svc-checkout',
        name: 'checkout-service',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      await serviceRepo.save(gateway);
      await serviceRepo.save(checkout);

      await depRepo.save(new Dependency({
        projectId: 'proj-ecommerce',
        sourceServiceId: 'svc-gateway',
        targetServiceId: 'svc-checkout',
        dependencyType: 'sync',
      }));

      const incidentTime = new Date('2026-09-21T14:30:00Z');
      const deployTime = new Date('2026-09-21T14:22:00Z');

      // Deployment on api-gateway (downstream dependent of checkout)
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-downstream',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-gateway',
        previousVersion: '1.0.0',
        newVersion: '1.0.1',
        environment: 'production',
        deployedAt: deployTime,
      }));

      // Incident on checkout (trigger)
      await incidentRepo.save(new Incident({
        incidentId: 'inc-checkout-2',
        projectId: 'proj-ecommerce',
        title: 'Checkout latency',
        severity: 'medium',
        trigger: {
          serviceId: 'svc-checkout',
          serviceName: 'checkout-service',
          environment: 'production',
        },
        startedAt: incidentTime,
      }));

      const correlations = await correlationService.correlateIncident('proj-ecommerce', 'inc-checkout-2');

      expect(correlations).toHaveLength(1);
      expect(correlations[0].relationship).toBe('downstream');
      expect(correlations[0].confidence).toBe('low');
    });
  });

  describe('Temporal Window & Boundaries', () => {
    it('should include boundary deployments (t - 30m and t = 0) but exclude out-of-window deployments', async () => {
      const svc = new Service({
        serviceId: 'svc-time',
        name: 'time-service',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      await serviceRepo.save(svc);

      const incidentTime = new Date('2026-09-21T15:00:00Z');

      // 1. Exactly 30 minutes before (included)
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-exact-30m',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-time',
        newVersion: '1.0.1',
        deployedAt: new Date('2026-09-21T14:30:00Z'),
      }));

      // 2. 15 minutes before (included)
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-15m',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-time',
        newVersion: '1.0.2',
        deployedAt: new Date('2026-09-21T14:45:00Z'),
      }));

      // 3. Exactly at incident start (included)
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-at-incident',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-time',
        newVersion: '1.0.3',
        deployedAt: new Date('2026-09-21T15:00:00Z'),
      }));

      // 4. 31 minutes before (excluded)
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-31m-old',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-time',
        newVersion: '0.9.9',
        deployedAt: new Date('2026-09-21T14:29:00Z'),
      }));

      // 5. 5 minutes AFTER incident start (excluded)
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-future',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-time',
        newVersion: '1.0.4',
        deployedAt: new Date('2026-09-21T15:05:00Z'),
      }));

      await incidentRepo.save(new Incident({
        incidentId: 'inc-window',
        projectId: 'proj-ecommerce',
        title: 'Time Window Anomaly',
        severity: 'high',
        trigger: {
          serviceId: 'svc-time',
          serviceName: 'time-service',
          environment: 'production',
        },
        startedAt: incidentTime,
      }));

      const correlations = await correlationService.correlateIncident('proj-ecommerce', 'inc-window');

      expect(correlations).toHaveLength(3);
      const depIds = correlations.map((c) => c.deploymentId);
      expect(depIds).toEqual(['dep-at-incident', 'dep-15m', 'dep-exact-30m']);
    });
  });

  describe('Environment Isolation', () => {
    it('should not correlate staging deployments with production incidents', async () => {
      const svc = new Service({
        serviceId: 'svc-env',
        name: 'env-service',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      await serviceRepo.save(svc);

      const incidentTime = new Date('2026-09-21T16:00:00Z');

      // Staging deployment on same service 5 minutes before
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-staging',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-env',
        environment: 'staging',
        newVersion: '2.0.0-rc1',
        deployedAt: new Date('2026-09-21T15:55:00Z'),
      }));

      // Production incident
      await incidentRepo.save(new Incident({
        incidentId: 'inc-prod',
        projectId: 'proj-ecommerce',
        title: 'Production Outage',
        severity: 'critical',
        trigger: {
          serviceId: 'svc-env',
          serviceName: 'env-service',
          environment: 'production',
        },
        startedAt: incidentTime,
      }));

      const correlations = await correlationService.correlateIncident('proj-ecommerce', 'inc-prod');
      expect(correlations).toHaveLength(0);
    });
  });

  describe('Initial Deployments (null previousVersion)', () => {
    it('should cleanly handle initial deployment with previousVersion null', async () => {
      const svc = new Service({
        serviceId: 'svc-fresh',
        name: 'fresh-service',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      await serviceRepo.save(svc);

      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-initial',
        projectId: 'proj-ecommerce',
        serviceId: 'svc-fresh',
        previousVersion: null,
        newVersion: '1.0.0',
        deployedAt: new Date('2026-09-21T10:15:00Z'),
      }));

      await incidentRepo.save(new Incident({
        incidentId: 'inc-fresh',
        projectId: 'proj-ecommerce',
        title: 'Fresh service failure',
        severity: 'medium',
        trigger: {
          serviceId: 'svc-fresh',
          serviceName: 'fresh-service',
          environment: 'production',
        },
        startedAt: new Date('2026-09-21T10:20:00Z'),
      }));

      const correlations = await correlationService.correlateIncident('proj-ecommerce', 'inc-fresh');
      expect(correlations).toHaveLength(1);
      expect(correlations[0].previousVersion).toBeNull();
      expect(correlations[0].newVersion).toBe('1.0.0');
      expect(correlations[0].evidence[0]).toContain('initial -> 1.0.0');
    });
  });

  describe('Project Multi-Tenant Isolation', () => {
    it('should throw ForbiddenError when querying an incident belonging to another project', async () => {
      await projectRepo.save(new Project({
        projectId: 'proj-finance',
        name: 'Finance',
        slug: 'finance',
        status: 'active',
      }));

      await incidentRepo.save(new Incident({
        incidentId: 'inc-finance-1',
        projectId: 'proj-finance',
        title: 'Finance payment bug',
        severity: 'high',
        trigger: { serviceName: 'ledger-service' },
        startedAt: new Date(),
      }));

      await expect(
        correlationService.correlateIncident('proj-ecommerce', 'inc-finance-1')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw EntityNotFoundError when project does not exist', async () => {
      await expect(
        correlationService.correlateIncident('proj-ghost', 'inc-any')
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('should never include deployments from Project B in Project A correlations', async () => {
      await projectRepo.save(new Project({
        projectId: 'proj-beta',
        name: 'Beta',
        slug: 'beta',
        status: 'active',
      }));

      const incidentTime = new Date('2026-09-21T12:00:00Z');

      // Both projects have service named 'user-service'
      const svcAlpha = new Service({
        serviceId: 'svc-user-alpha',
        name: 'user-service',
        environment: 'production',
        projectId: 'proj-ecommerce',
      });
      const svcBeta = new Service({
        serviceId: 'svc-user-beta',
        name: 'user-service',
        environment: 'production',
        projectId: 'proj-beta',
      });
      await serviceRepo.save(svcAlpha);
      await serviceRepo.save(svcBeta);

      // Project Beta deployment
      await deploymentRepo.save(new Deployment({
        deploymentId: 'dep-beta-1',
        projectId: 'proj-beta',
        serviceId: 'svc-user-beta',
        newVersion: '2.0.0',
        deployedAt: new Date('2026-09-21T11:50:00Z'),
      }));

      // Project Ecommerce incident
      await incidentRepo.save(new Incident({
        incidentId: 'inc-alpha-user',
        projectId: 'proj-ecommerce',
        title: 'Alpha User Service Bug',
        severity: 'high',
        trigger: {
          serviceId: 'svc-user-alpha',
          serviceName: 'user-service',
          environment: 'production',
        },
        startedAt: incidentTime,
      }));

      const correlations = await correlationService.correlateIncident('proj-ecommerce', 'inc-alpha-user');
      expect(correlations).toHaveLength(0);
    });
  });
});
