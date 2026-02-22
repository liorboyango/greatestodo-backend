/**
 * Authentication Middleware
 *
 * Provides Express middleware functions for verifying Firebase ID tokens
 * on protected routes. Uses Firebase Admin SDK to validate tokens server-side.
 *
 * Usage:
 *   router.get('/protected', verifyToken, (req, res) => {
 *     // req.user = { uid, email, ... }
 *   });
 */

const { auth } = require('../config/firebase');

/**
 * Extracts the Bearer token from the Authorization header.
 *
 * @param {import('express').Request} req - Express request object
 * @returns {string|null} The raw token string, or null if not present
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

  return parts[1] || null;
}

/**
 * Middleware: verifyToken
 *
 * Validates the Firebase ID token supplied in the `Authorization: Bearer <token>`
 * header. On success, attaches the decoded token payload to `req.user` and calls
 * `next()`. On failure, responds with an appropriate 401 JSON error.
 *
 * Error codes returned:
 *   - MISSING_TOKEN      – No Authorization header / token found
 *   - TOKEN_EXPIRED      – The token has passed its expiry time
 *   - TOKEN_REVOKED      – The token has been revoked (e.g. user signed out)
 *   - INVALID_TOKEN      – Signature invalid, malformed, or other Firebase error
 *
 * @type {import('express').RequestHandler}
 */
async function verifyToken(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required. Please provide a valid Bearer token.',
        code: 401,
        errorCode: 'MISSING_TOKEN',
      });
    }

    // checkRevoked: true ensures revoked tokens (e.g. after sign-out) are rejected
    const decodedToken = await auth.verifyIdToken(token, /* checkRevoked= */ true);

    // Attach a clean user object to the request for downstream handlers
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      emailVerified: decodedToken.email_verified || false,
    };

    return next();
  } catch (err) {
    // Firebase Admin SDK error codes
    // See: https://firebase.google.com/docs/auth/admin/errors
    const firebaseCode = err.code || '';

    if (firebaseCode === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Your session has expired. Please sign in again.',
        code: 401,
        errorCode: 'TOKEN_EXPIRED',
      });
    }

    if (firebaseCode === 'auth/id-token-revoked') {
      return res.status(401).json({
        error: 'Your session has been revoked. Please sign in again.',
        code: 401,
        errorCode: 'TOKEN_REVOKED',
      });
    }

    if (
      firebaseCode === 'auth/argument-error' ||
      firebaseCode === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({
        error: 'Invalid authentication token. Please sign in again.',
        code: 401,
        errorCode: 'INVALID_TOKEN',
      });
    }

    // Unexpected error – log it but don't leak internals to the client
    console.error('[verifyToken] Unexpected error verifying ID token:', err);
    return res.status(401).json({
      error: 'Authentication failed. Please sign in again.',
      code: 401,
      errorCode: 'INVALID_TOKEN',
    });
  }
}

/**
 * Middleware: optionalAuth
 *
 * Attempts to verify a Bearer token if one is present, but does NOT block the
 * request if the token is absent or invalid. Useful for routes that return
 * different data for authenticated vs. anonymous users.
 *
 * When a valid token is found, `req.user` is populated exactly as in
 * `verifyToken`. Otherwise `req.user` remains `null`.
 *
 * @type {import('express').RequestHandler}
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      req.user = null;
      return next();
    }

    const decodedToken = await auth.verifyIdToken(token, /* checkRevoked= */ true);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      emailVerified: decodedToken.email_verified || false,
    };
  } catch {
    // Token present but invalid – treat as unauthenticated
    req.user = null;
  }

  return next();
}

module.exports = { verifyToken, optionalAuth };
