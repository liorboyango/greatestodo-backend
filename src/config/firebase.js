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
 *
 * NOTE on private_key format:
 * When storing the service account JSON in an environment variable, the
 * private_key field may have literal '\\n' sequences instead of actual
 * newline characters. This module automatically normalizes the private_key
 * to ensure proper PEM format before initializing the SDK.
 */

'use strict';

const admin = require('firebase-admin');

let _app = null;
let _auth = null;
let _db = null;
let _initializationError = null;
let _serviceAccountInfo = null;

/**
 * Normalizes the private_key field in a service account object.
 *
 * When a service account JSON is stored as an environment variable string,
 * the private key's newline characters may be stored as literal '\\n'
 * escape sequences rather than actual newline characters (\n). This causes
 * the Firebase Admin SDK to fail with cryptic authentication errors.
 *
 * This function replaces all literal '\\n' sequences with actual newlines.
 *
 * @param {Object} serviceAccount - Parsed service account object
 * @returns {Object} Service account with normalized private_key
 */
function normalizeServiceAccount(serviceAccount) {
  const normalized = { ...serviceAccount };

  if (normalized.private_key && typeof normalized.private_key === 'string') {
    // Replace literal \n sequences with actual newlines
    // This handles the common case where env vars store escaped newlines
    normalized.private_key = normalized.private_key.replace(/\\n/g, '\n');
  }

  return normalized;
}

/**
 * Validates the structure and format of a service account object.
 *
 * Checks:
 * - Required fields are present and non-empty
 * - private_key is in valid PEM format (starts/ends with correct headers)
 * - client_email matches expected Firebase service account format
 * - project_id is a non-empty string
 *
 * @param {Object} serviceAccount - Parsed (and normalized) service account object
 * @throws {Error} If any validation check fails
 */
function validateServiceAccount(serviceAccount) {
  // Check required fields
  const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
  for (const field of requiredFields) {
    if (!serviceAccount[field]) {
      throw new Error(
        `Service account JSON is missing required field: '${field}'. ` +
        'Please check your FIREBASE_SERVICE_ACCOUNT_JSON configuration.'
      );
    }
  }

  // Validate type field
  if (serviceAccount.type !== 'service_account') {
    throw new Error(
      `Service account JSON has invalid 'type' field: '${serviceAccount.type}'. ` +
      "Expected 'service_account'. Please use a Firebase service account JSON file."
    );
  }

  // Validate private_key PEM format
  const privateKey = serviceAccount.private_key;
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error(
      "Service account private_key does not contain '-----BEGIN PRIVATE KEY-----'. " +
      'The private key may be malformed or incorrectly escaped in the environment variable. ' +
      'Ensure newlines in the private_key are actual newline characters (\\n), not literal backslash-n.'
    );
  }
  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error(
      "Service account private_key does not contain '-----END PRIVATE KEY-----'. " +
      'The private key appears to be truncated or malformed.'
    );
  }

  // Validate client_email format (should be a service account email)
  const emailRegex = /^[^@]+@[^@]+\.iam\.gserviceaccount\.com$/;
  if (!emailRegex.test(serviceAccount.client_email)) {
    throw new Error(
      `Service account client_email '${serviceAccount.client_email}' does not match ` +
      'the expected format: <name>@<project>.iam.gserviceaccount.com. ' +
      'Please ensure you are using a Firebase service account, not a user account.'
    );
  }

  // Validate project_id is a non-empty string
  if (typeof serviceAccount.project_id !== 'string' || serviceAccount.project_id.trim() === '') {
    throw new Error(
      'Service account project_id must be a non-empty string. ' +
      'Please check your FIREBASE_SERVICE_ACCOUNT_JSON configuration.'
    );
  }
}

/**
 * Parses and validates the FIREBASE_SERVICE_ACCOUNT_JSON environment variable.
 *
 * @returns {Object} Validated and normalized service account object
 * @throws {Error} If the env var is missing, not valid JSON, or fails validation
 */
function parseServiceAccountFromEnv() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
      'Please configure your Firebase service account credentials. ' +
      'Generate a service account key from: Firebase Console > Project Settings > Service Accounts > Generate new private key'
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (parseErr) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. ' +
      'Please ensure the environment variable contains a valid JSON string. ' +
      `JSON parse error: ${parseErr.message}`
    );
  }

  // Normalize private_key newlines before validation
  const normalized = normalizeServiceAccount(serviceAccount);

  // Validate the normalized service account
  validateServiceAccount(normalized);

  return normalized;
}

/**
 * Initializes the Firebase Admin app (singleton).
 * Called automatically on first use.
 *
 * @returns {import('firebase-admin').app.App}
 * @throws {Error} If initialization fails
 */
