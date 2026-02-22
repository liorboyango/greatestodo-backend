/**
 * Centralized Error Handling Middleware
 *
 * Catches all errors passed via next(error) and returns
 * a consistent JSON error response.
 *
 * Error format: { error: string, code: number }
 */

const logger = require('../utils/logger');

/**
 * 404 Not Found handler — must be registered AFTER all routes
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 404,
  });
}

/**
 * Global error handler — must be registered LAST with 4 parameters
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, next) {
  // Log the error with context
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user ? req.user.uid : 'unauthenticated',
  });

  // Handle Joi validation errors
  if (err.isJoi || err.name === 'ValidationError') {
    return res.status(400).json({
      error: err.details ? err.details[0].message : err.message,
      code: 400,
    });
  }

  // Handle Firebase errors
  if (err.code && err.code.startsWith('auth/')) {
    return res.status(401).json({
      error: 'Authentication error: ' + err.message,
      code: 401,
    });
  }

  // Handle known HTTP errors (with statusCode property)
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.statusCode,
    });
  }

  // Default: 500 Internal Server Error
  // Don't expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
    code: 500,
  });
}

module.exports = { notFoundHandler, globalErrorHandler };
