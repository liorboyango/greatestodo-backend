/**
 * GreatesTODO Backend Server
 *
 * Express server with Firebase Admin SDK integration.
 * Provides RESTful API for todo management with Firebase Authentication.
 *
 * Environment Variables Required:
 *   - FIREBASE_SERVICE_ACCOUNT_JSON  : Firebase service account credentials (JSON string)
 *   - FIREBASE_WEB_API_KEY           : Firebase Web API key (for client auth REST calls)
 *   - PORT                           : Server port (default: 3001)
 *   - CORS_ORIGIN                    : Allowed CORS origins (comma-separated)
 *   - NODE_ENV                       : 'development' | 'production'
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const todosRoutes = require('./routes/todos');

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── Security Middleware ──────────────────────────────────────────────────────

// Helmet: sets various HTTP security headers
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'https://liorboyango.github.io'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy: origin '${origin}' is not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.', code: 429 },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 auth attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.', code: 429 },
});

app.use(globalLimiter);

// ─── Request Parsing ──────────────────────────────────────────────────────────

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Logging ──────────────────────────────────────────────────────────────────

if (NODE_ENV !== 'test') {
  app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/todos', todosRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: 404,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[GlobalErrorHandler]', err);

  // Handle CORS errors
  if (err.message && err.message.startsWith('CORS policy')) {
    return res.status(403).json({ error: err.message, code: 403 });
  }

  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body', code: 400 });
  }

  return res.status(500).json({ error: 'Internal server error', code: 500 });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Server] GreatesTODO backend running on port ${PORT} (${NODE_ENV})`);
});

module.exports = app; // Export for testing
