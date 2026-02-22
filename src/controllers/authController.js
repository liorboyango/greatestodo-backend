/**
 * Auth Controller
 *
 * Handles user registration and login using Firebase Authentication.
 * Passwords are managed by Firebase Auth (bcrypt-equivalent hashing internally).
 * Returns Firebase ID tokens for subsequent authenticated API calls.
 *
 * Endpoints:
 *   POST /api/auth/register  - Register a new user
 *   POST /api/auth/login     - Login an existing user
 */

const axios = require('axios');
const { getAuth, getFirestore, FieldValue } = require('../config/firebase');
const { registerSchema, loginSchema } = require('../validators/auth');

// Firebase REST API base URL for client-side auth operations
const FIREBASE_AUTH_REST_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';

/**
 * Get the Firebase Web API key from environment variables.
 * Required for Firebase REST API calls (signIn, signUp).
 */
function getFirebaseApiKey() {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    throw new Error('FIREBASE_WEB_API_KEY environment variable is not set.');
  }
  return apiKey;
}

/**
 * POST /api/auth/register
 *
 * Register a new user with email and password.
 * Creates a Firebase Auth user and a corresponding Firestore user document.
 *
 * Request Body:
 *   - email    {string} Valid email address
 *   - password {string} Min 8 characters
 *
 * Response: 201 { token, user: { uid, email, createdAt } }
 */
async function register(req, res) {
  try {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

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
      userRecord = await getAuth().createUser({
        email,
        password,
        emailVerified: false,
      });
    } catch (firebaseError) {
      if (firebaseError.code === 'auth/email-already-exists') {
        return res.status(400).json({
          error: 'An account with this email already exists.',
          code: 400,
        });
      }
      if (firebaseError.code === 'auth/invalid-email') {
        return res.status(400).json({
          error: 'Invalid email address.',
          code: 400,
        });
      }
      if (firebaseError.code === 'auth/weak-password') {
        return res.status(400).json({
          error: 'Password is too weak. Please choose a stronger password.',
          code: 400,
        });
      }
      throw firebaseError;
    }

    // Create user document in Firestore
    const db = getFirestore();
    const userDoc = {
      uid: userRecord.uid,
      email: userRecord.email,
      createdAt: FieldValue.serverTimestamp(),
    };
    await db.collection('users').doc(userRecord.uid).set(userDoc);

    // Sign in via Firebase REST API to get an ID token
    const apiKey = getFirebaseApiKey();
    const signInResponse = await axios.post(
      `${FIREBASE_AUTH_REST_URL}:signInWithPassword?key=${apiKey}`,
      { email, password, returnSecureToken: true }
    );

    const { idToken } = signInResponse.data;

    return res.status(201).json({
      token: idToken,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
      },
    });
  } catch (err) {
    console.error('[authController.register] Error:', err);
    return res.status(500).json({ error: 'Internal server error', code: 500 });
  }
}

/**
 * POST /api/auth/login
 *
 * Authenticate an existing user with email and password.
 * Returns a Firebase ID token for subsequent API calls.
 *
 * Request Body:
 *   - email    {string} Registered email address
 *   - password {string} Account password
 *
 * Response: 200 { token, user: { uid, email } }
 */
async function login(req, res) {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join('; '),
        code: 400,
      });
    }

    const { email, password } = value;
    const apiKey = getFirebaseApiKey();

    // Sign in via Firebase REST API
    let signInData;
    try {
      const response = await axios.post(
        `${FIREBASE_AUTH_REST_URL}:signInWithPassword?key=${apiKey}`,
        { email, password, returnSecureToken: true }
      );
      signInData = response.data;
    } catch (axiosError) {
      const firebaseErrorCode =
        axiosError.response?.data?.error?.message || '';

      if (
        firebaseErrorCode === 'EMAIL_NOT_FOUND' ||
        firebaseErrorCode === 'INVALID_PASSWORD' ||
        firebaseErrorCode === 'INVALID_LOGIN_CREDENTIALS'
      ) {
        return res.status(401).json({
          error: 'Invalid email or password.',
          code: 401,
        });
      }

      if (firebaseErrorCode === 'USER_DISABLED') {
        return res.status(401).json({
          error: 'This account has been disabled.',
          code: 401,
        });
      }

      if (firebaseErrorCode === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        return res.status(429).json({
          error: 'Too many failed login attempts. Please try again later.',
          code: 429,
        });
      }

      throw axiosError;
    }

    const { idToken, localId: uid } = signInData;

    return res.status(200).json({
      token: idToken,
      user: { uid, email },
    });
  } catch (err) {
    console.error('[authController.login] Error:', err);
    return res.status(500).json({ error: 'Internal server error', code: 500 });
  }
}

module.exports = { register, login };
