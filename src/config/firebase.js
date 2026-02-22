/**
 * Firebase Admin SDK Initialization
 *
 * Initializes the Firebase Admin SDK using the service account credentials
 * provided via the FIREBASE_SERVICE_ACCOUNT_JSON environment variable.
 *
 * Exports:
 *   - admin        : Firebase Admin SDK instance
 *   - getFirestore : Function returning the Firestore database instance
 *   - getAuth      : Function returning the Firebase Auth instance
 *   - FieldValue   : Firestore FieldValue helper (serverTimestamp, arrayUnion, etc.)
 *   - Timestamp    : Firestore Timestamp class
 */

const admin = require('firebase-admin');

let initialized = false;

/**
 * Initialize Firebase Admin SDK.
 * Safe to call multiple times — only initializes once.
 */
function initializeFirebase() {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
      'Please provide the Firebase service account credentials as a JSON string.'
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (parseError) {
    throw new Error(
      'Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. ' +
      'Ensure it is a valid JSON string. Error: ' + parseError.message
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  initialized = true;
  console.log('[Firebase] Admin SDK initialized successfully.');
}

// Initialize on module load
initializeFirebase();

/**
 * Get the Firestore database instance.
 * @returns {FirebaseFirestore.Firestore}
 */
function getFirestore() {
  return admin.firestore();
}

/**
 * Get the Firebase Auth instance.
 * @returns {admin.auth.Auth}
 */
function getAuth() {
  return admin.auth();
}

const { FieldValue, Timestamp } = admin.firestore;

module.exports = {
  admin,
  getFirestore,
  getAuth,
  FieldValue,
  Timestamp,
};
