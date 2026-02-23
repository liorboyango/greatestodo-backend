/**
 * Auth Controller
 *
 * Handles user registration and login using Firebase Authentication.
 * Returns a Firebase ID token on success.
 *
 * All input validation is handled upstream by Joi middleware.
 * Firebase errors are mapped to user-friendly messages by the error handler.
 *
 * Registration flow:
 * 1. Check Firestore readiness (guard against NOT_FOUND / unavailable DB)
 * 2. Create user in Firebase Auth
 * 3. Write user profile to Firestore
 *    - If Firestore write fails, delete the Firebase Auth user to prevent
 *      orphaned accounts that would block re-registration attempts.
 * 4. Generate and return a Firebase ID token
 */

const axios = require('axios');
const { getAuth, getFirestore, ensureFirestoreReady } = require('../config/firebase');
const { createError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { createUser } = require('../models/userModel');

/**
 * POST /api/auth/register
 *
 * Creates a new Firebase user and stores their profile in Firestore.
 * Returns a Firebase ID token for immediate authentication.
 *
 * Firestore guard:
 * Before creating the Firebase Auth user, this handler checks that
 * Firestore is accessible. If Firestore is known to be unavailable
 * (e.g., database not created, wrong project, IAM permissions missing),
 * the request is rejected with a 503 Service Unavailable response
 * immediately — before any Firebase Auth user is created — to avoid
 * orphaned auth accounts.
 *
 * Cleanup on Firestore failure:
 * If the Firebase Auth user is created successfully but the subsequent
 * Firestore write fails, this handler attempts to delete the Firebase
 * Auth user so the client can retry registration without hitting an
 * "email already exists" error.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const register = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Log any existing auth token to verify no interference
    const authHeader = req.headers.authorization;
    if (authHeader) {
      logger.warn('[Register] Auth header present during registration', {
        email,
        hasAuthHeader: true,
        authHeaderPrefix: authHeader.substring(0, 20) + '...'
      });
    } else {
      logger.info('[Register] No auth header present during registration', { email });
    }

    // ── Step 1: Firestore readiness check ────────────────────────────────────
    // Verify Firestore is accessible before creating the Firebase Auth user.
    // This prevents orphaned auth accounts when Firestore is misconfigured.
    logger.info('[Register] Checking Firestore readiness before user creation', { email });
    try {
      await ensureFirestoreReady();
      logger.info('[Register] Firestore readiness check passed', { email });
    } catch (firestoreErr) {
      logger.error('[Register] Firestore readiness check failed — aborting registration', {
        email,
        error: firestoreErr.message,
        code: firestoreErr.code,
      });
      // Return a 503 with a clear message so the client knows to retry later
      return res.status(503).json({
        error: 'Registration is temporarily unavailable due to a database configuration issue. ' +
               'Please try again later or contact support if this persists.',
        code: 'FIRESTORE_UNAVAILABLE',
        retryable: true,
      });
    }

    const auth = getAuth();
    const db = getFirestore();

    // ── Step 2: Create user in Firebase Auth ──────────────────────────────────
    logger.info('[Register] Creating user in Firebase Auth', { email });
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password,
        emailVerified: false,
      });
    } catch (authErr) {
      logger.error('[Register] Firebase Auth user creation failed', {
        email,
        error: authErr.message,
        code: authErr.code,
      });
      throw authErr;
    }
    logger.info('[Register] Firebase Auth user created successfully', {
      uid: userRecord.uid,
      email,
    });

    const { uid } = userRecord;

    // ── Step 3: Write user profile to Firestore ───────────────────────────────
    // If this fails, clean up the Firebase Auth user to prevent orphaned accounts.
    logger.info('[Register] Storing user profile in Firestore', { uid, email });
    try {
      await createUser(db, uid, email);
      logger.info('[Register] User profile stored in Firestore', { uid, email });
    } catch (firestoreWriteErr) {
      logger.error('[Register] Firestore write failed after Auth user creation — attempting cleanup', {
        uid,
        email,
        error: firestoreWriteErr.message,
        code: firestoreWriteErr.code,
      });

      // Attempt to delete the Firebase Auth user to prevent orphaned accounts.
      // If cleanup fails, log the error but still propagate the original error.
      try {
        await auth.deleteUser(uid);
        logger.info('[Register] Firebase Auth user deleted during cleanup (Firestore write failed)', {
          uid,
          email,
        });
      } catch (cleanupErr) {
        logger.error(
          '[Register] CRITICAL: Failed to delete Firebase Auth user after Firestore write failure. ' +
          'The user account is now orphaned — the user cannot re-register with this email ' +
          'until the Auth account is manually deleted from the Firebase Console.',
          {
            uid,
            email,
            cleanupError: cleanupErr.message,
            cleanupCode: cleanupErr.code,
            originalError: firestoreWriteErr.message,
          }
        );
      }

      // Invalidate the Firestore readiness cache so the next request re-probes.
      // This ensures that if the failure was due to a transient issue, the next
      // registration attempt will re-check rather than assuming Firestore is ready.
      const { checkFirestoreReadiness } = require('../config/firebase');
      checkFirestoreReadiness().catch((probeErr) => {
        logger.warn('[Register] Background Firestore re-probe failed', {
          error: probeErr.message,
        });
      });

      // Propagate the Firestore error to the global error handler
      throw firestoreWriteErr;
    }

    // ── Step 4: Generate ID token ─────────────────────────────────────────────
    logger.info('[Register] Generating custom token for authentication', { uid, email });
    const customToken = await auth.createCustomToken(uid);
    const token = await signInWithCustomToken(customToken);
    logger.info('[Register] ID token generated successfully', { uid, email });

    return res.status(201).json({
      token,
      user: { uid, email },
    });
  } catch (err) {
    logger.error('[Register] Registration failed', {
      email: req.body.email,
      error: err.message,
      code: err.code,
      stack: err.stack
    });
    next(err);
  }
};

/**
 * POST /api/auth/login
 *
 * Authenticates an existing user via Firebase Auth REST API.
 * Returns a Firebase ID token on success.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const auth = getAuth();

    // Verify user exists in Firebase Auth
    const userRecord = await auth.getUserByEmail(email).catch(() => null);
    if (!userRecord) {
      return next(createError('Invalid email or password.', 401));
    }

    // Use Firebase REST API to sign in and get ID token
    const token = await signInWithEmailPassword(email, password);

    return res.status(200).json({
      token,
      user: { uid: userRecord.uid, email: userRecord.email },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Signs in a user via Firebase Auth REST API using email and password.
 * This is necessary because Firebase Admin SDK does not support
 * signing in with email/password directly.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>} Firebase ID token
 * @throws {AppError} On invalid credentials or API errors
 */
const signInWithEmailPassword = async (email, password) => {
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    throw createError(
      'Firebase API key is not configured. Please set FIREBASE_API_KEY environment variable.',
      500
    );
  }

  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        email,
        password,
        returnSecureToken: true,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    return response.data.idToken;
  } catch (err) {
    if (err.response) {
      const firebaseError = err.response.data?.error?.message || '';

      if (
        firebaseError.includes('INVALID_PASSWORD') ||
        firebaseError.includes('EMAIL_NOT_FOUND') ||
        firebaseError.includes('INVALID_LOGIN_CREDENTIALS') ||
        firebaseError.includes('INVALID_EMAIL')
      ) {
        throw createError('Invalid email or password.', 401);
      }

      if (firebaseError.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        throw createError(
          'Too many failed login attempts. Please try again later.',
          429
        );
      }

      if (firebaseError.includes('USER_DISABLED')) {
        throw createError('This account has been disabled.', 403);
      }
    }

    throw createError('Authentication failed. Please try again.', 500);
  }
};

/**
 * Signs in a user via Firebase Auth REST API using a custom token.
 * Exchanges a custom token for an ID token.
 *
 * @param {string} customToken
 * @returns {Promise<string>} Firebase ID token
 * @throws {AppError} On invalid token or API errors
 */
const signInWithCustomToken = async (customToken) => {
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    throw createError(
      'Firebase API key is not configured. Please set FIREBASE_API_KEY environment variable.',
      500
    );
  }

  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        token: customToken,
        returnSecureToken: true,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    return response.data.idToken;
  } catch (err) {
    logger.error('[SignInWithCustomToken] Authentication failed', {
      error: err.response?.data?.error?.message || err.message,
      stack: err.stack
    });
    throw createError('Authentication failed. Please try again.', 500);
  }
};

module.exports = { register, login };
