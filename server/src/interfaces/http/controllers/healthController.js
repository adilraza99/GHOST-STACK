const { getDatabaseStatus } = require('../../../infrastructure/database');
const { config } = require('../../../config');

/**
 * GET /api/health
 *
 * Returns application and database health status.
 */
async function getHealth(req, res) {
  const dbStatus = getDatabaseStatus();

  const health = {
    status: dbStatus.state === 'connected' ? 'healthy' : 'degraded',
    version: require('../../../../package.json').version,
    environment: config.nodeEnv,
    database: dbStatus,
    uptime: Math.floor(process.uptime()),
  };

  const statusCode = health.status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    success: true,
    data: health,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

module.exports = { getHealth };
