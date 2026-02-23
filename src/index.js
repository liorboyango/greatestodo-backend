/**
 * GreatesTODO Backend — Server Entry Point
 *
 * Sets up the Express application with:
 * - Security headers (Helmet)
 * - CORS configuration
 * - Rate limiting
 * - Request logging (Morgan)
 * - JSON body parsing
 * - API routes (auth + todos)
 * - 404 handler
 * - Centralized error handler
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const { corsMiddleware } = require('./config/cors');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const {
  verifyFirestoreConnection,
  verifyAdminSdkCredentials,
  confirmFirestoreDatabaseAccessible,
  getInitializationStatus,
} = require('./config/firebase');
const authRoutes = require('./routes/auth');
const todosRoutes = require('./routes/todos');

// ─── App Initialization ───────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ──────────────────────────────────────────────────────

/**
 * Helmet sets various HTTP security headers:
 * - Content-Security-Policy
 * - X-Content-Type-Options
 * - X-Frame-Options
 * - Strict-Transport-Security (HSTS)
 * - etc.
 */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────

/**
 * Apply CORS before other middleware so preflight OPTIONS requests
 * are handled correctly.
 */
app.use(corsMiddleware);

// Handle preflight requests explicitly for all routes
app.options('*', corsMiddleware);

// ─── Request Logging ──────────────────────────────────────────────────────────

/**
 * Morgan HTTP request logger.
 * Uses 'combined' format in production (Apache-style) and 'dev' in development.
 */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Body Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse incoming JSON request bodies.
 * Limit set to 10kb to prevent large payload attacks.
 */
app.use(express.json({ limit: '10kb' }));

/**
 * Parse URL-encoded bodies (for form submissions).
 */
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Global Rate Limiting ─────────────────────────────────────────────────────

/**
 * Apply general rate limiter to all /api routes.
 * Auth routes get an additional stricter limiter.
 */
app.use('/api', apiLimiter);

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * GET /health
 * Simple health check endpoint for uptime monitoring and load balancers.
 * Not rate-limited (skipped in rateLimiter config).
 * Includes Firebase initialization status for diagnostics.
 */
app.get('/health', (req, res) => {
  const firebaseStatus = getInitializationStatus();
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    firebase: {
      initialized: firebaseStatus.initialized,
      hasError: firebaseStatus.hasError,
      projectId: firebaseStatus.serviceAccount ? firebaseStatus.serviceAccount.projectId : null,
    },
  });
});

/**
 * GET /health/firestore
 * Dedicated Firestore accessibility check endpoint.
 *
 * Performs a live read+write test against the Firestore '(default)' database
 * to confirm it exists and is accessible. Returns detailed diagnostics
 * including error classification and remediation steps if the database
 * is not accessible.
 *
 * Response codes:
 * - 200: Database is accessible (canRead and canWrite are both true)
 * - 503: Database is not accessible (includes errorCode, errorMessage, diagnosis)
 * - 500: Unexpected error during the check itself
 *
 * @returns {200} { status: 'ok', accessible: true, databaseId, projectId, canRead, canWrite, checkedAt }
 * @returns {503} { status: 'error', accessible: false, databaseId, projectId, errorCode, errorMessage, diagnosis, checkedAt }
 */
app.get('/health/firestore', async (req, res) => {
  try {
    const result = await confirmFirestoreDatabaseAccessible();

    const statusCode = result.accessible ? 200 : 503;
    return res.status(statusCode).json({
      status: result.accessible ? 'ok' : 'error',
      ...result,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      accessible: false,
      databaseId: '(default)',
      errorMessage: err.message,
      diagnosis: 'Unexpected error during Firestore accessibility check.',
      checkedAt: new Date().toISOString(),
    });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────

/**
 * Auth routes — stricter rate limiting applied.
 * POST /api/auth/register
 * POST /api/auth/login
 */
app.use('/api/auth', authLimiter, authRoutes);

/**
 * Todos routes — protected by auth middleware (applied inside router).
 * GET    /api/todos
 * POST   /api/todos
 * PUT    /api/todos/:id
 * DELETE /api/todos/:id
 */
app.use('/api/todos', todosRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

/**
 * Catch-all for undefined routes.
 * Must be placed after all route definitions.
 */
app.use(notFoundHandler);

// ─── Centralized Error Handler ────────────────────────────────────────────────

/**
 * Global error handling middleware.
 * Must be the LAST middleware registered (4 arguments).
 */
app.use(errorHandler);

// ─── Server Start ─────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[Server] GreatesTODO backend running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] Firestore health: http://localhost:${PORT}/health/firestore`);

  // Run comprehensive credential verification after server starts.
  // This is a non-blocking diagnostic check — the server continues
  // running even if verification fails.
  verifyAdminSdkCredentials().then((credResult) => {
    if (credResult.success) {
      console.log('[Server] Firebase Admin SDK credential verification: PASSED');
    } else {
      console.error('[Server] Firebase Admin SDK credential verification: FAILED');
      console.error('[Server] Credential errors:', credResult.errors);
      console.error('[Server] User registration and authentication will not work until credentials are fixed.');
    }

    // Only verify Firestore connectivity if credentials are valid
    if (credResult.checks.sdkInitialized) {
      return verifyFirestoreConnection();
    }
    return false;
  }).then((isConnected) => {
    if (isConnected === false) {
      console.warn(
        '[Server] Firestore connectivity: FAILED. ' +
        'User registration and todo operations will not work until this is resolved. ' +
        'Check the logs above for diagnostic details.'
      );
      return null;
    } else if (isConnected === true) {
      console.log('[Server] Firestore connectivity: OK');
      // Perform a full database accessibility confirmation after basic connectivity passes
      return confirmFirestoreDatabaseAccessible();
    }
    return null;
  }).then((dbResult) => {
    if (dbResult === null || dbResult === undefined) return;

    if (dbResult.accessible) {
      console.log('[Server] Firestore \'(default)\' database: ACCESSIBLE');
      console.log(`[Server]   Project: ${dbResult.projectId}`);
      console.log(`[Server]   Read access: ${dbResult.canRead ? 'YES' : 'NO'}`);
      console.log(`[Server]   Write access: ${dbResult.canWrite ? 'YES' : 'NO'}`);
    } else {
      console.error('[Server] Firestore \'(default)\' database: NOT ACCESSIBLE');
      console.error(`[Server]   Error code: ${dbResult.errorCode}`);
      console.error(`[Server]   Error message: ${dbResult.errorMessage}`);
      console.error(`[Server]   Diagnosis: ${dbResult.diagnosis}`);
      console.error('[Server]   User registration will fail until this is resolved.');
      console.error('[Server]   Check GET /health/firestore for live status.');
    }
  }).catch((err) => {
    console.error('[Server] Startup verification error:', err.message);
  });
});

/**
 * Graceful shutdown handler.
 * Closes the HTTP server on SIGTERM/SIGINT signals (e.g., from Render or Ctrl+C).
 */
const gracefulShutdown = (signal) => {
  console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  // Force shutdown after 10 seconds if server hasn't closed
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Handle unhandled promise rejections.
 * Logs the error and exits — let the process manager restart the server.
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Promise Rejection:', reason);
  // In production, exit so the process manager can restart
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

/**
 * Handle uncaught exceptions.
 * These are bugs — log and exit immediately.
 */
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
  process.exit(1);
});

module.exports = app; // Export for testing
