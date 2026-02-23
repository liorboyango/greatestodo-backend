/**
 * Tests for the centralized error handler middleware.
 */

const { AppError, createError, notFoundHandler, errorHandler } = require('../middleware/errorHandler');

describe('AppError', () => {
  it('should create an error with default status 500', () => {
    const err = new AppError('Something went wrong');
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe(500);
    expect(err.isOperational).toBe(true);
  });

  it('should create an error with custom status code', () => {
    const err = new AppError('Not found', 404);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe(404);
  });

  it('should create an error with custom code', () => {
    const err = new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('should be an instance of Error', () => {
    const err = new AppError('Test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('createError', () => {
  it('should return an AppError instance', () => {
    const err = createError('Test error', 400);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('Test error');
    expect(err.statusCode).toBe(400);
  });

  it('should default to status 500', () => {
    const err = createError('Server error');
    expect(err.statusCode).toBe(500);
  });
});

describe('notFoundHandler', () => {
  it('should call next with a 404 AppError', () => {
    const req = { method: 'GET', originalUrl: '/api/unknown' };
    const res = {};
    const next = jest.fn();

    notFoundHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('/api/unknown');
  });
});

describe('errorHandler', () => {
  let req, res, next;

  beforeEach(() => {
    req = { path: '/test', method: 'GET', id: 'test-request-id' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should handle AppError with correct status and message', () => {
    const err = new AppError('Not found', 404);
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Not found', code: 404 })
    );
  });

  it('should include requestId in AppError response', () => {
    const err = new AppError('Not found', 404);
    errorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'test-request-id' })
    );
  });

  it('should handle JSON parse errors with 400', () => {
    const err = new Error('Unexpected token');
    err.type = 'entity.parse.failed';
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid JSON in request body.',
        code: 400,
      })
    );
  });

  it('should handle payload too large with 413', () => {
    const err = new Error('Payload too large');
    err.type = 'entity.too.large';
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Request body is too large.',
        code: 413,
      })
    );
  });

  it('should handle Firebase auth errors', () => {
    const err = new Error('Firebase error');
    err.code = 'auth/email-already-exists';
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'An account with this email already exists.',
        code: 409,
      })
    );
  });

  it('should handle Firestore NOT_FOUND (gRPC code 5) with 503', () => {
    const err = new Error('5 NOT_FOUND: ');
    err.code = 5;
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FIRESTORE_NOT_FOUND',
      })
    );
  });

  it('should handle Firestore PERMISSION_DENIED (gRPC code 7) with 503', () => {
    const err = new Error('7 PERMISSION_DENIED: ');
    err.code = 7;
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FIRESTORE_PERMISSION_DENIED',
      })
    );
  });

  it('should handle Firestore UNAVAILABLE (gRPC code 14) with 503', () => {
    const err = new Error('14 UNAVAILABLE: ');
    err.code = 14;
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FIRESTORE_UNAVAILABLE',
      })
    );
  });

  it('should handle Firestore UNAUTHENTICATED (gRPC code 16) with 503', () => {
    const err = new Error('16 UNAUTHENTICATED: ');
    err.code = 16;
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FIRESTORE_UNAUTHENTICATED',
      })
    );
  });

  it('should handle enhanced Firestore error (with originalError property) with 503', () => {
    const originalErr = new Error('5 NOT_FOUND: ');
    originalErr.code = 5;
    const enhancedErr = new Error('Firestore database not found or not accessible');
    enhancedErr.code = 5;
    enhancedErr.originalError = originalErr;
    errorHandler(enhancedErr, req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FIRESTORE_NOT_FOUND',
      })
    );
  });

  it('should return 500 for unknown errors in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = new Error('Unknown error');
    errorHandler(err, req, res, next);
    process.env.NODE_ENV = originalEnv;

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unknown error' })
    );
  });

  it('should hide error message in production for unknown errors', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('Sensitive internal error');
    errorHandler(err, req, res, next);
    process.env.NODE_ENV = originalEnv;

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'An unexpected error occurred. Please try again later.',
        code: 500,
      })
    );
  });
});
