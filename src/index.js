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
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
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
