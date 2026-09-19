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

/**
 * Creates and configures the Express application.
 * Responsible for middleware registration and route mounting.
 * Does NOT start the server — that is server.js's responsibility.
 */
function createApp() {
  const app = express();

  // --- Security middleware ---
  app.use(helmet());
  app.use(cors({
    origin: config.isDevelopment() ? '*' : process.env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
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

  // Future route groups will be mounted here:
  // app.use('/api', serviceRoutes);
  // app.use('/api', dependencyRoutes);
  // app.use('/api', telemetryRoutes);
  // app.use('/api', incidentRoutes);
  // app.use('/api', blastRadiusRoutes);
  // app.use('/api', deploymentRoutes);
  // app.use('/api', demoRoutes);

  // --- Error handling ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
