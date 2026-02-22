/**
 * Todos Routes
 * All routes are protected by the auth middleware.
 *
 * GET    /api/todos              - List todos with optional filters & pagination
 * GET    /api/todos/filter       - Dedicated filter endpoint (same as GET /api/todos)
 * GET    /api/todos/stats        - Aggregate stats (total, pending, completed, overdue)
 * GET    /api/todos/categories   - List unique categories for the user
 * GET    /api/todos/:id          - Get a single todo
 * POST   /api/todos              - Create a new todo
 * PUT    /api/todos/:id          - Update a todo (partial)
 * DELETE /api/todos/:id          - Delete a todo
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  getTodos,
  filterTodos,
  getTodoStats,
  getCategories,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
} = require('../controllers/todosController');
const {
  validateGetTodos,
  validateCreateTodo,
  validateUpdateTodo,
} = require('../validators/todos');

// All todo routes require authentication
router.use(verifyToken);

// ─── Specific routes BEFORE parameterized routes ─────────────────────────────

/**
 * GET /api/todos/filter
 * Dedicated filtering endpoint.
 * Supports: status, priority, category, dueAfter, dueBefore, sortBy, sortOrder, page, limit
 */
router.get('/filter', validateGetTodos, filterTodos);

/**
 * GET /api/todos/stats
 * Returns aggregate counts: total, pending, completed, overdue, dueSoon, byPriority
 */
router.get('/stats', getTodoStats);

/**
 * GET /api/todos/categories
 * Returns list of unique category strings used by the authenticated user
 */
router.get('/categories', getCategories);

// ─── General CRUD routes ──────────────────────────────────────────────────────

/**
 * GET /api/todos
 * List todos with optional filtering, sorting, and pagination.
 * Query params: status, priority, category, dueAfter, dueBefore,
 *               sortBy, sortOrder, page, limit
 */
router.get('/', validateGetTodos, getTodos);

/**
 * POST /api/todos
 * Create a new todo.
 * Body: { title, description?, dueDate?, priority?, category?, status? }
 */
router.post('/', validateCreateTodo, createTodo);

/**
 * GET /api/todos/:id
 * Get a single todo by its Firestore document ID.
 */
router.get('/:id', getTodoById);

/**
 * PUT /api/todos/:id
 * Partially update a todo.
 * Body: { title?, description?, dueDate?, priority?, category?, status? }
 */
router.put('/:id', validateUpdateTodo, updateTodo);

/**
 * DELETE /api/todos/:id
 * Delete a todo by its Firestore document ID.
 */
router.delete('/:id', deleteTodo);

module.exports = router;
