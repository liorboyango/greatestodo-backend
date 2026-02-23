/**
 * Express Application Configuration
 *
 * Sets up the Express app with all middleware and routes.
 * Separated from index.js to allow easier testing.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const todosRoutes = require('./routes/todos');
// Fix: errorHandler.js exports 'errorHandler', not 'globalErrorHandler'
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// ─── Security Middleware ──────────────────────────────────────────────────────

/**
 * Helmet: Sets various HTTP security headers
 * - Removes X-Powered-By
 * - Sets Content-Security-Policy
 * - Enables HSTS, XSS protection, etc.
 */
app.use(helmet());

/**
 * CORS Configuration
 * Allows requests from specified origins only
 */
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000', 'https://liorboyango.github.io'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      logger.warn('CORS blocked request from origin', { origin });
      return callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  })
);

/**
 * Rate Limiting
 * Limits each IP to 100 requests per minute by default
 */
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again later',
    code: 429,
  },
  skip: (req) => process.env.NODE_ENV === 'test', // Skip rate limiting in tests
});

app.use('/api', limiter);

// ─── Request Parsing ──────────────────────────────────────────────────────────

app.use(express.json({ limit: '10kb' })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Logging ──────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    })
  );
}

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * @route   GET /health
 * @desc    Health check endpoint for deployment monitoring
 * @access  Public
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/todos', todosRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────

// 404 handler — must be after all routes
app.use(notFoundHandler);

// Global error handler — must be last with 4 params
app.use(errorHandler);

module.exports = app;
