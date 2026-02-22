/**
 * Firebase Admin SDK Configuration
 *
 * Initializes Firebase Admin SDK using the service account credentials
 * provided via the FIREBASE_SERVICE_ACCOUNT_JSON environment variable.
 *
 * This module exports:
 * - admin: The initialized Firebase Admin instance
 * - db: Firestore database instance
 * - auth: Firebase Auth instance
 */

const admin = require('firebase-admin');
const logger = require('../utils/logger');

/**
 * Initialize Firebase Admin SDK
 * Uses FIREBASE_SERVICE_ACCOUNT_JSON environment variable for credentials
 */
function initializeFirebase() {
  // Prevent re-initialization if already initialized
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is required. ' +
      'Set it to the JSON string of your Firebase service account key.'
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

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    logger.info('Firebase Admin SDK initialized successfully', {
      projectId: serviceAccount.project_id,
    });

    return admin.app();
  } catch (initError) {
    throw new Error(
      'Failed to initialize Firebase Admin SDK: ' + initError.message
    );
  }
}

// Initialize Firebase on module load
initializeFirebase();

/** @type {admin.firestore.Firestore} Firestore database instance */
const db = admin.firestore();

/** @type {admin.auth.Auth} Firebase Auth instance */
const auth = admin.auth();

// Configure Firestore settings
db.settings({
  ignoreUndefinedProperties: true,
});

module.exports = { admin, db, auth };
