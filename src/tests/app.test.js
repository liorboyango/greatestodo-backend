/**
 * Integration tests for the Express application
 *
 * Tests health check endpoint and basic route structure.
 * Firebase-dependent tests require mocking.
 */

const request = require('supertest');

// Mock Firebase Admin SDK before importing app
jest.mock('../config/firebase', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => new Date()),
      },
      Timestamp: {
        fromDate: jest.fn((date) => date),
      },
    },
  },
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({ exists: false }),
        collection: jest.fn(() => ({
          add: jest.fn(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        })),
      })),
    })),
  },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    createCustomToken: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

// Set required env vars for tests
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
});
process.env.NODE_ENV = 'test';

const app = require('../app');

describe('Health Check', () => {
  it('GET /health should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.environment).toBe('test');
  });
});

describe('404 Handler', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Route not found');
    expect(res.body.code).toBe(404);
  });
});

describe('Auth Routes', () => {
  it('POST /api/auth/register should return 400 for missing body', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.code).toBe(400);
  });

  it('POST /api/auth/register should return 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'Password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('valid email');
  });

  it('POST /api/auth/register should return 400 for weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('POST /api/auth/register should handle Firestore errors gracefully', async () => {
    // Mock Firestore set to reject with a numeric error code
    const { db } = require('../config/firebase');
    const mockSet = jest.fn().mockRejectedValue(new Error('Firestore write failed'));
    mockSet.mock.results[0].value.code = 14; // gRPC UNAVAILABLE
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        set: mockSet,
      })),
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Password123' });

    // Should return 500 without crashing (no TypeError)
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
    expect(res.body.code).toBe(500);
  });

  it('POST /api/auth/login should return 400 for missing body', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.code).toBe(400);
  });
});

describe('Todos Routes - Auth Protection', () => {
  it('GET /api/todos should return 401 without token', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
    expect(res.body.code).toBe(401);
  });

  it('POST /api/todos should return 401 without token', async () => {
    const res = await request(app)
      .post('/api/todos')
      .send({ title: 'Test Todo' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);
  });

  it('PUT /api/todos/:id should return 401 without token', async () => {
    const res = await request(app)
      .put('/api/todos/some-id')
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);
  });

  it('DELETE /api/todos/:id should return 401 without token', async () => {
    const res = await request(app).delete('/api/todos/some-id');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);
  });
});