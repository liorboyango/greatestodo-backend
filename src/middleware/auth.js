/**
 * Authentication Middleware
 * Verifies Firebase ID tokens (JWT) on protected routes.
 */

const { auth } = require('../config/firebase');

/**
 * Express middleware that verifies the Bearer token in the Authorization header.
 * On success, attaches the decoded token payload to req.user.
 * On failure, responds with 401 Unauthorized.
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
      return res.status(401).json({ error: 'Token is empty', code: 401 });
    }

    // Verify the Firebase ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;

    return next();
  } catch (error) {
    console.error('Token verification failed:', error.message);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token has expired. Please log in again.', code: 401 });
    }

    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid token', code: 401 });
    }

    return res.status(401).json({ error: 'Unauthorized', code: 401 });
  }
}

module.exports = { verifyToken };
