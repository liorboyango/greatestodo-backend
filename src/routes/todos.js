/**
 * Todo Routes
 *
 * Protected routes for todo CRUD operations.
 * All routes require a valid Firebase ID token in the Authorization header.
 *
 * GET    /api/todos       - List todos with filters
 * POST   /api/todos       - Create a new todo
 * PUT    /api/todos/:id   - Update a todo
 * DELETE /api/todos/:id   - Delete a todo
 */

const express = require('express');
const { verifyIdToken } = require('../middleware/auth');
const {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
} = require('../controllers/todosController');

const router = express.Router();

// Apply auth middleware to all todo routes
router.use(verifyIdToken);

/**
 * @route   GET /api/todos
 * @desc    List todos with optional filters and pagination
 * @access  Protected
 * @query   status, priority, category, search, dueAfter, dueBefore, limit, page, sortBy, sortOrder
 * @returns { todos: Todo[], totalCount: number, page: number, limit: number, totalPages: number }
 */
router.get('/', listTodos);

/**
 * @route   POST /api/todos
 * @desc    Create a new todo
 * @access  Protected
 * @body    { title, description?, dueDate?, priority?, category?, status? }
 * @returns Todo object
 */
router.post('/', createTodo);

/**
 * @route   PUT /api/todos/:id
 * @desc    Update an existing todo (partial update)
 * @access  Protected
 * @params  id - Todo document ID
 * @body    { title?, description?, dueDate?, priority?, category?, status? }
 * @returns Updated Todo object
 */
router.put('/:id', updateTodo);

/**
 * @route   DELETE /api/todos/:id
 * @desc    Delete a todo
 * @access  Protected
 * @params  id - Todo document ID
 * @returns { success: true }
 */
router.delete('/:id', deleteTodo);

module.exports = router;
