/**
 * End-to-End Registration Flow Tests
 *
 * Tests the complete user registration flow from HTTP request to response,
 * covering all success and failure scenarios:
 *
 * 1. Successful registration (201 with token + user)
 * 2. Input validation failures (400)
 * 3. Firestore unavailable before Auth user creation (503, no orphan)
 * 4. Firebase Auth duplicate email (409)
 * 5. Firestore write failure after Auth user creation (cleanup + error)
 * 6. Token generation failure after successful write
 * 7. Request ID correlation in responses
 *
 * All Firebase and Firestore calls are mocked to ensure tests are
 * deterministic and do not require live Firebase credentials.
 */

'use strict';

const request = require('supertest');

// ─── Mock Setup ───────────────────────────────────────────────────────────────
// Must be defined BEFORE requiring the app so Jest hoists the mocks.

const mockCreateUser = jest.fn();
const mockCreateCustomToken = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockDeleteUser = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockEnsureFirestoreReady = jest.fn();
const mockCheckFirestoreReadiness = jest.fn();
const mockGetFirestoreReadinessState = jest.fn();
const mockGetInitializationStatus = jest.fn();
const mockRunStartupFirestoreCheck = jest.fn();
const mockVerifyAdminSdkCredentials = jest.fn();
const mockVerifyFirestoreConnection = jest.fn();
const mockConfirmFirestoreDatabaseAccessible = jest.fn();

// Mock userModel.createUser separately so we can control Firestore write behavior
const mockUserModelCreateUser = jest.fn();

jest.mock('../config/firebase', () => ({
  getAuth: jest.fn(() => ({
    createUser: mockCreateUser,
    createCustomToken: mockCreateCustomToken,
    getUserByEmail: mockGetUserByEmail,
    deleteUser: mockDeleteUser,
    verifyIdToken: mockVerifyIdToken,
  })),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({ exists: true }),
        delete: jest.fn().mockResolvedValue({}),
      })),
    })),
  })),
  ensureFirestoreReady: mockEnsureFirestoreReady,
  checkFirestoreReadiness: mockCheckFirestoreReadiness,
  getFirestoreReadinessState: mockGetFirestoreReadinessState,
  getInitializationStatus: mockGetInitializationStatus,
  runStartupFirestoreCheck: mockRunStartupFirestoreCheck,
  verifyAdminSdkCredentials: mockVerifyAdminSdkCredentials,
  verifyFirestoreConnection: mockVerifyFirestoreConnection,
  confirmFirestoreDatabaseAccessible: mockConfirmFirestoreDatabaseAccessible,
  initializeApp: jest.fn(),
  normalizeServiceAccount: jest.fn((sa) => sa),
  validateServiceAccount: jest.fn(),
  classifyFirestoreError: jest.fn(() => 'Firestore error diagnosis'),
}));

jest.mock('../models/userModel', () => ({
  createUser: mockUserModelCreateUser,
  createUserDocument: jest.fn(),
  formatUserResponse: jest.fn(),
  getUserRef: jest.fn(),
  getUserById: jest.fn(),
  updateUser: jest.fn(),
}));

// Mock axios for Firebase REST API calls (custom token exchange)
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: mockAxiosPost,
}));

// Set required environment variables before loading the app
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIItest\n-----END PRIVATE KEY-----\n',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  private_key_id: 'key-id-123',
});
process.env.FIREBASE_API_KEY = 'test-api-key';
process.env.NODE_ENV = 'test';

// Load the app AFTER mocks are set up
const app = require('../index');

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Valid registration payload for reuse across tests.
 */
const VALID_REGISTRATION = {
  email: 'newuser@example.com',
  password: 'SecurePass123',
};

/**
 * Resets all mocks to their default (success) state before each test.
 * This ensures tests are isolated and do not affect each other.
 */
