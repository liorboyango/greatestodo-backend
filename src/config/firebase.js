/**
 * Firebase Admin SDK Initialization
 *
 * Initializes the Firebase Admin SDK using a service account.
 * The service account credentials are loaded from the
 * FIREBASE_SERVICE_ACCOUNT_JSON environment variable (JSON string).
 *
 * Exports lazy getters for Auth and Firestore instances
 * to avoid initialization order issues.
 *
 * NOTE on gRPC NOT_FOUND errors:
 * The Firebase Admin SDK uses gRPC by default for Firestore transport.
 * In some environments (e.g., Render.com), gRPC connections can fail with
 * error code 5 (NOT_FOUND) even when the database exists. Setting
 * `preferRest: true` in Firestore settings forces the SDK to use the
 * REST API instead of gRPC, which resolves this class of errors.
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
  console.log(`[Firebase] Service account: ${serviceAccount.client_email}`);

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
 * Firestore settings:
 * - preferRest: true  — Use REST API instead of gRPC to avoid NOT_FOUND
 *   gRPC errors (error code 5) that occur in some cloud environments.
 *   gRPC requires specific network conditions that may not be met on
 *   platforms like Render.com.
 * - ignoreUndefinedProperties: true — Silently drop undefined fields
 *   instead of throwing errors, making document writes more robust.
 *
 * @returns {import('firebase-admin/firestore').Firestore}
 */
const getFirestore = () => {
  if (!_db) {
    initializeApp();
    _db = admin.firestore();

    // CRITICAL: Configure Firestore to use REST transport instead of gRPC.
    // The gRPC transport can produce NOT_FOUND (error code 5) errors in
    // environments where gRPC connectivity is restricted or the Firestore
    // database endpoint is not reachable via gRPC. REST is more universally
    // supported and avoids this class of errors entirely.
    _db.settings({
      preferRest: true,
      ignoreUndefinedProperties: true,
    });

    console.log('[Firebase] Firestore initialized with REST transport (preferRest: true)');
  }
  return _db;
};

/**
 * Verifies Firestore connectivity by performing a lightweight read operation.
 * Logs the result but does not throw — the server should still start even
 * if Firestore is temporarily unavailable.
 *
 * @returns {Promise<boolean>} true if Firestore is reachable, false otherwise
 */
const verifyFirestoreConnection = async () => {
  try {
    const db = getFirestore();
    // Attempt a lightweight read to verify connectivity
    // Using a non-existent document path to avoid side effects
    const testRef = db.collection('_health').doc('connectivity-check');
    await testRef.get();
    console.log('[Firebase] Firestore connectivity verified successfully');
    return true;
  } catch (err) {
    const grpcCode = err.code;
    console.error('[Firebase] Firestore connectivity check failed:', {
      message: err.message,
      code: grpcCode,
      details: err.details || 'none',
    });

    if (grpcCode === 5 || (err.message && err.message.includes('NOT_FOUND'))) {
      console.error(
        '[Firebase] NOT_FOUND error during connectivity check. ' +
        'This usually means the Firestore database has not been created yet. ' +
        'Please go to the Firebase Console and create a Firestore database ' +
        'for your project. Select "(default)" database in Native mode.'
      );
    }

    return false;
  }
};

// Initialize on module load to catch configuration errors early
try {
  initializeApp();
} catch (err) {
  console.error('[Firebase] Initialization failed:', err.message);
  // Don't exit here — let the server start and fail gracefully on first request
  // This allows health checks to still work
}

module.exports = { getAuth, getFirestore, initializeApp, verifyFirestoreConnection };
