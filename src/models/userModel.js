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
 * gRPC error codes that indicate a transient (retryable) Firestore failure.
 *
 * - 14 (UNAVAILABLE): Transient network or service outage — safe to retry
 *
 * NOT retried:
 * - 5  (NOT_FOUND): Database does not exist — retrying won't help
 * - 7  (PERMISSION_DENIED): IAM issue — retrying won't help
 * - 16 (UNAUTHENTICATED): Bad credentials — retrying won't help
 */
const RETRYABLE_GRPC_CODES = new Set([14]);

/**
 * Maximum number of retry attempts for transient Firestore errors.
 */
const MAX_WRITE_RETRIES = 2;

/**
 * Base delay (ms) for exponential backoff between retries.
 */
const RETRY_BASE_DELAY_MS = 500;

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
 * Sleeps for the given number of milliseconds.
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines whether a Firestore error is safe to retry.
 *
 * Only UNAVAILABLE (gRPC code 14) errors are retried. Errors that indicate
 * a permanent configuration problem (NOT_FOUND, PERMISSION_DENIED,
 * UNAUTHENTICATED) are not retried because retrying will not help.
 *
 * @param {Error} err - The Firestore error
 * @returns {boolean}
 */
function isRetryableFirestoreError(err) {
  return RETRYABLE_GRPC_CODES.has(err.code) ||
    (err.message && err.message.includes('UNAVAILABLE'));
}

/**
 * Creates a user document in Firestore with retry logic for transient errors.
 *
 * This function writes a user profile document to the 'users' collection
 * using the Firebase Auth UID as the document ID.
 *
 * Retry behaviour:
 * - UNAVAILABLE (gRPC code 14) errors are retried up to MAX_WRITE_RETRIES
 *   times with exponential backoff (500ms, 1000ms, ...).
 * - All other errors (NOT_FOUND, PERMISSION_DENIED, UNAUTHENTICATED, etc.)
 *   are NOT retried because they indicate a permanent configuration issue
 *   that retrying will not resolve.
 *
 * Error handling:
 * - gRPC NOT_FOUND (code 5): Indicates the Firestore database does not exist
 *   or is not accessible. This is a configuration/infrastructure issue, not
 *   a data issue. The error is re-thrown with a descriptive message.
 * - UNAVAILABLE (code 14): Transient error — retried with backoff.
 * - Other errors: Re-thrown as-is for the caller to handle.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} uid - Firebase Auth UID
 * @param {string} email - User email
 * @param {string} [displayName] - Optional display name
 * @returns {Promise<Object>} Created user data (uid, email, displayName)
 * @throws {Error} If Firestore write fails after all retries
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

  let lastErr;
  for (let attempt = 0; attempt <= MAX_WRITE_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn('[UserModel] Retrying Firestore write after transient error', {
        uid,
        email: userDoc.email,
        attempt,
        maxRetries: MAX_WRITE_RETRIES,
        delayMs,
        lastError: lastErr ? lastErr.message : 'unknown',
      });
      await sleep(delayMs);
    }

    try {
      await docRef.set(userDoc);

      if (attempt > 0) {
        logger.info('[UserModel] Firestore write succeeded after retry', {
          uid,
          email: userDoc.email,
          attempt,
        });
      } else {
        logger.info('[UserModel] User document written successfully', {
          uid,
          email: userDoc.email,
          documentPath: `users/${uid}`,
        });
      }

      return {
        uid,
        email: userDoc.email,
        displayName: userDoc.displayName || null,
      };
    } catch (err) {
      lastErr = err;

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

        // NOT_FOUND is not retryable — re-throw immediately with a descriptive message
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

      // Check if this error is retryable
      if (isRetryableFirestoreError(err) && attempt < MAX_WRITE_RETRIES) {
        logger.warn('[UserModel] Transient Firestore error — will retry', {
          uid,
          email: userDoc.email,
          errorCode: err.code,
          errorMessage: err.message,
          attempt,
          remainingRetries: MAX_WRITE_RETRIES - attempt,
        });
        // Continue to next iteration (retry)
        continue;
      }

      // Non-retryable error or max retries exhausted
      if (attempt >= MAX_WRITE_RETRIES && isRetryableFirestoreError(err)) {
        logger.error('[UserModel] Firestore write failed after all retries', {
          uid,
          email: userDoc.email,
          errorCode: err.code,
          errorMessage: err.message,
          totalAttempts: attempt + 1,
        });
      } else {
        logger.error('[UserModel] Failed to write user document to Firestore', {
          uid,
          email: userDoc.email,
          errorCode: err.code,
          errorMessage: err.message,
        });
      }

      throw err;
    }
  }

  // Should not reach here, but guard defensively
  throw lastErr || new Error('Firestore write failed after all retries');
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
