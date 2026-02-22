/**
 * Authentication Middleware
 *
 * Verifies Firebase ID tokens sent in the Authorization header.
 * Attaches the decoded token payload (including uid) to req.user.
 *
 * Usage: Apply to any route that requires authentication.
 * Example: router.use(verifyToken);
 */

const { getAuth } = require('../config/firebase');
const { createError } = require('./errorHandler');

/**
 * Express middleware that verifies a Firebase ID token.
 *
 * Expects: Authorization: Bearer <firebase-id-token>
 *
 * On success: sets req.user = { uid, email, ...decodedToken }
 * On failure: passes a 401 AppError to next()
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next(createError('Authorization header is missing.', 401));
    }

    if (!authHeader.startsWith('Bearer ')) {
      return next(
        createError(
          'Invalid authorization format. Expected: Bearer <token>',
          401
        )
      );
    }

    const idToken = authHeader.split('Bearer ')[1].trim();

    if (!idToken) {
      return next(createError('Authorization token is missing.', 401));
    }

    const auth = getAuth();

    // Verify the ID token with Firebase Admin SDK
    // checkRevoked: true ensures revoked tokens are rejected
    const decodedToken = await auth.verifyIdToken(idToken, true);

    // Attach user info to request for downstream use
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      ...decodedToken,
    };

    next();
  } catch (err) {
    // Map Firebase token errors to user-friendly messages
    if (err.code === 'auth/id-token-expired') {
      return next(createError('Your session has expired. Please log in again.', 401));
    }
    if (err.code === 'auth/id-token-revoked') {
      return next(createError('Your session has been revoked. Please log in again.', 401));
    }
    if (
      err.code === 'auth/invalid-id-token' ||
      err.code === 'auth/argument-error'
    ) {
      return next(createError('Invalid authentication token.', 401));
    }
    if (err.code === 'auth/user-disabled') {
      return next(createError('This account has been disabled.', 403));
    }

    // Pass other errors to the centralized error handler
    next(err);
  }
};

module.exports = { verifyToken };
