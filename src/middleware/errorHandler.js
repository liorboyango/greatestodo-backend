/**
 * Centralized Error Handling Middleware
 *
 * Provides:
 * - AppError class for structured application errors
 * - createError() factory helper
 * - notFoundHandler() for unmatched routes (404)
 * - errorHandler() Express error middleware (must be last)
 *
 * Error classification:
 * - AppError (operational): returned as-is with the configured status code
 * - Firebase Auth errors: mapped to user-friendly HTTP responses
 * - Firestore/gRPC errors: classified by gRPC code with actionable messages
 * - Joi validation errors: 400 with field-level detail
 * - JSON parse errors: 400
 * - Payload too large: 413
 * - Unknown errors: 500 (message hidden in production)
 */

'use strict';

const logger = require('../utils/logger');

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
 * @param {boolean} isDev - Whether running in development mode
 * @returns {{ statusCode: number, message: string } | null}
 */
const mapFirebaseError = (err, isDev = false) => {
  const code = typeof err.code === 'string' ? err.code : String(err.code || '');

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

  // Generic Firebase auth error
  if (code.startsWith('auth/')) {
    const message = isDev
      ? `Authentication error (${code}). Please try again.`
      : 'Authentication error. Please try again.';
    return { statusCode: 401, message };
  }

  return null;
};

/**
 * Maps Firestore/gRPC error codes to HTTP status codes and user-friendly messages.
 *
 * gRPC status codes relevant to Firestore:
 * - 5  (NOT_FOUND):        Database or document does not exist
 * - 7  (PERMISSION_DENIED): Service account lacks IAM permissions
 * - 14 (UNAVAILABLE):      Transient network or service outage
 * - 16 (UNAUTHENTICATED):  Invalid or expired credentials
 *
 * @param {Error} err - The original error
 * @returns {{ statusCode: number, message: string, code: string } | null}
 */
const mapFirestoreError = (err) => {
  const numericCode = typeof err.code === 'number' ? err.code : null;
  const stringCode = typeof err.code === 'string' ? err.code : '';
  const message = err.message || '';

  // gRPC NOT_FOUND (code 5) — database does not exist or wrong project
  const isNotFound =
    numericCode === 5 ||
    stringCode === '5' ||
    message.includes('NOT_FOUND');

  // gRPC PERMISSION_DENIED (code 7) — service account lacks IAM permissions
  const isPermissionDenied =
    numericCode === 7 ||
    stringCode === '7' ||
    message.includes('PERMISSION_DENIED');

  // gRPC UNAVAILABLE (code 14) — transient network/service outage
  const isUnavailable =
    numericCode === 14 ||
    stringCode === '14' ||
    message.includes('UNAVAILABLE');

  // gRPC UNAUTHENTICATED (code 16) — invalid or expired credentials
  const isUnauthenticated =
    numericCode === 16 ||
    stringCode === '16' ||
    message.includes('UNAUTHENTICATED');

  if (isNotFound) {
    return {
      statusCode: 503,
      message: 'The database is not accessible. Please try again later or contact support.',
      code: 'FIRESTORE_NOT_FOUND',
    };
  }

  if (isPermissionDenied) {
    return {
      statusCode: 503,
      message: 'The server does not have permission to access the database. Please contact support.',
      code: 'FIRESTORE_PERMISSION_DENIED',
    };
  }

  if (isUnauthenticated) {
    return {
      statusCode: 503,
      message: 'The server credentials are invalid. Please contact support.',
      code: 'FIRESTORE_UNAUTHENTICATED',
    };
  }

  if (isUnavailable) {
    return {
      statusCode: 503,
      message: 'The database is temporarily unavailable. Please try again in a moment.',
      code: 'FIRESTORE_UNAVAILABLE',
    };
  }

  return null;
};

/**
 * Determines whether an error originated from Firestore/gRPC.
 * Used to route errors to the Firestore-specific handler.
 *
 * @param {Error} err
 * @returns {boolean}
 */
const isFirestoreError = (err) => {
  const numericCode = typeof err.code === 'number' ? err.code : null;
  const message = err.message || '';
  const stack = err.stack || '';

  // Numeric gRPC codes are a strong signal
  if (numericCode !== null && [5, 7, 14, 16].includes(numericCode)) {
    return true;
  }

  // Stack trace mentions Firestore SDK
  if (
    stack.includes('@google-cloud/firestore') ||
    stack.includes('firestore_client') ||
    stack.includes('write-batch')
  ) {
    return true;
  }

  // Message contains gRPC status names
  if (
    message.includes('NOT_FOUND') ||
    message.includes('PERMISSION_DENIED') ||
    message.includes('UNAVAILABLE') ||
    message.includes('UNAUTHENTICATED')
  ) {
    // Only if it looks like a gRPC error (not a generic message)
    if (
      message.includes('GRPC') ||
      message.includes('grpc') ||
      message.includes('Firestore') ||
      message.includes('firestore') ||
      (err.originalError !== undefined) // Enhanced error from userModel
    ) {
      return true;
    }
  }

  // Enhanced error from userModel.createUser (has originalError property)
  if (err.originalError !== undefined) {
    return true;
  }

  return false;
};

