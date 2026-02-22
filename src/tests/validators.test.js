/**
 * Tests for Joi validation schemas.
 */

const { registerSchema, loginSchema } = require('../validators/auth');
const {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
  todoIdSchema,
} = require('../validators/todos');

const JOI_OPTIONS = { abortEarly: false, stripUnknown: true, convert: true };

// ─── Auth Validators ──────────────────────────────────────────────────────────

describe('registerSchema', () => {
  it('should pass with valid email and strong password', () => {
    const { error } = registerSchema.validate(
      { email: 'user@example.com', password: 'SecurePass1' },
      JOI_OPTIONS
    );
    expect(error).toBeUndefined();
  });

  it('should fail with invalid email', () => {
    const { error } = registerSchema.validate(
      { email: 'not-an-email', password: 'SecurePass1' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('valid email');
  });

  it('should fail with weak password (no uppercase)', () => {
    const { error } = registerSchema.validate(
      { email: 'user@example.com', password: 'weakpass1' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });

  it('should fail with password shorter than 8 chars', () => {
    const { error } = registerSchema.validate(
      { email: 'user@example.com', password: 'Ab1' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('8 characters');
  });

  it('should fail when email is missing', () => {
    const { error } = registerSchema.validate(
      { password: 'SecurePass1' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });

  it('should fail when password is missing', () => {
    const { error } = registerSchema.validate(
      { email: 'user@example.com' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });
});

describe('loginSchema', () => {
  it('should pass with valid email and password', () => {
    const { error } = loginSchema.validate(
      { email: 'user@example.com', password: 'anypassword' },
      JOI_OPTIONS
    );
    expect(error).toBeUndefined();
  });

  it('should fail with invalid email', () => {
    const { error } = loginSchema.validate(
      { email: 'bad-email', password: 'password' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });

  it('should fail with empty password', () => {
    const { error } = loginSchema.validate(
      { email: 'user@example.com', password: '' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });
});

// ─── Todo Validators ──────────────────────────────────────────────────────────

describe('createTodoSchema', () => {
  it('should pass with only required title', () => {
    const { error, value } = createTodoSchema.validate(
      { title: 'Buy groceries' },
      JOI_OPTIONS
    );
    expect(error).toBeUndefined();
    expect(value.priority).toBe('medium');
    expect(value.status).toBe('pending');
  });

  it('should pass with all fields', () => {
    const { error } = createTodoSchema.validate(
      {
        title: 'Buy groceries',
        description: 'Milk and eggs',
        dueDate: '2024-12-31',
        priority: 'high',
        category: 'Shopping',
        status: 'pending',
      },
      JOI_OPTIONS
    );
    expect(error).toBeUndefined();
  });

  it('should fail when title is missing', () => {
    const { error } = createTodoSchema.validate({}, JOI_OPTIONS);
    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('Title is required');
  });

  it('should fail when title exceeds 200 chars', () => {
    const { error } = createTodoSchema.validate(
      { title: 'a'.repeat(201) },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('200 characters');
  });

  it('should fail with invalid priority', () => {
    const { error } = createTodoSchema.validate(
      { title: 'Test', priority: 'urgent' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('low, medium, high');
  });

  it('should fail with invalid status', () => {
    const { error } = createTodoSchema.validate(
      { title: 'Test', status: 'in-progress' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });

  it('should strip unknown fields', () => {
    const { value } = createTodoSchema.validate(
      { title: 'Test', unknownField: 'should be removed' },
      JOI_OPTIONS
    );
    expect(value.unknownField).toBeUndefined();
  });
});

describe('updateTodoSchema', () => {
  it('should pass with a single valid field', () => {
    const { error } = updateTodoSchema.validate(
      { status: 'completed' },
      JOI_OPTIONS
    );
    expect(error).toBeUndefined();
  });

  it('should fail when no fields are provided', () => {
    const { error } = updateTodoSchema.validate({}, JOI_OPTIONS);
    expect(error).toBeDefined();
  });

  it('should pass with multiple valid fields', () => {
    const { error } = updateTodoSchema.validate(
      { title: 'Updated title', priority: 'low', status: 'completed' },
      JOI_OPTIONS
    );
    expect(error).toBeUndefined();
  });
});

describe('listTodosQuerySchema', () => {
  it('should pass with no query params (all optional)', () => {
    const { error, value } = listTodosQuerySchema.validate({}, JOI_OPTIONS);
    expect(error).toBeUndefined();
    expect(value.limit).toBe(20);
    expect(value.page).toBe(1);
  });

  it('should coerce limit and page to numbers', () => {
    const { error, value } = listTodosQuerySchema.validate(
      { limit: '10', page: '2' },
      JOI_OPTIONS
    );
    expect(error).toBeUndefined();
    expect(value.limit).toBe(10);
    expect(value.page).toBe(2);
  });

  it('should fail with limit > 100', () => {
    const { error } = listTodosQuerySchema.validate(
      { limit: '200' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });

  it('should fail with invalid status filter', () => {
    const { error } = listTodosQuerySchema.validate(
      { status: 'unknown' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });

  it('should fail with invalid dueAfter date', () => {
    const { error } = listTodosQuerySchema.validate(
      { dueAfter: 'not-a-date' },
      JOI_OPTIONS
    );
    expect(error).toBeDefined();
  });
});

describe('todoIdSchema', () => {
  it('should pass with a valid ID', () => {
    const { error } = todoIdSchema.validate({ id: 'abc123xyz' }, JOI_OPTIONS);
    expect(error).toBeUndefined();
  });

  it('should fail with empty ID', () => {
    const { error } = todoIdSchema.validate({ id: '' }, JOI_OPTIONS);
    expect(error).toBeDefined();
  });

  it('should fail when ID is missing', () => {
    const { error } = todoIdSchema.validate({}, JOI_OPTIONS);
    expect(error).toBeDefined();
  });
});
