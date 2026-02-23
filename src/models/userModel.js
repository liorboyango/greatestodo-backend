/**
 * User Model
 *
 * Defines the data structure and helper functions for user documents in Firestore.
 * Collection path: users/{uid}
 *
 * Schema:
 *   uid:         string    - Firebase Auth UID (document ID)
 *   email:       string    - User email address
 *   displayName: string?   - Optional display name
 *   createdAt:   timestamp - Account creation timestamp
 *   updatedAt:   timestamp - Last profile update timestamp
 */

'use strict';

const admin = require('firebase-admin');
const logger = require('../utils/logger');

/**
 * User document schema definition (for documentation and reference).
 */
const USER_SCHEMA = {
  uid: { type: 'string', required: true, description: 'Firebase Auth UID (document ID)' },
  email: { type: 'string', required: true, description: 'User email address' },
  displayName: { type: 'string', required: false, description: 'Optional display name' },
  createdAt: { type: 'timestamp', required: true, description: 'Account creation timestamp' },
  updatedAt: { type: 'timestamp', required: false, description: 'Last profile update timestamp' },
};

/**
 * Creates a new user document object ready for Firestore insertion.
 *
 * @param {string} uid - Firebase Auth UID
 * @param {string} email - User email address
 * @param {string} [displayName] - Optional display name
 * @returns {Object} User document object
 */
function createUserDocument(uid, email, displayName = null) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const doc = {
    uid,
    email: email.toLowerCase().trim(),
    createdAt: now,
    updatedAt: now,
  };

  if (displayName) {
    doc.displayName = displayName.trim();
  }

  return doc;
}

/**
 * Formats a Firestore user document for API response.
 * Strips internal fields and converts Firestore Timestamps to ISO strings.
 *
 * @param {string} uid - User UID
 * @param {Object} data - Firestore document data
 * @returns {Object} Formatted user object for API response
 */
function formatUserResponse(uid, data) {
  return {
    uid,
    email: data.email,
    displayName: data.displayName || null,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
  };
}

/**
 * Gets the Firestore DocumentReference for a user document.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @returns {FirebaseFirestore.DocumentReference}
 */
function getUserRef(db, uid) {
  return db.collection('users').doc(uid);
}

/**
 * Retrieves a user document from Firestore by UID.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @returns {Promise<Object|null>} Formatted user data or null if not found
 */
async function getUserById(db, uid) {
  const docRef = getUserRef(db, uid);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  return formatUserResponse(uid, doc.data());
}

/**
 * Creates a user document in Firestore.
 *
 * This function writes a user profile document to the 'users' collection
 * using the Firebase Auth UID as the document ID.
 *
 * Error handling:
 * - gRPC NOT_FOUND (code 5): Indicates the Firestore database does not exist
 *   or is not accessible. This is a configuration/infrastructure issue, not
 *   a data issue. The error is re-thrown with a descriptive message.
 * - Other errors: Re-thrown as-is for the caller to handle.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - Firebase Auth UID
 * @param {string} email - User email
 * @param {string} [displayName] - Optional display name
 * @returns {Promise<Object>} Created user data (uid, email, displayName)
 * @throws {Error} If Firestore write fails
 */
async function createUser(db, uid, email, displayName = null) {
  const userDoc = createUserDocument(uid, email, displayName);
  const docRef = getUserRef(db, uid);

  logger.info('[UserModel] Writing user document to Firestore', {
    uid,
    email: userDoc.email,
    collection: 'users',
    documentPath: `users/${uid}`,
  });

  try {
    await docRef.set(userDoc);

    logger.info('[UserModel] User document written successfully', {
      uid,
      email: userDoc.email,
      documentPath: `users/${uid}`,
    });

    return {
      uid,
      email: userDoc.email,
      displayName: userDoc.displayName || null,
    };
  } catch (err) {
    // Diagnose gRPC NOT_FOUND errors specifically
    // Error code 5 is the gRPC status code for NOT_FOUND
    const isGrpcNotFound = err.code === 5 ||
      (err.message && err.message.includes('NOT_FOUND'));

    if (isGrpcNotFound) {
      logger.error('[UserModel] Firestore NOT_FOUND error during user document creation', {
        uid,
        email: userDoc.email,
        errorCode: err.code,
        errorMessage: err.message,
        diagnosis: [
          'The Firestore (default) database may not exist in this Firebase project.',
          'Verify the database is created in Firebase Console > Firestore Database.',
          'Ensure the service account has the "Cloud Datastore User" or "Firebase Admin" role.',
          'Check that the project_id in FIREBASE_SERVICE_ACCOUNT_JSON matches the Firebase project.',
          'The preferRest setting should bypass gRPC issues — if this error persists, check IAM permissions.',
        ].join(' | '),
      });

      // Re-throw with a more descriptive message
      const enhancedError = new Error(
        `Firestore database not found or not accessible for project. ` +
        `Original error: ${err.message}. ` +
        `Please ensure the Firestore (default) database exists in the Firebase Console ` +
        `and the service account has the required permissions.`
      );
      enhancedError.code = err.code;
      enhancedError.originalError = err;
      throw enhancedError;
    }

    logger.error('[UserModel] Failed to write user document to Firestore', {
      uid,
      email: userDoc.email,
      errorCode: err.code,
      errorMessage: err.message,
    });

    throw err;
  }
}

/**
 * Updates a user document in Firestore.
 * Automatically sets updatedAt to the server timestamp.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - User UID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
async function updateUser(db, uid, updates) {
  const docRef = getUserRef(db, uid);
  await docRef.update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = {
  USER_SCHEMA,
  createUserDocument,
  formatUserResponse,
  getUserRef,
  getUserById,
  createUser,
  updateUser,
};
