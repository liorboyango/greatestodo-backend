/**
 * Integration tests for the Todos CRUD API endpoints.
 *
 * These tests mock Firebase Admin SDK to avoid real network calls.
 * Tests cover:
 *   - GET /api/todos (list with filters, pagination, search)
 *   - GET /api/todos/:id (single todo)
 *   - POST /api/todos (create)
 *   - PUT /api/todos/:id (update)
 *   - DELETE /api/todos/:id (delete)
 *   - Authentication enforcement
 *   - Input validation
 */

const request = require('supertest');

// ─── Mock Firebase Admin SDK ──────────────────────────────────────────────────

const mockVerifyIdToken = jest.fn();
const mockGet = jest.fn();
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockWhere = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();

// Build a chainable Firestore mock
const buildQueryMock = (docs = []) => ({
  where: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue({ docs }),
});

const mockDocRef = {
  get: mockGet,
  update: mockUpdate,
  delete: mockDelete,
};

const mockCollectionRef = {
  where: mockWhere,
  get: mockGet,
  add: mockAdd,
  doc: mockDoc,
};

jest.mock('firebase-admin', () => {
  const mockFirestore = jest.fn(() => ({
    collection: mockCollection,
  }));
  mockFirestore.FieldValue = {
    serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  };
  mockFirestore.Timestamp = {
    fromDate: jest.fn((d) => ({ toDate: () => d })),
  };

  return {
    apps: [],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    auth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
    firestore: mockFirestore,
  };
});

// ─── Load App After Mocks ─────────────────────────────────────────────────────

let app;
beforeAll(() => {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key_id: 'key-id',
    private_key: 'fake-key',
    client_email: 'test@test-project.iam.gserviceaccount.com',
    client_id: '123',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  });
  process.env.FIREBASE_WEB_API_KEY = 'test-api-key';
  process.env.NODE_ENV = 'test';

  app = require('../src/index');
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-firebase-token';
const TEST_UID = 'test-user-uid-123';
const TEST_EMAIL = 'test@example.com';

const authHeaders = { Authorization: `Bearer ${VALID_TOKEN}` };

