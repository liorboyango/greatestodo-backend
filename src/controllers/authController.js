/**
 * Auth Controller
 * Handles user registration and login using Firebase Authentication.
 */

const { auth, db } = require('../config/firebase');
const { Timestamp } = require('firebase-admin/firestore');

/**
 * POST /api/auth/register
 * Creates a new Firebase user and stores their profile in Firestore.
 *
 * @param {import('express').Request} req - { email, password }
 * @param {import('express').Response} res - { token, user: { uid, email } }
 */
async function register(req, res) {
  try {
    const { email, password } = req.body;

    // Create the user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      emailVerified: false,
    });

    // Store user profile in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: userRecord.email,
      createdAt: Timestamp.now(),
    });

    // Create a custom token for the client to exchange for an ID token
    const customToken = await auth.createCustomToken(userRecord.uid);

    return res.status(201).json({
      token: customToken,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
      },
    });
  } catch (error) {
    console.error('register error:', error);

    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email is already registered', code: 400 });
    }

    if (error.code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Invalid email address', code: 400 });
    }

    if (error.code === 'auth/weak-password') {
      return res.status(400).json({ error: 'Password is too weak', code: 400 });
    }

    return res.status(500).json({ error: 'Registration failed', code: 500 });
  }
}

/**
 * POST /api/auth/login
 * Verifies user credentials and returns a custom token.
 * Note: Firebase Admin SDK does not support signInWithEmailAndPassword directly.
 * The client must use the Firebase Client SDK to sign in and obtain an ID token,
 * then pass it to protected endpoints. This endpoint validates credentials via
 * the Admin SDK's getUserByEmail + a workaround using the REST API.
 *
 * @param {import('express').Request} req - { email, password }
 * @param {import('express').Response} res - { token, user: { uid, email } }
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Use Firebase REST API to verify credentials
    const fetch = require('node-fetch');
    const apiKey = process.env.FIREBASE_API_KEY;

    if (!apiKey) {
      console.error('FIREBASE_API_KEY is not set');
      return res.status(500).json({ error: 'Server configuration error', code: 500 });
    }

    const firebaseAuthUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const response = await fetch(firebaseAuthUrl, {
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
        return res.status(401).json({ error: 'Invalid email or password', code: 401 });
      }

      if (firebaseError === 'USER_DISABLED') {
        return res.status(403).json({ error: 'Account has been disabled', code: 403 });
      }

      if (firebaseError && firebaseError.startsWith('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        return res.status(429).json({
          error: 'Too many failed login attempts. Please try again later.',
          code: 429,
        });
      }

      return res.status(401).json({ error: 'Authentication failed', code: 401 });
    }

    // Fetch user profile from Firestore
    const userDoc = await db.collection('users').doc(data.localId).get();
    const userProfile = userDoc.exists ? userDoc.data() : {};

    return res.status(200).json({
      token: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      user: {
        uid: data.localId,
        email: data.email,
        ...userProfile,
      },
    });
  } catch (error) {
    console.error('login error:', error);
    return res.status(500).json({ error: 'Login failed', code: 500 });
  }
}

module.exports = { register, login };
