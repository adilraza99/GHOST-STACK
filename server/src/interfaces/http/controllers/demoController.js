const { success } = require('../helpers/response');

/**
 * Demo controller — thin HTTP adapter.
 * Demo simulator logic will be implemented in a later stage.
 * These endpoints are stubs that will be wired to the simulator.
 */
function createDemoController({
  serviceRepository,
  dependencyRepository,
  telemetryRepository,
  incidentRepository,
  incidentEventRepository,
  deploymentRepository,
}) {
  const scenarios = [
    { id: 'payment-degradation', name: 'Payment Service Degradation', description: 'Simulates cascading failure from payment service' },
    { id: 'latency-spike', name: 'Latency Spike', description: 'Simulates high latency across service mesh' },
    { id: 'deployment-failure', name: 'Deployment Failure', description: 'Simulates a failed deployment with rollback' },
  ];

  return {
    /** POST /api/demo/reset */
    async reset(req, res) {
      await serviceRepository.deleteAll();
      await dependencyRepository.deleteAll();
      await telemetryRepository.deleteAll();
      await incidentRepository.deleteAll();
      await incidentEventRepository.deleteAll();
      await deploymentRepository.deleteAll();
      success(res, { message: 'All data cleared' });
    },

    /** POST /api/demo/start */
    async start(req, res) {
      // Stub — will be wired to DemoSimulator in Stage 8
      success(res, { message: 'Demo simulator not yet implemented', status: 'pending' });
    },

    /** GET /api/demo/scenarios */
    async listScenarios(req, res) {
      success(res, scenarios);
    },

    /** POST /api/demo/scenarios/:scenario */
    async runScenario(req, res) {
      const { scenario } = req.params;
      const found = scenarios.find((s) => s.id === scenario);
      if (!found) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Scenario not found: ${scenario}` },
        });
      }
      // Stub — will be wired to DemoSimulator in Stage 8
      success(res, { scenario: found, message: 'Scenario execution not yet implemented', status: 'pending' });
    },
  };
}

module.exports = { createDemoController };
