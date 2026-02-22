/**
 * Rate Limiting Middleware
 *
 * Applies express-rate-limit to protect the API from abuse.
 * Default: 100 requests per minute per IP.
 * Auth endpoints have a stricter limit: 20 requests per 15 minutes per IP.
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter.
 * Allows 100 requests per minute per IP address.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable `X-RateLimit-*` headers
  message: {
    error: 'Too many requests from this IP. Please try again in a minute.',
    code: 429,
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiting for health check endpoint
    return req.path === '/health';
  },
});

/**
 * Strict rate limiter for authentication endpoints.
 * Allows 20 requests per 15 minutes per IP to prevent brute-force attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP. Please try again in 15 minutes.',
    code: 429,
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

module.exports = { apiLimiter, authLimiter };
