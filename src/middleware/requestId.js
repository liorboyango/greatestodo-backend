/**
 * Request Correlation ID Middleware
 *
 * Assigns a unique UUID to every incoming HTTP request and attaches it to:
 * - req.id          — for use in controllers and services
 * - res header      — X-Request-Id, so clients can correlate responses with logs
 *
 * This enables end-to-end tracing of a single request across all log lines,
 * making it much easier to diagnose failures in the registration flow.
 *
 * Usage:
 *   app.use(requestIdMiddleware);
 *   // Then in controllers: req.id is available
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Express middleware that assigns a unique request ID to each request.
 *
 * Priority order for the request ID:
 * 1. X-Request-Id header from the client (allows client-side correlation)
 * 2. X-Correlation-Id header (alternative header name)
 * 3. Auto-generated UUID v4
 *
 * @type {import('express').RequestHandler}
 */
const requestIdMiddleware = (req, res, next) => {
  const requestId =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    uuidv4();

  // Attach to request object for use in controllers/services
  req.id = requestId;

  // Echo back in response headers for client-side correlation
  res.setHeader('X-Request-Id', requestId);

  next();
};

module.exports = { requestIdMiddleware };
