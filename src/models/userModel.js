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
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - Firebase Auth UID
 * @param {string} email - User email
 * @param {string} [displayName] - Optional display name
 * @returns {Promise<Object>} Created user data (uid, email, displayName)
 */
async function createUser(db, uid, email, displayName = null) {
  const userDoc = createUserDocument(uid, email, displayName);
  const docRef = getUserRef(db, uid);

  await docRef.set(userDoc);

  return {
    uid,
    email: userDoc.email,
    displayName: userDoc.displayName || null,
  };
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
