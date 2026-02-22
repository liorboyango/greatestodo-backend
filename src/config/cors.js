/**
 * CORS Configuration
 *
 * Configures Cross-Origin Resource Sharing for the Express server.
 * Allows requests from the React frontend (localhost:3000 in dev,
 * GitHub Pages in production).
 */

const cors = require('cors');

/**
 * Allowed origins for CORS.
 * - http://localhost:3000 — local React development server
 * - https://liorboyango.github.io — production GitHub Pages deployment
 */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://liorboyango.github.io',
];

/**
 * Additional origins from environment variable (comma-separated).
 * Useful for staging environments or custom domains.
 * Example: CORS_ORIGINS=https://staging.example.com,https://app.example.com
 */
if (process.env.CORS_ORIGINS) {
  const extraOrigins = process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  ALLOWED_ORIGINS.push(...extraOrigins);
}

/**
 * CORS options object.
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, curl, Postman, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // In development, also allow any localhost port
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS policy: Origin '${origin}' is not allowed.`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: [
    'RateLimit-Limit',
    'RateLimit-Remaining',
    'RateLimit-Reset',
  ],
  credentials: true,       // Allow cookies / Authorization headers
  optionsSuccessStatus: 204, // Some legacy browsers choke on 204
  maxAge: 86400,           // Cache preflight response for 24 hours
};

/**
 * Configured CORS middleware instance.
 */
const corsMiddleware = cors(corsOptions);

module.exports = { corsMiddleware, corsOptions, ALLOWED_ORIGINS };
