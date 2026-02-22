/**
 * Auth Controller
 *
 * Handles user registration and login using Firebase Authentication.
 * Returns a Firebase ID token on success.
 *
 * All input validation is handled upstream by Joi middleware.
 * Firebase errors are mapped to user-friendly messages by the error handler.
 */

const axios = require('axios');
const { getAuth } = require('../config/firebase');
const { getFirestore } = require('../config/firebase');
const { createError } = require('../middleware/errorHandler');

/**
 * POST /api/auth/register
 *
 * Creates a new Firebase user and stores their profile in Firestore.
 * Returns a Firebase ID token for immediate authentication.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const register = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const auth = getAuth();
    const db = getFirestore();

    console.log('[Register] Creating user in Firebase Auth');
    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      emailVerified: false,
    });
    console.log('[Register] User created successfully:', userRecord.uid);

    const { uid } = userRecord;
    const now = new Date();

    console.log('[Register] Storing user profile in Firestore');
    // Store user profile in Firestore
    await db.collection('users').doc(uid).set({
      uid,
      email,
      createdAt: now,
    });
    console.log('[Register] User profile stored');

    console.log('[Register] Generating custom token for authentication');
    // Generate custom token and exchange for ID token
    const customToken = await auth.createCustomToken(uid);
    const token = await signInWithCustomToken(customToken);
    console.log('[Register] ID token generated successfully');

    return res.status(201).json({
      token,
      user: { uid, email },
    });
  } catch (err) {
    console.error('[Register] Error during registration:', err.message, err.code);
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
    console.error('[SignInWithCustomToken] Error:', err.response?.data?.error?.message || err.message);
    throw createError('Authentication failed. Please try again.', 500);
  }
};

module.exports = { register, login };