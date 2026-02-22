/**
 * Firestore Initialization Script
 *
 * Initializes the Firestore database structure for GreatesTODO.
 * Creates schema documentation and verifies connectivity.
 *
 * Usage:
 *   node src/scripts/initFirestore.js
 *
 * Required environment variables:
 *   FIREBASE_SERVICE_ACCOUNT_JSON - Firebase service account JSON string
 */

'use strict';

require('dotenv').config();
const admin = require('firebase-admin');

// ---------------------------------------------------------------------------
// Firebase Admin initialization
// ---------------------------------------------------------------------------
if (!admin.apps.length) {
  let serviceAccount;

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is required.');
    process.exit(1);
  }

  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    console.error('ERROR: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Schema documentation
// ---------------------------------------------------------------------------

/**
 * Creates the _schema collection with human-readable schema documentation.
 * This is a convention to self-document the Firestore structure.
 */
async function createSchemaDocumentation() {
  console.log('Writing schema documentation to _schema collection...');

  const schemaRef = db.collection('_schema');

  await schemaRef.doc('users').set({
    description: 'User profile documents. Document ID equals the Firebase Auth UID.',
    collectionPath: 'users/{uid}',
    fields: {
      uid: 'string — Firebase Auth UID (document ID)',
      email: 'string — User email address (lowercase)',
      displayName: 'string? — Optional display name',
      createdAt: 'timestamp — Account creation time (server timestamp)',
      updatedAt: 'timestamp — Last profile update time (server timestamp)',
    },
    securityNote: 'Users can only read/write their own document (request.auth.uid == uid).',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await schemaRef.doc('todos').set({
    description: 'Todo items stored as a subcollection under each user document.',
    collectionPath: 'users/{uid}/todos/{todoId}',
    fields: {
      title: 'string — Required, max 200 chars',
      description: 'string — Optional, max 1000 chars',
      dueDate: 'timestamp | null — Optional due date',
      priority: "string — 'low' | 'medium' | 'high' (default: 'medium')",
      category: 'string — Optional category label, max 50 chars',
      status: "string — 'pending' | 'completed' (default: 'pending')",
      createdAt: 'timestamp — Creation time (server timestamp)',
      updatedAt: 'timestamp — Last update time (server timestamp)',
    },
    indexes: [
      'status ASC + createdAt DESC',
      'status ASC + priority ASC + createdAt DESC',
      'status ASC + dueDate ASC',
      'status ASC + category ASC + createdAt DESC',
      'priority ASC + dueDate ASC',
      'priority ASC + createdAt DESC',
      'category ASC + createdAt DESC',
      'dueDate ASC + createdAt DESC',
      'status ASC + priority ASC + dueDate ASC',
      'status ASC + category ASC + priority ASC + createdAt DESC',
    ],
    securityNote: 'Users can only read/write todos in their own subcollection (request.auth.uid == uid).',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('Schema documentation written.');
}

/**
 * Verifies Firestore connectivity by writing and reading a health-check document.
 */
async function verifyConnection() {
  console.log('Verifying Firestore connection...');

  const healthRef = db.collection('_health').doc('ping');
  await healthRef.set({
    status: 'ok',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  const doc = await healthRef.get();
  if (!doc.exists || doc.data().status !== 'ok') {
    throw new Error('Health check document could not be verified.');
  }

  console.log('Firestore connection verified.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== GreatesTODO — Firestore Initialization ===\n');

  try {
    await verifyConnection();
    await createSchemaDocumentation();

    console.log('\n=== Initialization Complete ===');
    console.log('\nFirestore collection structure:');
    console.log('  /users/{uid}              — User profiles');
    console.log('  /users/{uid}/todos/{id}   — Todo items (subcollection)');
    console.log('  /_schema/                 — Schema documentation (internal)');
    console.log('  /_health/                 — Health check (internal)');
    console.log('\nNext steps:');
    console.log('  1. Deploy security rules : firebase deploy --only firestore:rules');
    console.log('  2. Deploy indexes        : firebase deploy --only firestore:indexes');
    console.log('  3. Start the server      : npm start');
  } catch (err) {
    console.error('\nInitialization failed:', err.message);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

main();
