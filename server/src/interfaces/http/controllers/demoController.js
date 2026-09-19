const { success } = require('../helpers/response');

/**
 * Demo controller — thin HTTP adapter.
 * Delegates all scenario logic to DemoSimulator (application service).
 */
function createDemoController({ demoSimulator }) {
  return {
    /** POST /api/demo/reset */
    async reset(req, res) {
      await demoSimulator.reset();
      success(res, { message: 'All data cleared' });
    },

    /** POST /api/demo/start */
    async start(req, res) {
      // Run the complete-incident scenario by default when /demo/start is called
      const now = new Date();
      const result = await demoSimulator.run('complete-incident', now);
      success(res, result);
    },

    /** GET /api/demo/scenarios */
    async listScenarios(req, res) {
      success(res, demoSimulator.listScenarios());
    },

    /** POST /api/demo/scenarios/:scenario */
    async runScenario(req, res) {
      const { scenario } = req.params;
      const now = new Date();
      const result = await demoSimulator.run(scenario, now);
      success(res, result);
    },
  };
}

module.exports = { createDemoController };
