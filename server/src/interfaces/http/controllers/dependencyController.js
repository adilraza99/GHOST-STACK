const { success } = require('../helpers/response');

/**
 * Dependency controller — thin HTTP adapter.
 */
function createDependencyController({ dependencyRepository, graphService }) {
  return {
    /** GET /api/dependencies */
    async listDependencies(req, res) {
      const deps = await dependencyRepository.findAll();
      success(res, deps.map((d) => d.toJSON()));
    },

    /** GET /api/dependencies/graph */
    async getGraph(req, res) {
      await graphService.build();
      const stats = graphService.getStats();
      const deps = await dependencyRepository.findAll();
      success(res, {
        stats,
        edges: deps.map((d) => d.toJSON()),
      });
    },
  };
}

module.exports = { createDependencyController };
