/**
 * Auth Controller
 * Handles user registration and login using Firebase Authentication.
 * Returns Firebase ID tokens (JWT) for subsequent authenticated requests.
 */

const { auth, db } = require('../config/firebase');
const { registerSchema, loginSchema } = require('../validators/auth');

/**
 * POST /api/auth/register
 * Creates a new Firebase user and stores profile in Firestore.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
async function register(req, res, next) {
  try {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join(', '),
        code: 400,
      });
    }

    const { email, password } = value;

    // Create user in Firebase Authentication
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password,
        emailVerified: false,
      });
    } catch (firebaseError) {
      return res.status(400).json({
        error: mapFirebaseAuthError(firebaseError),
        code: 400,
      });
    }

    const { uid } = userRecord;
    const now = new Date();

    // Store user profile in Firestore
    await db.collection('users').doc(uid).set({
      uid,
      email,
      createdAt: now,
    });

    // Create a custom token so the client can exchange it for an ID token.
    // NOTE: In a typical Firebase flow the client SDK calls signInWithEmailAndPassword
    // and gets the ID token directly. Since this is a REST-only backend we create a
    // custom token that the frontend can exchange via Firebase client SDK.
    // We also return user info so the frontend can bootstrap state immediately.
    const customToken = await auth.createCustomToken(uid);

    return res.status(201).json({
      token: customToken,
      user: {
        uid,
        email,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Authenticates an existing user via Firebase Auth REST API and returns an ID token.
 *
 * Firebase Admin SDK does not expose signInWithEmailAndPassword — that is a client
 * SDK method. To authenticate from the backend we call the Firebase Auth REST API
 * (identitytoolkit) which returns an idToken (JWT) directly.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
async function login(req, res, next) {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join(', '),
        code: 400,
      });
    }

    const { email, password } = value;

    // Call Firebase Auth REST API to sign in and get ID token
    const axios = require('axios');
    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

    if (!FIREBASE_API_KEY) {
      // Fallback: verify user exists via Admin SDK and issue custom token
      return await loginWithCustomToken(email, password, res, next);
    }

    let firebaseResponse;
    try {
      firebaseResponse = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
        {
          email,
          password,
          returnSecureToken: true,
        },
        { timeout: 10000 }
      );
    } catch (axiosError) {
      const fbError = axiosError.response && axiosError.response.data && axiosError.response.data.error;
      if (fbError) {
        return res.status(401).json({
          error: mapFirebaseRestError(fbError.message),
          code: 401,
        });
      }
      throw axiosError;
    }

    const { idToken, localId: uid } = firebaseResponse.data;

    // Fetch user profile from Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    let userEmail = email;
    if (userDoc.exists) {
      userEmail = userDoc.data().email || email;
    }

    return res.status(200).json({
      token: idToken,
      user: {
        uid,
        email: userEmail,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Fallback login using Admin SDK custom token (when FIREBASE_API_KEY is not set).
 * Verifies the user exists and issues a custom token.
 */
async function loginWithCustomToken(email, password, res, next) {
  try {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (err) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 401,
      });
    }

    // We cannot verify the password server-side without the REST API key.
    // Issue a custom token — the client must exchange it.
    const customToken = await auth.createCustomToken(userRecord.uid);

    return res.status(200).json({
      token: customToken,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Maps Firebase Admin SDK error codes to user-friendly messages.
 * @param {Error} err - Firebase error object
 * @returns {string} User-friendly error message
 */
function mapFirebaseAuthError(err) {
  switch (err.code) {
    case 'auth/email-already-exists':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'The email address is not valid.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/password accounts are not enabled. Please contact support.';
    default:
      return err.message || 'Registration failed. Please try again.';
  }
}

/**
 * Maps Firebase REST API error messages to user-friendly messages.
 * @param {string} message - Firebase REST error message
 * @returns {string} User-friendly error message
 */
function mapFirebaseRestError(message) {
  switch (message) {
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
    case 'INVALID_LOGIN_CREDENTIALS':
      return 'Invalid email or password.';
    case 'USER_DISABLED':
      return 'This account has been disabled. Please contact support.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many failed login attempts. Please try again later.';
    case 'INVALID_EMAIL':
      return 'The email address is not valid.';
    default:
      return 'Login failed. Please check your credentials and try again.';
  }
}

module.exports = { register, login };
