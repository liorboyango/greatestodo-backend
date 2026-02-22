/**
 * Firebase Admin SDK Initialization
 *
 * Initializes the Firebase Admin SDK using a service account.
 * The service account credentials are loaded from the
 * FIREBASE_SERVICE_ACCOUNT_JSON environment variable (JSON string).
 *
 * Exports lazy getters for Auth and Firestore instances
 * to avoid initialization order issues.
 */

const admin = require('firebase-admin');

let _app = null;
let _auth = null;
let _db = null;

/**
 * Initializes the Firebase Admin app (singleton).
 * Called automatically on first use.
 *
 * @returns {import('firebase-admin').app.App}
 */
const initializeApp = () => {
  if (_app) return _app;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
      'Please configure your Firebase service account credentials.'
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (parseErr) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. ' +
      'Please ensure the environment variable contains a valid JSON string.'
    );
  }

  // Validate required service account fields
  const requiredFields = ['project_id', 'private_key', 'client_email'];
  for (const field of requiredFields) {
    if (!serviceAccount[field]) {
      throw new Error(
        `Service account JSON is missing required field: '${field}'. ` +
        'Please check your FIREBASE_SERVICE_ACCOUNT_JSON configuration.'
      );
    }
  }

  _app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  console.log(`[Firebase] Initialized for project: ${serviceAccount.project_id}`);

  return _app;
};

/**
 * Returns the Firebase Auth instance.
 * Initializes the app if not already done.
 *
 * @returns {import('firebase-admin/auth').Auth}
 */
const getAuth = () => {
  if (!_auth) {
    initializeApp();
    _auth = admin.auth();
  }
  return _auth;
};

/**
 * Returns the Firestore instance.
 * Initializes the app if not already done.
 *
 * @returns {import('firebase-admin/firestore').Firestore}
 */
const getFirestore = () => {
  if (!_db) {
    initializeApp();
    _db = admin.firestore();
  }
  return _db;
};

// Initialize on module load to catch configuration errors early
try {
  initializeApp();
} catch (err) {
  console.error('[Firebase] Initialization failed:', err.message);
  // Don't exit here — let the server start and fail gracefully on first request
  // This allows health checks to still work
}

module.exports = { getAuth, getFirestore, initializeApp };