/**
 * Central Express error-handling middleware.
 * Must be registered AFTER all routes and other middleware.
 *
 * Handles:
 * - AppError instances (operational errors)
 * - Firebase Admin SDK auth errors
 * - Firestore/gRPC errors (classified by gRPC status code)
 * - Joi validation errors (passed via validateBody/validateQuery)
 * - JSON parse errors (malformed request body)
 * - Payload too large
 * - Generic/unexpected errors (returns 500 in production)
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const requestId = req.id || 'unknown';
  const requestMeta = {
    requestId,
    path: req.path,
    method: req.method,
    errorName: err.name,
    errorCode: err.code,
  };

  // ── Logging ────────────────────────────────────────────────────────────────

  if (err instanceof AppError && err.isOperational) {
    // Operational errors (expected): log at warn level
    logger.warn('[ErrorHandler] Operational error', {
      ...requestMeta,
      statusCode: err.statusCode,
      message: err.message,
    });
  } else {
    // Unexpected errors (bugs or infrastructure issues): log at error level with stack
    logger.error('[ErrorHandler] Unexpected error', {
      ...requestMeta,
      message: err.message,
      stack: err.stack,
    });
  }

  // ── AppError (operational errors) ─────────────────────────────────────────

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(requestId !== 'unknown' && { requestId }),
    });
  }

  // ── Firebase Auth errors ───────────────────────────────────────────────────

  const firebaseMapped = mapFirebaseError(err, isDev);
  if (firebaseMapped) {
    logger.warn('[ErrorHandler] Firebase Auth error mapped', {
      ...requestMeta,
      statusCode: firebaseMapped.statusCode,
      firebaseCode: err.code,
    });
    return res.status(firebaseMapped.statusCode).json({
      error: firebaseMapped.message,
      code: firebaseMapped.statusCode,
      ...(requestId !== 'unknown' && { requestId }),
    });
  }

  // ── Firestore / gRPC errors ────────────────────────────────────────────────

  if (isFirestoreError(err)) {
    const firestoreMapped = mapFirestoreError(err);
    if (firestoreMapped) {
      logger.error('[ErrorHandler] Firestore/gRPC error mapped', {
        ...requestMeta,
        statusCode: firestoreMapped.statusCode,
        grpcCode: err.code,
        originalMessage: err.message,
        firestoreCode: firestoreMapped.code,
      });
      return res.status(firestoreMapped.statusCode).json({
        error: firestoreMapped.message,
        code: firestoreMapped.code,
        ...(requestId !== 'unknown' && { requestId }),
      });
    }

    // Firestore error but not a recognized gRPC code — return 503
    logger.error('[ErrorHandler] Unclassified Firestore error', {
      ...requestMeta,
      grpcCode: err.code,
      originalMessage: err.message,
    });
    return res.status(503).json({
      error: 'A database error occurred. Please try again later.',
      code: 'FIRESTORE_ERROR',
      ...(requestId !== 'unknown' && { requestId }),
    });
  }

  // ── Joi validation errors (if thrown directly) ─────────────────────────────

  if (err.name === 'ValidationError' && err.isJoi) {
    const messages = err.details.map((d) => d.message).join('; ');
    return res.status(400).json({
      error: messages,
      code: 400,
      ...(requestId !== 'unknown' && { requestId }),
    });
  }

  // ── JSON parse errors (malformed request body) ─────────────────────────────

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON in request body.',
      code: 400,
      ...(requestId !== 'unknown' && { requestId }),
    });
  }

  // ── Payload too large ──────────────────────────────────────────────────────

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body is too large.',
      code: 413,
      ...(requestId !== 'unknown' && { requestId }),
    });
  }

  // ── Fallback: unexpected/unhandled errors ──────────────────────────────────

  const message = isDev
    ? err.message
    : 'An unexpected error occurred. Please try again later.';

  return res.status(500).json({
    error: message,
    code: 500,
    ...(requestId !== 'unknown' && { requestId }),
  });
};

module.exports = { AppError, createError, notFoundHandler, errorHandler };
