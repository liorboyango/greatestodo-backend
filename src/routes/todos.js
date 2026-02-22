/**
 * Todos Router
 *
 * All routes are protected by the authentication middleware.
 * The authenticated user's UID is available via req.user.uid.
 *
 * Routes:
 *   GET    /api/todos        - List todos (with filters, search, pagination)
 *   GET    /api/todos/:id    - Get a single todo by ID
 *   POST   /api/todos        - Create a new todo
 *   PUT    /api/todos/:id    - Update an existing todo (partial)
 *   DELETE /api/todos/:id    - Delete a todo
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
} = require('../controllers/todosController');

// Apply authentication middleware to all todo routes
router.use(verifyToken);

/**
 * @route   GET /api/todos
 * @desc    List all todos for the authenticated user
 * @access  Protected
 * @query   status, priority, category, search, dueAfter, dueBefore, limit, page, sortBy, sortOrder
 */
router.get('/', listTodos);

/**
 * @route   GET /api/todos/:id
 * @desc    Get a single todo by ID
 * @access  Protected
 */
router.get('/:id', getTodo);

/**
 * @route   POST /api/todos
 * @desc    Create a new todo
 * @access  Protected
 * @body    { title, description?, dueDate?, priority?, category?, status? }
 */
router.post('/', createTodo);

/**
 * @route   PUT /api/todos/:id
 * @desc    Partially update an existing todo
 * @access  Protected
 * @body    { title?, description?, dueDate?, priority?, category?, status? }
 */
router.put('/:id', updateTodo);

/**
 * @route   DELETE /api/todos/:id
 * @desc    Delete a todo
 * @access  Protected
 */
router.delete('/:id', deleteTodo);

module.exports = router;