function makeTodoDoc(id, overrides = {}) {
  const now = new Date('2024-01-15T10:00:00Z');
  return {
    id,
    data: () => ({
      title: 'Test Todo',
      description: 'A test description',
      dueDate: { toDate: () => new Date('2024-02-01T00:00:00Z') },
      priority: 'medium',
      category: 'work',
      status: 'pending',
      createdAt: { toDate: () => now },
      updatedAt: { toDate: () => now },
      ...overrides,
    }),
    exists: true,
  };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Default: valid token
  mockVerifyIdToken.mockResolvedValue({ uid: TEST_UID, email: TEST_EMAIL });

  // Default collection chain
  mockDoc.mockReturnValue(mockDocRef);
  mockWhere.mockReturnThis();

  // Default: collection returns a chainable mock
  mockCollection.mockImplementation((name) => {
    if (name === 'users') {
      return {
        doc: jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(mockCollectionRef),
          set: jest.fn().mockResolvedValue({}),
        }),
      };
    }
    return mockCollectionRef;
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Todos API', () => {
  // ── Authentication ──────────────────────────────────────────────────────────

  describe('Authentication', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const res = await request(app).get('/api/todos');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.code).toBe(401);
    });

    it('should return 401 when Authorization header is malformed', async () => {
      const res = await request(app)
        .get('/api/todos')
        .set('Authorization', 'InvalidToken');
      expect(res.status).toBe(401);
    });

    it('should return 401 when token is invalid', async () => {
      mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token' });
      const res = await request(app)
        .get('/api/todos')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    });

    it('should return 401 when token is expired', async () => {
      mockVerifyIdToken.mockRejectedValue({ code: 'auth/id-token-expired' });
      const res = await request(app)
        .get('/api/todos')
        .set(authHeaders);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/expired/i);
    });
  });

  // ── GET /api/todos ──────────────────────────────────────────────────────────

  describe('GET /api/todos', () => {
    it('should return empty list when user has no todos', async () => {
      mockGet.mockResolvedValue({ docs: [] });
      mockCollectionRef.get = mockGet;
      mockCollectionRef.where = jest.fn().mockReturnThis();

      const res = await request(app).get('/api/todos').set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('todos');
      expect(res.body.todos).toEqual([]);
      expect(res.body).toHaveProperty('totalCount', 0);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit', 20);
    });

    it('should return list of todos', async () => {
      const doc1 = makeTodoDoc('todo-1');
      const doc2 = makeTodoDoc('todo-2', { title: 'Second Todo', priority: 'high' });

      mockGet.mockResolvedValue({ docs: [doc1, doc2] });
      mockCollectionRef.get = mockGet;
      mockCollectionRef.where = jest.fn().mockReturnThis();

      const res = await request(app).get('/api/todos').set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.todos).toHaveLength(2);
      expect(res.body.totalCount).toBe(2);
      expect(res.body.todos[0]).toHaveProperty('id', 'todo-1');
      expect(res.body.todos[0]).toHaveProperty('title', 'Test Todo');
    });

    it('should apply status filter', async () => {
      mockGet.mockResolvedValue({ docs: [] });
      mockCollectionRef.get = mockGet;
      mockCollectionRef.where = jest.fn().mockReturnThis();

      const res = await request(app)
        .get('/api/todos?status=completed')
        .set(authHeaders);

      expect(res.status).toBe(200);
    });

    it('should reject invalid status filter', async () => {
      const res = await request(app)
        .get('/api/todos?status=invalid')
        .set(authHeaders);

      expect(res.status).toBe(400);
    });

    it('should apply pagination', async () => {
      mockGet.mockResolvedValue({ docs: [] });
      mockCollectionRef.get = mockGet;
      mockCollectionRef.where = jest.fn().mockReturnThis();

      const res = await request(app)
        .get('/api/todos?page=2&limit=10')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(10);
    });

    it('should reject limit > 100', async () => {
      const res = await request(app)
        .get('/api/todos?limit=200')
        .set(authHeaders);

      expect(res.status).toBe(400);
    });

    it('should filter by search term', async () => {
      const matchingDoc = makeTodoDoc('todo-match', { title: 'Buy groceries' });
      const nonMatchingDoc = makeTodoDoc('todo-no-match', { title: 'Read book' });

      mockGet.mockResolvedValue({ docs: [matchingDoc, nonMatchingDoc] });
      mockCollectionRef.get = mockGet;
      mockCollectionRef.where = jest.fn().mockReturnThis();

      const res = await request(app)
        .get('/api/todos?search=groceries')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.todos).toHaveLength(1);
      expect(res.body.todos[0].title).toBe('Buy groceries');
    });
  });

  // ── GET /api/todos/:id ──────────────────────────────────────────────────────

  describe('GET /api/todos/:id', () => {
    it('should return a single todo by ID', async () => {
      const doc = makeTodoDoc('todo-abc');
      mockGet.mockResolvedValue(doc);

      const res = await request(app)
        .get('/api/todos/todo-abc')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('todo-abc');
      expect(res.body.title).toBe('Test Todo');
    });

    it('should return 404 when todo does not exist', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const res = await request(app)
        .get('/api/todos/nonexistent-id')
        .set(authHeaders);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ── POST /api/todos ─────────────────────────────────────────────────────────

  describe('POST /api/todos', () => {
    it('should create a new todo with required fields only', async () => {
      const createdDoc = makeTodoDoc('new-todo-id', { title: 'New Task' });
      mockAdd.mockResolvedValue({ get: jest.fn().mockResolvedValue(createdDoc) });

      const res = await request(app)
        .post('/api/todos')
        .set(authHeaders)
        .send({ title: 'New Task' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('New Task');
    });

    it('should create a todo with all optional fields', async () => {
      const createdDoc = makeTodoDoc('full-todo-id', {
        title: 'Full Task',
        description: 'Detailed description',
        priority: 'high',
        category: 'work',
        status: 'pending',
      });
      mockAdd.mockResolvedValue({ get: jest.fn().mockResolvedValue(createdDoc) });

      const res = await request(app)
        .post('/api/todos')
        .set(authHeaders)
        .send({
          title: 'Full Task',
          description: 'Detailed description',
          dueDate: '2024-12-31T00:00:00Z',
          priority: 'high',
          category: 'work',
          status: 'pending',
        });

      expect(res.status).toBe(201);
    });

    it('should return 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeaders)
        .send({ description: 'No title here' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it('should return 400 when title exceeds 200 characters', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeaders)
        .send({ title: 'A'.repeat(201) });

      expect(res.status).toBe(400);
    });

    it('should return 400 when priority is invalid', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeaders)
        .send({ title: 'Valid Title', priority: 'urgent' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when status is invalid', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeaders)
        .send({ title: 'Valid Title', status: 'in-progress' });

      expect(res.status).toBe(400);
    });
  });

  // ── PUT /api/todos/:id ──────────────────────────────────────────────────────

  describe('PUT /api/todos/:id', () => {
    it('should update a todo successfully', async () => {
      const existingDoc = makeTodoDoc('todo-update-id');
      const updatedDoc = makeTodoDoc('todo-update-id', {
        title: 'Updated Title',
        status: 'completed',
      });

      mockGet
        .mockResolvedValueOnce(existingDoc)  // exists check
        .mockResolvedValueOnce(updatedDoc);  // fetch after update
      mockUpdate.mockResolvedValue({});

      const res = await request(app)
        .put('/api/todos/todo-update-id')
        .set(authHeaders)
        .send({ title: 'Updated Title', status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.status).toBe('completed');
    });

    it('should return 404 when todo does not exist', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const res = await request(app)
        .put('/api/todos/nonexistent-id')
        .set(authHeaders)
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should return 400 when no fields are provided', async () => {
      const res = await request(app)
        .put('/api/todos/some-id')
        .set(authHeaders)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 when priority is invalid', async () => {
      const res = await request(app)
        .put('/api/todos/some-id')
        .set(authHeaders)
        .send({ priority: 'critical' });

      expect(res.status).toBe(400);
    });

    it('should allow clearing dueDate by setting it to null', async () => {
      const existingDoc = makeTodoDoc('todo-clear-date');
      const updatedDoc = makeTodoDoc('todo-clear-date', {
        dueDate: null,
        title: 'Test Todo',
      });
      // Override data for null dueDate
      updatedDoc.data = () => ({
        title: 'Test Todo',
        description: 'A test description',
        dueDate: null,
        priority: 'medium',
        category: 'work',
        status: 'pending',
        createdAt: { toDate: () => new Date() },
        updatedAt: { toDate: () => new Date() },
      });

      mockGet
        .mockResolvedValueOnce(existingDoc)
        .mockResolvedValueOnce(updatedDoc);
      mockUpdate.mockResolvedValue({});

      const res = await request(app)
        .put('/api/todos/todo-clear-date')
        .set(authHeaders)
        .send({ dueDate: null });

      expect(res.status).toBe(200);
      expect(res.body.dueDate).toBeNull();
    });
  });

  // ── DELETE /api/todos/:id ───────────────────────────────────────────────────

  describe('DELETE /api/todos/:id', () => {
    it('should delete a todo successfully', async () => {
      const existingDoc = makeTodoDoc('todo-delete-id');
      mockGet.mockResolvedValue(existingDoc);
      mockDelete.mockResolvedValue({});

      const res = await request(app)
        .delete('/api/todos/todo-delete-id')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Todo deleted successfully' });
    });

    it('should return 404 when todo does not exist', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const res = await request(app)
        .delete('/api/todos/nonexistent-id')
        .set(authHeaders);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ── Health Check ────────────────────────────────────────────────────────────

  describe('Health Check', () => {
    it('GET /health should return 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // ── 404 Handler ─────────────────────────────────────────────────────────────

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/unknown-route');
      expect(res.status).toBe(404);
    });
  });
});
