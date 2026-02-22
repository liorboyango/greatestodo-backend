/**
 * Unit tests for validation schemas
 */

const { registerSchema, loginSchema, validate: validateAuth } = require('../validators/auth');
const {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
  validate: validateTodo,
} = require('../validators/todos');

describe('Auth Validators', () => {
  describe('registerSchema', () => {
    it('should pass with valid email and strong password', () => {
      const { error } = validateAuth(registerSchema, {
        email: 'user@example.com',
        password: 'Password123',
      });
      expect(error).toBeUndefined();
    });

    it('should fail with invalid email', () => {
      const { error } = validateAuth(registerSchema, {
        email: 'not-an-email',
        password: 'Password123',
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('valid email');
    });

    it('should fail with short password', () => {
      const { error } = validateAuth(registerSchema, {
        email: 'user@example.com',
        password: 'Pass1',
      });
      expect(error).toBeDefined();
    });

    it('should fail with password missing uppercase', () => {
      const { error } = validateAuth(registerSchema, {
        email: 'user@example.com',
        password: 'password123',
      });
      expect(error).toBeDefined();
    });

    it('should fail with missing fields', () => {
      const { error } = validateAuth(registerSchema, {});
      expect(error).toBeDefined();
      expect(error.details.length).toBeGreaterThan(0);
    });
  });

  describe('loginSchema', () => {
    it('should pass with valid credentials', () => {
      const { error } = validateAuth(loginSchema, {
        email: 'user@example.com',
        password: 'anypassword',
      });
      expect(error).toBeUndefined();
    });

    it('should fail with missing email', () => {
      const { error } = validateAuth(loginSchema, { password: 'password' });
      expect(error).toBeDefined();
    });
  });
});

describe('Todo Validators', () => {
  describe('createTodoSchema', () => {
    it('should pass with required title only', () => {
      const { error, value } = validateTodo(createTodoSchema, { title: 'My Todo' });
      expect(error).toBeUndefined();
      expect(value.priority).toBe('medium');
      expect(value.status).toBe('pending');
    });

    it('should pass with all fields', () => {
      const { error } = validateTodo(createTodoSchema, {
        title: 'My Todo',
        description: 'A description',
        dueDate: '2025-12-31',
        priority: 'high',
        category: 'Work',
        status: 'pending',
      });
      expect(error).toBeUndefined();
    });

    it('should fail with missing title', () => {
      const { error } = validateTodo(createTodoSchema, { priority: 'high' });
      expect(error).toBeDefined();
    });

    it('should fail with title exceeding 200 chars', () => {
      const { error } = validateTodo(createTodoSchema, { title: 'a'.repeat(201) });
      expect(error).toBeDefined();
    });

    it('should fail with invalid priority', () => {
      const { error } = validateTodo(createTodoSchema, {
        title: 'Todo',
        priority: 'urgent',
      });
      expect(error).toBeDefined();
    });

    it('should fail with invalid status', () => {
      const { error } = validateTodo(createTodoSchema, {
        title: 'Todo',
        status: 'in-progress',
      });
      expect(error).toBeDefined();
    });
  });

  describe('updateTodoSchema', () => {
    it('should pass with partial update', () => {
      const { error } = validateTodo(updateTodoSchema, { status: 'completed' });
      expect(error).toBeUndefined();
    });

    it('should fail with empty object', () => {
      const { error } = validateTodo(updateTodoSchema, {});
      expect(error).toBeDefined();
    });

    it('should pass with multiple fields', () => {
      const { error } = validateTodo(updateTodoSchema, {
        title: 'Updated Title',
        priority: 'low',
        status: 'completed',
      });
      expect(error).toBeUndefined();
    });
  });

  describe('listTodosQuerySchema', () => {
    it('should apply defaults for empty query', () => {
      const { value, error } = validateTodo(listTodosQuerySchema, {});
      expect(error).toBeUndefined();
      expect(value.limit).toBe(20);
      expect(value.page).toBe(1);
      expect(value.sortBy).toBe('createdAt');
      expect(value.sortOrder).toBe('desc');
    });

    it('should pass with valid filters', () => {
      const { error } = validateTodo(listTodosQuerySchema, {
        status: 'pending',
        priority: 'high',
        limit: '10',
        page: '2',
      });
      expect(error).toBeUndefined();
    });

    it('should fail with invalid status', () => {
      const { error } = validateTodo(listTodosQuerySchema, { status: 'invalid' });
      expect(error).toBeDefined();
    });
  });
});
