/**
 * Todos Routes
 *
 * All routes are protected by the auth middleware (verifyToken).
 * Validation is applied via Joi middleware before reaching controllers.
 *
 * GET    /api/todos       — List todos with optional filters
 * POST   /api/todos       — Create a new todo
 * PUT    /api/todos/:id   — Update an existing todo
 * DELETE /api/todos/:id   — Delete a todo
 */

const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/auth');
const { validateBody, validateQuery, validateParams } = require('../middleware/validate');
const {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
  todoIdSchema,
} = require('../validators/todos');
const todosController = require('../controllers/todosController');

// Apply auth middleware to all todo routes
router.use(verifyToken);

/**
 * GET /api/todos
 * Query: status?, priority?, category?, search?, dueAfter?, dueBefore?, limit?, page?, sortBy?, sortOrder?
 * Response: { todos: Array, totalCount: number, page: number, limit: number }
 */
router.get(
  '/',
  validateQuery(listTodosQuerySchema),
  todosController.listTodos
);

/**
 * POST /api/todos
 * Body: { title, description?, dueDate?, priority?, category?, status? }
 * Response: { id, title, description, dueDate, priority, category, status, createdAt, updatedAt }
 */
router.post(
  '/',
  validateBody(createTodoSchema),
  todosController.createTodo
);

/**
 * PUT /api/todos/:id
 * Params: { id }
 * Body: { title?, description?, dueDate?, priority?, category?, status? } (at least one field)
 * Response: { id, title, description, dueDate, priority, category, status, createdAt, updatedAt }
 */
router.put(
  '/:id',
  validateParams(todoIdSchema),
  validateBody(updateTodoSchema),
  todosController.updateTodo
);

/**
 * DELETE /api/todos/:id
 * Params: { id }
 * Response: { success: true }
 */
router.delete(
  '/:id',
  validateParams(todoIdSchema),
  todosController.deleteTodo
);

module.exports = router;
