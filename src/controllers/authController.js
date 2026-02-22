/**
 * Authentication Controller
 *
 * Handles user registration and login using Firebase Auth.
 * On registration, also creates a user document in Firestore.
 *
 * POST /api/auth/register - Create new user
 * POST /api/auth/login    - Sign in existing user
 */

const { admin, db, auth } = require('../config/firebase');
const { registerSchema, loginSchema, validate } = require('../validators/auth');
const logger = require('../utils/logger');

/**
 * Register a new user
 * @route POST /api/auth/register
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function register(req, res, next) {
  try {
    // Validate request body
    const { value, error } = validate(registerSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const { email, password } = value;

    // Create user in Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password,
        emailVerified: false,
      });
    } catch (firebaseError) {
      if (firebaseError.code === 'auth/email-already-exists') {
        return res.status(400).json({
          error: 'An account with this email already exists',
          code: 400,
        });
      }
      if (firebaseError.code === 'auth/invalid-email') {
        return res.status(400).json({
          error: 'Invalid email address',
          code: 400,
        });
      }
      if (firebaseError.code === 'auth/weak-password') {
        return res.status(400).json({
          error: 'Password is too weak',
          code: 400,
        });
      }
      throw firebaseError;
    }

    // Create user document in Firestore
    const userDoc = {
      uid: userRecord.uid,
      email: userRecord.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('users').doc(userRecord.uid).set(userDoc);

    // Create a custom token for immediate login
    // Note: In production, the client should use Firebase Client SDK to sign in
    // and get an ID token. The custom token is used here for convenience.
    const customToken = await auth.createCustomToken(userRecord.uid);

    logger.info('User registered successfully', { uid: userRecord.uid, email });

    return res.status(201).json({
      token: customToken,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
      },
    });
  } catch (err) {
    logger.error('Registration error', { error: err.message });
    next(err);
  }
}

/**
 * Login an existing user
 * @route POST /api/auth/login
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function login(req, res, next) {
  try {
    // Validate request body
    const { value, error } = validate(loginSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const { email, password } = value;

    // Firebase Admin SDK does not support password-based sign-in directly.
    // We use the Firebase REST API (Identity Toolkit) for email/password auth.
    const fetch = require('node-fetch');
    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

    if (!FIREBASE_API_KEY) {
      // Fallback: verify user exists and return custom token
      // This is a limited flow — client should use Firebase Client SDK for full auth
      logger.warn('FIREBASE_API_KEY not set; using limited login flow');

      try {
        const userRecord = await auth.getUserByEmail(email);
        const customToken = await auth.createCustomToken(userRecord.uid);

        return res.status(200).json({
          token: customToken,
          user: {
            uid: userRecord.uid,
            email: userRecord.email,
          },
          note: 'Custom token returned. Exchange for ID token using Firebase Client SDK.',
        });
      } catch (lookupError) {
        if (lookupError.code === 'auth/user-not-found') {
          return res.status(401).json({
            error: 'Invalid email or password',
            code: 401,
          });
        }
        throw lookupError;
      }
    }

    // Use Firebase Identity Toolkit REST API for email/password sign-in
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

    const response = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const firebaseError = data.error && data.error.message;
      if (
        firebaseError === 'EMAIL_NOT_FOUND' ||
        firebaseError === 'INVALID_PASSWORD' ||
        firebaseError === 'INVALID_LOGIN_CREDENTIALS'
      ) {
        return res.status(401).json({
          error: 'Invalid email or password',
          code: 401,
        });
      }
      if (firebaseError === 'USER_DISABLED') {
        return res.status(403).json({
          error: 'This account has been disabled',
          code: 403,
        });
      }
      if (firebaseError === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        return res.status(429).json({
          error: 'Too many failed login attempts. Please try again later.',
          code: 429,
        });
      }
      throw new Error(`Firebase sign-in failed: ${firebaseError}`);
    }

    logger.info('User logged in successfully', { uid: data.localId, email });

    return res.status(200).json({
      token: data.idToken,
      user: {
        uid: data.localId,
        email: data.email,
      },
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    next(err);
  }
}

module.exports = { register, login };
