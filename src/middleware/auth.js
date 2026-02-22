/**
 * Authentication Middleware
 *
 * Verifies the Firebase ID token (JWT) sent in the Authorization header.
 * Attaches the decoded token payload to req.user for downstream handlers.
 *
 * Usage:
 *   router.use(verifyToken);
 *   // or per-route:
 *   router.get('/protected', verifyToken, handler);
 *
 * Expected Header:
 *   Authorization: Bearer <firebase-id-token>
 */

const { getAuth } = require('../config/firebase');

/**
 * Express middleware that verifies a Firebase ID token.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authorization header missing or malformed. Expected: Bearer <token>',
        code: 401,
      });
    }

    const idToken = authHeader.split('Bearer ')[1].trim();

    if (!idToken) {
      return res.status(401).json({
        error: 'Bearer token is empty',
        code: 401,
      });
    }

    // Verify the token with Firebase Auth
    const decodedToken = await getAuth().verifyIdToken(idToken);

    // Attach decoded token to request for downstream use
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };

    return next();
  } catch (err) {
    // Handle specific Firebase Auth errors
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Token has expired. Please sign in again.',
        code: 401,
      });
    }

    if (err.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        error: 'Token has been revoked. Please sign in again.',
        code: 401,
      });
    }

    if (
      err.code === 'auth/argument-error' ||
      err.code === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({
        error: 'Invalid token. Please sign in again.',
        code: 401,
      });
    }

    console.error('[authMiddleware.verifyToken] Unexpected error:', err);
    return res.status(401).json({
      error: 'Authentication failed',
      code: 401,
    });
  }
}

module.exports = { verifyToken };
