/**
 * Todos Routes
 * Defines all todo-related API endpoints.
 * All routes are protected by the authentication middleware.
 *
 * Routes:
 *   GET    /api/todos          - List todos with optional filters and search
 *   GET    /api/todos/search   - Dedicated search endpoint
 *   GET    /api/todos/:id      - Get a single todo
 *   POST   /api/todos          - Create a new todo
 *   PUT    /api/todos/:id      - Update a todo
 *   DELETE /api/todos/:id      - Delete a todo
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  listTodos,
  searchTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodo,
} = require('../controllers/todosController');

// All todo routes require authentication
router.use(verifyToken);

/**
 * GET /api/todos
 * List todos with optional filtering and search.
 *
 * Query Parameters:
 *   - status: 'pending' | 'completed'
 *   - priority: 'low' | 'medium' | 'high'
 *   - category: string
 *   - search: string (searches title, description, category)
 *   - dueAfter: ISO date string
 *   - dueBefore: ISO date string
 *   - limit: number (default 20, max 100)
 *   - page: number (default 1)
 *
 * @example GET /api/todos?status=pending&priority=high&search=meeting
 */
router.get('/', listTodos);

/**
 * GET /api/todos/search
 * Dedicated search endpoint for todos.
 * Searches across title, description, and category fields.
 *
 * Query Parameters:
 *   - q: string (required) — the search query
 *   - status: 'pending' | 'completed' (optional filter)
 *   - priority: 'low' | 'medium' | 'high' (optional filter)
 *   - limit: number (default 20, max 100)
 *   - page: number (default 1)
 *
 * @example GET /api/todos/search?q=meeting&status=pending
 */
router.get('/search', searchTodos);

/**
 * GET /api/todos/:id
 * Get a single todo by ID.
 *
 * @example GET /api/todos/abc123
 */
router.get('/:id', getTodo);

/**
 * POST /api/todos
 * Create a new todo.
 *
 * Request Body:
 *   - title: string (required, max 200)
 *   - description: string (optional)
 *   - dueDate: ISO date string (optional)
 *   - priority: 'low' | 'medium' | 'high' (default 'medium')
 *   - category: string (optional, max 50)
 *
 * @example POST /api/todos
 */
router.post('/', createTodo);

/**
 * PUT /api/todos/:id
 * Update an existing todo (partial update supported).
 *
 * @example PUT /api/todos/abc123
 */
router.put('/:id', updateTodo);

/**
 * DELETE /api/todos/:id
 * Delete a todo by ID.
 *
 * @example DELETE /api/todos/abc123
 */
router.delete('/:id', deleteTodo);

module.exports = router;