const initializeApp = () => {
  if (_app) return _app;

  // If a previous initialization attempt failed, re-throw the error
  if (_initializationError) {
    throw _initializationError;
  }

  const serviceAccount = parseServiceAccountFromEnv();

  // Store sanitized service account info for diagnostics (no private key)
  _serviceAccountInfo = {
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    type: serviceAccount.type,
    privateKeyId: serviceAccount.private_key_id || 'not set',
    hasPrivateKey: Boolean(serviceAccount.private_key),
    privateKeyLength: serviceAccount.private_key ? serviceAccount.private_key.length : 0,
  };

  _app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  console.log('[Firebase] Admin SDK initialized successfully');
  console.log(`[Firebase] Project ID: ${_serviceAccountInfo.projectId}`);
  console.log(`[Firebase] Service account: ${_serviceAccountInfo.clientEmail}`);
  console.log(`[Firebase] Private key ID: ${_serviceAccountInfo.privateKeyId}`);
  console.log(`[Firebase] Private key length: ${_serviceAccountInfo.privateKeyLength} chars`);

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
 * Returns the current initialization status of the Firebase Admin SDK.
 * Useful for health checks and diagnostics.
 *
 * @returns {Object} Initialization status object
 */
const getInitializationStatus = () => {
  return {
    initialized: Boolean(_app),
    hasError: Boolean(_initializationError),
    errorMessage: _initializationError ? _initializationError.message : null,
    serviceAccount: _serviceAccountInfo,
  };
};

/**
 * Verifies Firebase Admin SDK initialization and service account credentials.
 *
 * This function performs a comprehensive check of:
 * 1. Environment variable presence and JSON validity
 * 2. Service account field validation
 * 3. Private key format verification
 * 4. Firebase Admin SDK initialization status
 * 5. A lightweight Firebase Auth API call to confirm credentials work
 *
 * Logs detailed diagnostic information to help identify configuration issues.
 * Does NOT throw — returns a result object instead.
 *
 * @returns {Promise<{success: boolean, checks: Object, errors: string[]}>}
 */
const verifyAdminSdkCredentials = async () => {
  const checks = {
    envVarPresent: false,
    jsonValid: false,
    requiredFieldsPresent: false,
    privateKeyFormatValid: false,
    clientEmailFormatValid: false,
    sdkInitialized: false,
    authApiReachable: false,
  };
  const errors = [];

  console.log('[Firebase] Starting credential verification...');

  // Check 1: Environment variable presence
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    errors.push('FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set');
    console.error('[Firebase] CREDENTIAL CHECK FAILED: FIREBASE_SERVICE_ACCOUNT_JSON is not set');
    return { success: false, checks, errors };
  }
  checks.envVarPresent = true;
  console.log('[Firebase] ✓ FIREBASE_SERVICE_ACCOUNT_JSON is set');

  // Check 2: JSON validity
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
    checks.jsonValid = true;
    console.log('[Firebase] ✓ FIREBASE_SERVICE_ACCOUNT_JSON is valid JSON');
  } catch (parseErr) {
    errors.push(`FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${parseErr.message}`);
    console.error('[Firebase] CREDENTIAL CHECK FAILED: Invalid JSON in FIREBASE_SERVICE_ACCOUNT_JSON');
    return { success: false, checks, errors };
  }

  // Normalize private_key before further checks
  const normalized = normalizeServiceAccount(serviceAccount);

  // Check 3: Required fields
  const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
  const missingFields = requiredFields.filter((f) => !normalized[f]);
  if (missingFields.length > 0) {
    errors.push(`Service account JSON is missing required fields: ${missingFields.join(', ')}`);
    console.error(`[Firebase] CREDENTIAL CHECK FAILED: Missing fields: ${missingFields.join(', ')}`);
  } else {
    checks.requiredFieldsPresent = true;
    console.log('[Firebase] ✓ All required service account fields are present');
    console.log(`[Firebase]   project_id: ${normalized.project_id}`);
    console.log(`[Firebase]   client_email: ${normalized.client_email}`);
    console.log(`[Firebase]   type: ${normalized.type}`);
    console.log(`[Firebase]   private_key_id: ${normalized.private_key_id || 'not set'}`);
  }

  // Check 4: Private key format
  if (normalized.private_key) {
    const hasBeginHeader = normalized.private_key.includes('-----BEGIN PRIVATE KEY-----');
    const hasEndHeader = normalized.private_key.includes('-----END PRIVATE KEY-----');
    const hasActualNewlines = normalized.private_key.includes('\n');
    const hadEscapedNewlines = serviceAccount.private_key && serviceAccount.private_key.includes('\\n');

    if (hasBeginHeader && hasEndHeader && hasActualNewlines) {
      checks.privateKeyFormatValid = true;
      console.log('[Firebase] ✓ Private key is in valid PEM format');
      if (hadEscapedNewlines) {
        console.log('[Firebase]   Note: Escaped newlines (\\\\n) were normalized to actual newlines');
      }
    } else {
      const keyErrors = [];
      if (!hasBeginHeader) keyErrors.push('missing BEGIN PRIVATE KEY header');
      if (!hasEndHeader) keyErrors.push('missing END PRIVATE KEY header');
      if (!hasActualNewlines) keyErrors.push('no actual newline characters found in key');
      errors.push(`Private key format is invalid: ${keyErrors.join(', ')}`);
      console.error(`[Firebase] CREDENTIAL CHECK FAILED: Private key format issues: ${keyErrors.join(', ')}`);
      console.error('[Firebase]   Ensure the private_key in your service account JSON has actual newlines,');
      console.error('[Firebase]   not literal \\\\n sequences. When setting env vars, use $\'...\'');
      console.error('[Firebase]   syntax in shell or ensure your deployment platform handles escaping.');
    }
  }

  // Check 5: Client email format
  if (normalized.client_email) {
    const emailRegex = /^[^@]+@[^@]+\.iam\.gserviceaccount\.com$/;
    if (emailRegex.test(normalized.client_email)) {
      checks.clientEmailFormatValid = true;
      console.log('[Firebase] ✓ Service account email format is valid');
    } else {
      errors.push(`client_email '${normalized.client_email}' does not match expected service account format`);
      console.error(`[Firebase] CREDENTIAL CHECK FAILED: client_email format invalid: ${normalized.client_email}`);
    }
  }

  // Check 6: SDK initialization status
  if (_app) {
    checks.sdkInitialized = true;
    console.log('[Firebase] ✓ Firebase Admin SDK is initialized');
  } else {
    // Try to initialize now
    try {
      initializeApp();
      checks.sdkInitialized = true;
      console.log('[Firebase] ✓ Firebase Admin SDK initialized successfully during verification');
    } catch (initErr) {
      errors.push(`Firebase Admin SDK initialization failed: ${initErr.message}`);
      console.error(`[Firebase] CREDENTIAL CHECK FAILED: SDK initialization error: ${initErr.message}`);
    }
  }

  // Check 7: Auth API reachability (lightweight check)
  if (checks.sdkInitialized) {
    try {
      // Use a non-existent UID to test Auth API connectivity
      // This will throw 'auth/user-not-found' if credentials are valid
      // or a different error if credentials are invalid
      const auth = admin.auth();
      await auth.getUser('__credential_check_nonexistent_uid__');
      // If we get here without error, something unexpected happened
      checks.authApiReachable = true;
      console.log('[Firebase] ✓ Firebase Auth API is reachable');
    } catch (authErr) {
      if (authErr.code === 'auth/user-not-found') {
        // Expected error — credentials are valid, user just doesn't exist
        checks.authApiReachable = true;
        console.log('[Firebase] ✓ Firebase Auth API is reachable (credentials verified)');
      } else {
        errors.push(`Firebase Auth API check failed: ${authErr.message} (code: ${authErr.code})`);
        console.error(`[Firebase] CREDENTIAL CHECK FAILED: Auth API error: ${authErr.message}`);
        console.error(`[Firebase]   Error code: ${authErr.code}`);
        console.error('[Firebase]   This may indicate invalid credentials or insufficient IAM permissions.');
        console.error('[Firebase]   Ensure the service account has the "Firebase Admin" or "Firebase Authentication Admin" role.');
      }
    }
  }

  const success = Object.values(checks).every(Boolean) && errors.length === 0;

  if (success) {
    console.log('[Firebase] ✓ All credential checks passed — Firebase Admin SDK is properly configured');
  } else {
    console.error('[Firebase] ✗ Credential verification completed with errors:');
    errors.forEach((e) => console.error(`[Firebase]   - ${e}`));
  }

  return { success, checks, errors };
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
  _initializationError = err;
  console.error('[Firebase] Initialization failed:', err.message);
  // Don't exit here — let the server start and fail gracefully on first request
  // This allows health checks to still work
}

module.exports = {
  getAuth,
  getFirestore,
  initializeApp,
  verifyFirestoreConnection,
  verifyAdminSdkCredentials,
  getInitializationStatus,
  // Exported for testing
  normalizeServiceAccount,
  validateServiceAccount,
};
