/**
 * Auth Controller Tests
 *
 * Tests registration and login endpoints.
 * Mocks Firebase Admin SDK and axios for isolated testing.
 */

const { register, login } = require('../controllers/authController');
const { getAuth, getFirestore } = require('../config/firebase');
const { createError } = require('../middleware/errorHandler');

const mockRequest = (body) => ({ body });
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
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockSet = jest.fn();

jest.mock('../config/firebase', () => ({
  getAuth: jest.fn(() => ({
    createUser: mockCreateUser,
    createCustomToken: mockCreateCustomToken,
    getUserByEmail: mockGetUserByEmail,
  })),
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
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