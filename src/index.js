/**
 * Server Entry Point
 *
 * Loads environment variables, initializes Firebase Admin SDK,
 * and starts the Express HTTP server.
 */

require('dotenv').config();

// Initialize Firebase Admin SDK before importing app
// (app.js imports routes which import firebase config)
const logger = require('./utils/logger');

// Validate required environment variables before starting
const REQUIRED_ENV_VARS = ['FIREBASE_SERVICE_ACCOUNT_JSON'];

const missingVars = REQUIRED_ENV_VARS.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error('Missing required environment variables', { missing: missingVars });
  process.exit(1);
}

// Import app after env validation (triggers Firebase init)
const app = require('./app');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = '0.0.0.0'; // Bind to all interfaces for Render deployment

/**
 * Start the HTTP server
 */
const server = app.listen(PORT, HOST, () => {
  logger.info(`GreatesTODO API server started`, {
    port: PORT,
    host: HOST,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
  });
});

/**
 * Graceful shutdown handler
 * Closes the server gracefully on SIGTERM/SIGINT signals
 */
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', { error: err.message });
      process.exit(1);
    }
    logger.info('Server closed successfully');
    process.exit(0);
  });

  // Force shutdown after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Handle uncaught exceptions and unhandled promise rejections
 */
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

module.exports = server; // Export for testing
