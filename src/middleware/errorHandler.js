/**
 * Centralized Error Handling Middleware
 *
 * Provides:
 * - AppError class for structured application errors
 * - createError() factory helper
 * - notFoundHandler() for unmatched routes (404)
 * - errorHandler() Express error middleware (must be last)
 */

/**
 * Custom application error class.
 * Extends the native Error with an HTTP status code and optional error code.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code (default 500)
   * @param {string|number} [code] - Optional machine-readable error code
   */
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code || statusCode;
    this.isOperational = true; // Distinguishes expected errors from bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Factory function to create an AppError instance.
 *
 * @param {string} message - Error message
 * @param {number} [statusCode=500] - HTTP status code
 * @param {string|number} [code] - Optional error code
 * @returns {AppError}
 */
const createError = (message, statusCode = 500, code = null) =>
  new AppError(message, statusCode, code);

/**
 * Middleware to handle requests to undefined routes.
 * Passes a 404 AppError to the next error handler.
 *
 * @type {import('express').RequestHandler}
 */
const notFoundHandler = (req, res, next) => {
  next(createError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

/**
 * Maps Firebase Admin SDK error codes to HTTP status codes and user-friendly messages.
 *
 * @param {Error} err - The original error
 * @returns {{ statusCode: number, message: string }}
 */
const mapFirebaseError = (err) => {
  const code = err.code || '';

  const firebaseErrorMap = {
    'auth/email-already-exists': { statusCode: 409, message: 'An account with this email already exists.' },
    'auth/invalid-email': { statusCode: 400, message: 'The email address is invalid.' },
    'auth/weak-password': { statusCode: 400, message: 'Password is too weak. Please choose a stronger password.' },
    'auth/user-not-found': { statusCode: 401, message: 'Invalid email or password.' },
    'auth/wrong-password': { statusCode: 401, message: 'Invalid email or password.' },
    'auth/invalid-credential': { statusCode: 401, message: 'Invalid email or password.' },
    'auth/too-many-requests': { statusCode: 429, message: 'Too many failed attempts. Please try again later.' },
    'auth/id-token-expired': { statusCode: 401, message: 'Your session has expired. Please log in again.' },
    'auth/id-token-revoked': { statusCode: 401, message: 'Your session has been revoked. Please log in again.' },
    'auth/argument-error': { statusCode: 400, message: 'Invalid authentication token.' },
    'auth/invalid-id-token': { statusCode: 401, message: 'Invalid authentication token.' },
    'auth/user-disabled': { statusCode: 403, message: 'This account has been disabled.' },
  };

  if (firebaseErrorMap[code]) {
    return firebaseErrorMap[code];
  }

  // Generic Firebase error
  if (code.startsWith('auth/')) {
    return { statusCode: 401, message: 'Authentication error. Please try again.' };
  }

  return null;
};

/**
 * Central Express error-handling middleware.
 * Must be registered AFTER all routes and other middleware.
 *
 * Handles:
 * - AppError instances (operational errors)
 * - Firebase Admin SDK errors
 * - Joi validation errors (passed via validateBody/validateQuery)
 * - Generic/unexpected errors (returns 500 in production)
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';

  // Log all errors for debugging
  if (isDev) {
    console.error('[ErrorHandler]', {
      name: err.name,
      message: err.message,
      statusCode: err.statusCode,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  } else {
    // In production, log only non-operational errors (bugs)
    if (!err.isOperational) {
      console.error('[ErrorHandler] Unexpected error:', err.message, err.stack);
    }
  }

  // Handle AppError (operational errors)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  // Handle Firebase errors
  const firebaseMapped = mapFirebaseError(err);
  if (firebaseMapped) {
    return res.status(firebaseMapped.statusCode).json({
      error: firebaseMapped.message,
      code: firebaseMapped.statusCode,
    });
  }

  // Handle Joi validation errors (if thrown directly)
  if (err.name === 'ValidationError' && err.isJoi) {
    const messages = err.details.map((d) => d.message).join('; ');
    return res.status(400).json({
      error: messages,
      code: 400,
    });
  }

  // Handle JSON parse errors (malformed request body)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON in request body.',
      code: 400,
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body is too large.',
      code: 413,
    });
  }

  // Fallback: unexpected/unhandled errors
  const message = isDev ? err.message : 'An unexpected error occurred. Please try again later.';
  return res.status(500).json({
    error: message,
    code: 500,
  });
};

module.exports = { AppError, createError, notFoundHandler, errorHandler };
