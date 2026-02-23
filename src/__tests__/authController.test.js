/**
 * Auth Controller Tests
 *
 * Tests registration and login endpoints.
 * Mocks Firebase Admin SDK and axios for isolated testing.
 */

const { register, login } = require('../controllers/authController');
const { getAuth, getFirestore, ensureFirestoreReady } = require('../config/firebase');
const { createError } = require('../middleware/errorHandler');

const mockRequest = (body, headers = {}) => ({ body, headers });
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();

// Mock Firebase Admin SDK
const mockCreateUser = jest.fn();
const mockCreateCustomToken = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockDeleteUser = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockSet = jest.fn();
const mockEnsureFirestoreReady = jest.fn();
const mockCheckFirestoreReadiness = jest.fn();

jest.mock('../config/firebase', () => ({
  getAuth: jest.fn(() => ({
    createUser: mockCreateUser,
    createCustomToken: mockCreateCustomToken,
    getUserByEmail: mockGetUserByEmail,
    deleteUser: mockDeleteUser,
  })),
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
  ensureFirestoreReady: mockEnsureFirestoreReady,
  checkFirestoreReadiness: mockCheckFirestoreReadiness,
}));

// Mock axios
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: mockAxiosPost,
}));

// Mock createError
const mockCreateError = jest.fn();
jest.mock('../middleware/errorHandler', () => ({
  createError: mockCreateError,
}));

// Mock userModel.createUser
const mockCreateUserModel = jest.fn();
jest.mock('../models/userModel', () => ({
  createUser: mockCreateUserModel,
}));

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue({
      doc: mockDoc,
    });
    mockDoc.mockReturnValue({
      set: mockSet,
    });
    // Default: Firestore is ready
    mockEnsureFirestoreReady.mockResolvedValue(undefined);
    // Default: re-probe succeeds
    mockCheckFirestoreReadiness.mockResolvedValue(true);
  });

  describe('register', () => {
    it('should create a user and return a token on successful registration', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();
      const db = {};

      mockCreateUser.mockResolvedValue({ uid: 'user123' });
      mockCreateCustomToken.mockResolvedValue('custom-token');
      mockAxiosPost.mockResolvedValue({ data: { idToken: 'id-token' } });
      mockCreateUserModel.mockResolvedValue();
      getFirestore.mockReturnValue(db);

      await register(req, res, mockNext);

      expect(mockEnsureFirestoreReady).toHaveBeenCalledTimes(1);
      expect(mockCreateUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123',
        emailVerified: false,
      });
      expect(mockCreateCustomToken).toHaveBeenCalledWith('user123');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=undefined',
        { token: 'custom-token', returnSecureToken: true },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      expect(mockCreateUserModel).toHaveBeenCalledWith(db, 'user123', 'test@example.com');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        token: 'id-token',
        user: { uid: 'user123', email: 'test@example.com' },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 503 immediately when Firestore readiness check fails', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();

      const firestoreErr = new Error('Firestore database is not accessible.');
      firestoreErr.code = 'FIRESTORE_UNAVAILABLE';
      firestoreErr.statusCode = 503;
      mockEnsureFirestoreReady.mockRejectedValue(firestoreErr);

      await register(req, res, mockNext);

      // Should NOT create a Firebase Auth user when Firestore is unavailable
      expect(mockCreateUser).not.toHaveBeenCalled();
      // Should return 503 directly
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'FIRESTORE_UNAVAILABLE',
          retryable: true,
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should delete Firebase Auth user and re-probe Firestore when Firestore write fails', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();

      mockCreateUser.mockResolvedValue({ uid: 'user123' });
      const firestoreWriteErr = new Error('Firestore write failed');
      firestoreWriteErr.code = 5; // NOT_FOUND
      mockCreateUserModel.mockRejectedValue(firestoreWriteErr);
      mockDeleteUser.mockResolvedValue();

      await register(req, res, mockNext);

      // Auth user should be created first
      expect(mockCreateUser).toHaveBeenCalledTimes(1);
      // Firestore write should be attempted
      expect(mockCreateUserModel).toHaveBeenCalledTimes(1);
      // Auth user should be deleted to prevent orphaned account
      expect(mockDeleteUser).toHaveBeenCalledWith('user123');
      // Background re-probe should be triggered
      expect(mockCheckFirestoreReadiness).toHaveBeenCalled();
      // Error should be propagated to next()
      expect(mockNext).toHaveBeenCalledWith(firestoreWriteErr);
    });

    it('should log critical error if Auth user cleanup fails after Firestore write failure', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();

      mockCreateUser.mockResolvedValue({ uid: 'user123' });
      const firestoreWriteErr = new Error('Firestore write failed');
      mockCreateUserModel.mockRejectedValue(firestoreWriteErr);
      const cleanupErr = new Error('Delete user failed');
      mockDeleteUser.mockRejectedValue(cleanupErr);

      await register(req, res, mockNext);

      // Cleanup was attempted
      expect(mockDeleteUser).toHaveBeenCalledWith('user123');
      // Original error should still be propagated
      expect(mockNext).toHaveBeenCalledWith(firestoreWriteErr);
    });

    it('should call next with error on Firebase createUser failure', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();
      const error = new Error('Firebase error');

      mockCreateUser.mockRejectedValue(error);

      await register(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should call next with error on userModel.createUser failure', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();
      const error = new Error('Firestore error');

      mockCreateUser.mockResolvedValue({ uid: 'user123' });
      mockDeleteUser.mockResolvedValue();
      mockCreateUserModel.mockRejectedValue(error);

      await register(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should call next with error on custom token creation failure', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();
      const error = new Error('Custom token error');

      mockCreateUser.mockResolvedValue({ uid: 'user123' });
      mockCreateUserModel.mockResolvedValue();
      mockCreateCustomToken.mockRejectedValue(error);

      await register(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should call next with error on axios post failure', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();
      const error = new Error('Axios error');

      mockCreateUser.mockResolvedValue({ uid: 'user123' });
      mockCreateUserModel.mockResolvedValue();
      mockCreateCustomToken.mockResolvedValue('custom-token');
      mockAxiosPost.mockRejectedValue(error);

      await register(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('login', () => {
    it('should return a token on successful login', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();

      mockGetUserByEmail.mockResolvedValue({ uid: 'user123', email: 'test@example.com' });
      mockAxiosPost.mockResolvedValue({ data: { idToken: 'id-token' } });

      await login(req, res, mockNext);

      expect(mockGetUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=undefined',
        { email: 'test@example.com', password: 'Password123', returnSecureToken: true },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        token: 'id-token',
        user: { uid: 'user123', email: 'test@example.com' },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next with 401 error if user not found', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();

      mockGetUserByEmail.mockRejectedValue(new Error());
      mockCreateError.mockReturnValue(new Error('Invalid email or password.'));

      await login(req, res, mockNext);

      expect(mockCreateError).toHaveBeenCalledWith('Invalid email or password.', 401);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should call next with error on axios post failure', async () => {
      const req = mockRequest({ email: 'test@example.com', password: 'Password123' });
      const res = mockResponse();
      const error = new Error('Axios error');

      mockGetUserByEmail.mockResolvedValue({ uid: 'user123', email: 'test@example.com' });
      mockAxiosPost.mockRejectedValue(error);

      await login(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