function resetMocksToDefaults() {
  jest.clearAllMocks();

  // Firebase config defaults
  mockEnsureFirestoreReady.mockResolvedValue(undefined);
  mockCheckFirestoreReadiness.mockResolvedValue(true);
  mockGetFirestoreReadinessState.mockReturnValue({
    state: 'ready',
    lastCheckedAt: new Date(),
    lastError: null,
    lastDiagnosis: null,
  });
  mockGetInitializationStatus.mockReturnValue({
    initialized: true,
    hasError: false,
    errorMessage: null,
    serviceAccount: {
      projectId: 'test-project',
      clientEmail: 'test@test-project.iam.gserviceaccount.com',
    },
  });
  mockRunStartupFirestoreCheck.mockResolvedValue(undefined);
  mockVerifyAdminSdkCredentials.mockResolvedValue({ success: true, checks: {}, errors: [] });
  mockVerifyFirestoreConnection.mockResolvedValue(true);
  mockConfirmFirestoreDatabaseAccessible.mockResolvedValue({
    accessible: true,
    databaseId: '(default)',
    projectId: 'test-project',
    canRead: true,
    canWrite: true,
    errorCode: null,
    errorMessage: null,
    diagnosis: null,
  });

  // Auth defaults
  mockCreateUser.mockResolvedValue({ uid: 'test-uid-123' });
  mockCreateCustomToken.mockResolvedValue('mock-custom-token');
  mockDeleteUser.mockResolvedValue(undefined);
  mockGetUserByEmail.mockResolvedValue({
    uid: 'test-uid-123',
    email: VALID_REGISTRATION.email,
  });
  mockVerifyIdToken.mockResolvedValue({
    uid: 'test-uid-123',
    email: VALID_REGISTRATION.email,
  });

  // Firestore write default (success)
  mockUserModelCreateUser.mockResolvedValue({
    uid: 'test-uid-123',
    email: VALID_REGISTRATION.email,
    displayName: null,
  });

  // Axios default (successful token exchange)
  mockAxiosPost.mockResolvedValue({ data: { idToken: 'mock-firebase-id-token' } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Registration Flow — End-to-End', () => {
  beforeEach(() => {
    resetMocksToDefaults();
  });

  // ── Happy Path ────────────────────────────────────────────────────────────

  describe('Successful Registration', () => {
    it('should return 201 with token and user on valid registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        token: 'mock-firebase-id-token',
        user: {
          uid: 'test-uid-123',
          email: VALID_REGISTRATION.email,
        },
      });
    });

    it('should call ensureFirestoreReady before creating the Firebase Auth user', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      // Firestore readiness check must happen before Auth user creation
      const ensureCallOrder = mockEnsureFirestoreReady.mock.invocationCallOrder[0];
      const createUserCallOrder = mockCreateUser.mock.invocationCallOrder[0];
      expect(ensureCallOrder).toBeLessThan(createUserCallOrder);
    });

    it('should create the Firebase Auth user with correct parameters', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(mockCreateUser).toHaveBeenCalledWith({
        email: VALID_REGISTRATION.email,
        password: VALID_REGISTRATION.password,
        emailVerified: false,
      });
    });

    it('should write the user profile to Firestore with correct uid and email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(mockUserModelCreateUser).toHaveBeenCalledWith(
        expect.anything(), // db instance
        'test-uid-123',
        VALID_REGISTRATION.email
      );
    });

    it('should exchange custom token for ID token via Firebase REST API', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(mockCreateCustomToken).toHaveBeenCalledWith('test-uid-123');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('signInWithCustomToken'),
        expect.objectContaining({ token: 'mock-custom-token', returnSecureToken: true }),
        expect.any(Object)
      );
    });

    it('should include X-Request-Id header in the response', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
    });

    it('should propagate a client-provided X-Request-Id in the response', async () => {
      const clientRequestId = 'client-correlation-id-abc123';
      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION)
        .set('X-Request-Id', clientRequestId);

      expect(res.headers['x-request-id']).toBe(clientRequestId);
    });

    it('should NOT call deleteUser when registration succeeds', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });

  // ── Input Validation ──────────────────────────────────────────────────────

  describe('Input Validation', () => {
    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'SecurePass123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Email is required');
      expect(res.body.code).toBe(400);
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Password is required');
      expect(res.body.code).toBe(400);
    });

    it('should return 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'SecurePass123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('valid email');
    });

    it('should return 400 when password is too short (< 8 chars)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'Ab1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('8 characters');
    });

    it('should return 400 when password lacks uppercase letter', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'lowercase123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('uppercase');
    });

    it('should return 400 when password lacks lowercase letter', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'UPPERCASE123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('lowercase');
    });

    it('should return 400 when password lacks a digit', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'NoDigitsHere' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('number');
    });

    it('should return 400 when request body is empty', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should NOT call Firebase Auth when validation fails', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'bad-email', password: 'weak' });

      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockEnsureFirestoreReady).not.toHaveBeenCalled();
    });

    it('should return 400 for malformed JSON body', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
    });
  });

  // ── Firestore Unavailable (Pre-Auth Guard) ────────────────────────────────

  describe('Firestore Unavailable — Pre-Auth Guard', () => {
    it('should return 503 and NOT create Firebase Auth user when Firestore is unavailable', async () => {
      const firestoreErr = new Error('Firestore database is not accessible.');
      firestoreErr.code = 'FIRESTORE_UNAVAILABLE';
      firestoreErr.statusCode = 503;
      mockEnsureFirestoreReady.mockRejectedValue(firestoreErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('FIRESTORE_UNAVAILABLE');
      expect(res.body.retryable).toBe(true);
      expect(res.body.error).toContain('temporarily unavailable');

      // Critical: no orphaned Firebase Auth user should be created
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('should include requestId in the 503 response', async () => {
      const firestoreErr = new Error('Firestore unavailable');
      firestoreErr.code = 'FIRESTORE_UNAVAILABLE';
      firestoreErr.statusCode = 503;
      mockEnsureFirestoreReady.mockRejectedValue(firestoreErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(503);
      expect(res.body.requestId).toBeDefined();
    });
  });

  // ── Firebase Auth Errors ──────────────────────────────────────────────────

  describe('Firebase Auth Errors', () => {
    it('should return 409 when email already exists in Firebase Auth', async () => {
      const authErr = new Error('The email address is already in use by another account.');
      authErr.code = 'auth/email-already-exists';
      mockCreateUser.mockRejectedValue(authErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('should return 400 when Firebase Auth rejects the email as invalid', async () => {
      const authErr = new Error('The email address is improperly formatted.');
      authErr.code = 'auth/invalid-email';
      mockCreateUser.mockRejectedValue(authErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(400);
    });

    it('should return 400 when Firebase Auth rejects the password as too weak', async () => {
      const authErr = new Error('The password must be a string with at least 6 characters.');
      authErr.code = 'auth/weak-password';
      mockCreateUser.mockRejectedValue(authErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(400);
    });

    it('should NOT call Firestore write when Firebase Auth user creation fails', async () => {
      const authErr = new Error('Firebase Auth error');
      authErr.code = 'auth/email-already-exists';
      mockCreateUser.mockRejectedValue(authErr);

      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(mockUserModelCreateUser).not.toHaveBeenCalled();
    });
  });

  // ── Firestore Write Failure (Post-Auth Cleanup) ───────────────────────────

  describe('Firestore Write Failure — Post-Auth Cleanup', () => {
    it('should delete the Firebase Auth user when Firestore write fails (NOT_FOUND)', async () => {
      const firestoreErr = new Error(
        'Firestore database not found or not accessible. Original error: 5 NOT_FOUND: '
      );
      firestoreErr.code = 5; // gRPC NOT_FOUND
      mockUserModelCreateUser.mockRejectedValue(firestoreErr);

      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      // Auth user must be cleaned up to prevent orphaned accounts
      expect(mockDeleteUser).toHaveBeenCalledWith('test-uid-123');
    });

    it('should return 503 when Firestore write fails with NOT_FOUND error', async () => {
      const firestoreErr = new Error('Firestore database not found');
      firestoreErr.code = 5; // gRPC NOT_FOUND
      firestoreErr.originalError = new Error('original');
      mockUserModelCreateUser.mockRejectedValue(firestoreErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(503);
    });

    it('should delete the Firebase Auth user when Firestore write fails (UNAVAILABLE)', async () => {
      const firestoreErr = new Error('Firestore service is temporarily unavailable');
      firestoreErr.code = 14; // gRPC UNAVAILABLE
      mockUserModelCreateUser.mockRejectedValue(firestoreErr);

      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(mockDeleteUser).toHaveBeenCalledWith('test-uid-123');
    });

    it('should trigger background Firestore re-probe after write failure', async () => {
      const firestoreErr = new Error('Firestore write failed');
      firestoreErr.code = 5;
      mockUserModelCreateUser.mockRejectedValue(firestoreErr);

      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      // Background re-probe should be triggered (may be async)
      // Give it a tick to run
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockCheckFirestoreReadiness).toHaveBeenCalled();
    });

    it('should still return an error even if Auth user cleanup fails', async () => {
      const firestoreErr = new Error('Firestore write failed');
      firestoreErr.code = 5;
      mockUserModelCreateUser.mockRejectedValue(firestoreErr);

      const cleanupErr = new Error('Failed to delete user');
      mockDeleteUser.mockRejectedValue(cleanupErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      // Should still return an error response (not crash)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toBeDefined();
    });

    it('should return 503 when Firestore write fails with PERMISSION_DENIED', async () => {
      const firestoreErr = new Error('PERMISSION_DENIED: Missing or insufficient permissions');
      firestoreErr.code = 7; // gRPC PERMISSION_DENIED
      mockUserModelCreateUser.mockRejectedValue(firestoreErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(503);
      expect(mockDeleteUser).toHaveBeenCalledWith('test-uid-123');
    });
  });

  // ── Token Generation Failure ──────────────────────────────────────────────

  describe('Token Generation Failure', () => {
    it('should return 500 when custom token creation fails', async () => {
      const tokenErr = new Error('Failed to create custom token');
      mockCreateCustomToken.mockRejectedValue(tokenErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });

    it('should return 500 when Firebase REST API token exchange fails', async () => {
      const axiosErr = new Error('Network error');
      mockAxiosPost.mockRejectedValue(axiosErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });

    it('should return 500 when FIREBASE_API_KEY is not set', async () => {
      const originalApiKey = process.env.FIREBASE_API_KEY;
      delete process.env.FIREBASE_API_KEY;

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      // Restore env var
      process.env.FIREBASE_API_KEY = originalApiKey;

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Firebase API key');
    });
  });

  // ── Response Structure Validation ─────────────────────────────────────────

  describe('Response Structure', () => {
    it('should return the correct response shape on success', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('uid');
      expect(res.body.user).toHaveProperty('email');
      expect(typeof res.body.token).toBe('string');
      expect(typeof res.body.user.uid).toBe('string');
      expect(typeof res.body.user.email).toBe('string');
    });

    it('should return the correct error shape on validation failure', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'bad', password: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('code');
      expect(typeof res.body.error).toBe('string');
    });

    it('should return Content-Type application/json for all responses', async () => {
      const successRes = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(successRes.headers['content-type']).toMatch(/application\/json/);

      const errorRes = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(errorRes.headers['content-type']).toMatch(/application\/json/);
    });

    it('should not expose internal stack traces in error responses', async () => {
      const authErr = new Error('Internal Firebase error with stack trace');
      authErr.code = 'auth/internal-error';
      mockCreateUser.mockRejectedValue(authErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      // Stack traces should never appear in API responses
      expect(JSON.stringify(res.body)).not.toContain('at Object.');
      expect(JSON.stringify(res.body)).not.toContain('node_modules');
    });
  });

  // ── Registration Flow Sequence ────────────────────────────────────────────

  describe('Registration Flow Sequence', () => {
    it('should execute all 4 steps in the correct order', async () => {
      const callOrder = [];

      mockEnsureFirestoreReady.mockImplementation(async () => {
        callOrder.push('ensureFirestoreReady');
      });
      mockCreateUser.mockImplementation(async () => {
        callOrder.push('createUser');
        return { uid: 'test-uid-123' };
      });
      mockUserModelCreateUser.mockImplementation(async () => {
        callOrder.push('createUserDocument');
        return { uid: 'test-uid-123', email: VALID_REGISTRATION.email };
      });
      mockCreateCustomToken.mockImplementation(async () => {
        callOrder.push('createCustomToken');
        return 'mock-custom-token';
      });
      mockAxiosPost.mockImplementation(async () => {
        callOrder.push('signInWithCustomToken');
        return { data: { idToken: 'mock-id-token' } };
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(201);
      expect(callOrder).toEqual([
        'ensureFirestoreReady',
        'createUser',
        'createUserDocument',
        'createCustomToken',
        'signInWithCustomToken',
      ]);
    });

    it('should stop at step 1 if Firestore readiness check fails', async () => {
      const firestoreErr = new Error('Firestore unavailable');
      firestoreErr.code = 'FIRESTORE_UNAVAILABLE';
      firestoreErr.statusCode = 503;
      mockEnsureFirestoreReady.mockRejectedValue(firestoreErr);

      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockUserModelCreateUser).not.toHaveBeenCalled();
      expect(mockCreateCustomToken).not.toHaveBeenCalled();
    });

    it('should stop at step 2 if Firebase Auth user creation fails', async () => {
      const authErr = new Error('Auth error');
      authErr.code = 'auth/email-already-exists';
      mockCreateUser.mockRejectedValue(authErr);

      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      expect(mockUserModelCreateUser).not.toHaveBeenCalled();
      expect(mockCreateCustomToken).not.toHaveBeenCalled();
    });

    it('should stop at step 3 and clean up if Firestore write fails', async () => {
      const firestoreErr = new Error('Firestore write failed');
      firestoreErr.code = 5;
      mockUserModelCreateUser.mockRejectedValue(firestoreErr);

      await request(app)
        .post('/api/auth/register')
        .send(VALID_REGISTRATION);

      // Auth user was created (step 2 succeeded)
      expect(mockCreateUser).toHaveBeenCalledTimes(1);
      // Cleanup was triggered
      expect(mockDeleteUser).toHaveBeenCalledWith('test-uid-123');
      // Token generation was NOT attempted
      expect(mockCreateCustomToken).not.toHaveBeenCalled();
    });
  });

  // ── Health Check Integration ──────────────────────────────────────────────

  describe('Health Check', () => {
    it('GET /health should return 200 with Firebase status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.firebase).toBeDefined();
      expect(res.body.firestore).toBeDefined();
    });

    it('GET /health should include Firestore readiness state', async () => {
      const res = await request(app).get('/health');

      expect(res.body.firestore.readinessState).toBe('ready');
    });
  });

  // ── Route Not Found ───────────────────────────────────────────────────────

  describe('Route Not Found', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/unknown-route');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Route not found');
    });
  });
});
