const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { config } = require('./config');
const {
  requestIdMiddleware,
  requestLogger,
  errorHandler,
  notFoundHandler,
} = require('./interfaces/http/middleware');
const healthRoutes = require('./interfaces/http/routes/healthRoutes');
const { createServiceRoutes } = require('./interfaces/http/routes/serviceRoutes');
const { createDependencyRoutes } = require('./interfaces/http/routes/dependencyRoutes');
const { createTelemetryRoutes } = require('./interfaces/http/routes/telemetryRoutes');
const { createBlastRadiusRoutes } = require('./interfaces/http/routes/blastRadiusRoutes');
const { createIncidentRoutes } = require('./interfaces/http/routes/incidentRoutes');
const { createDeploymentRoutes } = require('./interfaces/http/routes/deploymentRoutes');
const { createDemoRoutes } = require('./interfaces/http/routes/demoRoutes');
const { createProjectRoutes } = require('./interfaces/http/routes/projectRoutes');

/**
 * Creates and configures the Express application.
 * Responsible for middleware registration and route mounting.
 * Does NOT start the server — that is server.js's responsibility.
 *
 * @param {object} container - Dependency container from createContainer()
 */
function createApp(container) {
  const app = express();

  // --- Security middleware ---
  app.use(helmet());
  app.use(cors({
    origin: config.isDevelopment() ? '*' : process.env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-GhostStack-Key'],
  }));

  // --- Rate limiting ---
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    },
  });
  app.use(limiter);

  // --- Request parsing ---
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // --- Request tracking & logging ---
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  // --- API Routes ---
  app.use('/api', healthRoutes);
  app.use('/api', createServiceRoutes(container));
  app.use('/api', createDependencyRoutes(container));
  app.use('/api', createTelemetryRoutes(container));
  app.use('/api', createBlastRadiusRoutes(container));
  app.use('/api', createIncidentRoutes(container));
  app.use('/api', createDeploymentRoutes(container));
  app.use('/api', createDemoRoutes(container));
  app.use('/api', createProjectRoutes(container));

  // --- Error handling ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
