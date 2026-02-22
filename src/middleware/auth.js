/**
 * Authentication Middleware
 *
 * Verifies Firebase ID tokens from the Authorization header.
 * Attaches the decoded token (including uid) to req.user.
 *
 * Usage: Apply to any protected route.
 * Header format: Authorization: Bearer <firebase-id-token>
 */

const { auth } = require('../config/firebase');
const logger = require('../utils/logger');

/**
 * Middleware to verify Firebase ID token
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function verifyIdToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized: Missing or invalid Authorization header',
        code: 401,
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken || idToken.trim() === '') {
      return res.status(401).json({
        error: 'Unauthorized: Token is empty',
        code: 401,
      });
    }

    // Verify the token with Firebase Auth
    const decodedToken = await auth.verifyIdToken(idToken);

    // Attach decoded token to request for downstream use
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
    };

    logger.debug('Token verified successfully', { uid: decodedToken.uid });

    next();
  } catch (error) {
    logger.warn('Token verification failed', {
      error: error.message,
      code: error.code,
    });

    // Handle specific Firebase Auth errors
    if (
      error.code === 'auth/id-token-expired' ||
      error.code === 'auth/id-token-revoked'
    ) {
      return res.status(401).json({
        error: 'Unauthorized: Token has expired or been revoked',
        code: 401,
      });
    }

    if (
      error.code === 'auth/argument-error' ||
      error.code === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid token',
        code: 401,
      });
    }

    return res.status(401).json({
      error: 'Unauthorized: Token verification failed',
      code: 401,
    });
  }
}

module.exports = { verifyIdToken };
