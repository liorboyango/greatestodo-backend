/**
 * Firebase Admin SDK Initialization
 * Initializes the Firebase Admin SDK using the service account credentials
 * stored in the FIREBASE_SERVICE_ACCOUNT_JSON environment variable.
 */

const admin = require('firebase-admin');

let db;
let auth;

if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
          'Please provide the Firebase service account JSON as an environment variable.'
      );
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error.message);
    process.exit(1);
  }
}

db = admin.firestore();
auth = admin.auth();

// Configure Firestore settings
db.settings({ ignoreUndefinedProperties: true });

module.exports = { db, auth, admin };
