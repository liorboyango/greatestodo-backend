/**
 * Todos Validation Schemas (Joi)
 * Validates request bodies and query parameters for todo endpoints.
 */

const Joi = require('joi');

// ─── Reusable field schemas ───────────────────────────────────────────────────

const titleSchema = Joi.string().trim().min(1).max(200).required().messages({
  'string.empty': 'Title cannot be empty',
  'string.max': 'Title must be at most 200 characters',
  'any.required': 'Title is required',
});

const descriptionSchema = Joi.string().trim().max(2000).allow('', null).optional().messages({
  'string.max': 'Description must be at most 2000 characters',
});

const dueDateSchema = Joi.string()
  .isoDate()
  .allow(null, '')
  .optional()
  .messages({
    'string.isoDate': 'dueDate must be a valid ISO 8601 date string',
  });

const prioritySchema = Joi.string()
  .valid('low', 'medium', 'high')
  .optional()
  .messages({
    'any.only': 'Priority must be one of: low, medium, high',
  });

const categorySchema = Joi.string().trim().max(50).allow('', null).optional().messages({
  'string.max': 'Category must be at most 50 characters',
});

const statusSchema = Joi.string()
  .valid('pending', 'completed')
  .optional()
  .messages({
    'any.only': 'Status must be one of: pending, completed',
  });

// ─── Query parameter schemas ──────────────────────────────────────────────────

/**
 * Schema for GET /api/todos and GET /api/todos/filter query parameters.
 * All fields are optional — omitting a filter means "no filter applied".
 */
const getTodosQuerySchema = Joi.object({
  // Filters
  status: Joi.string().valid('pending', 'completed').optional().messages({
    'any.only': 'status must be one of: pending, completed',
  }),

  priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
    'any.only': 'priority must be one of: low, medium, high',
  }),

  category: Joi.string().trim().max(50).allow('').optional().messages({
    'string.max': 'category must be at most 50 characters',
  }),

  dueAfter: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'dueAfter must be a valid ISO 8601 date string (e.g. 2024-01-01)',
  }),

  dueBefore: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'dueBefore must be a valid ISO 8601 date string (e.g. 2024-12-31)',
  }),

  // Sorting
  sortBy: Joi.string()
    .valid('createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'status')
    .optional()
    .default('createdAt')
    .messages({
      'any.only': 'sortBy must be one of: createdAt, updatedAt, dueDate, priority, title, status',
    }),

  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc').messages({
    'any.only': 'sortOrder must be one of: asc, desc',
  }),

  // Pagination
  page: Joi.number().integer().min(1).optional().default(1).messages({
    'number.min': 'page must be at least 1',
    'number.integer': 'page must be an integer',
  }),

  limit: Joi.number().integer().min(1).max(100).optional().default(20).messages({
    'number.min': 'limit must be at least 1',
    'number.max': 'limit must be at most 100',
    'number.integer': 'limit must be an integer',
  }),
}).options({ allowUnknown: false });

/**
 * Schema for POST /api/todos request body.
 */
const createTodoSchema = Joi.object({
  title: titleSchema,
  description: descriptionSchema,
  dueDate: dueDateSchema,
  priority: prioritySchema.default('medium'),
  category: categorySchema,
  status: statusSchema.default('pending'),
}).options({ allowUnknown: false });

/**
 * Schema for PUT /api/todos/:id request body.
 * All fields are optional for partial updates.
 */
const updateTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional().messages({
    'string.empty': 'Title cannot be empty',
    'string.max': 'Title must be at most 200 characters',
  }),
  description: descriptionSchema,
  dueDate: dueDateSchema,
  priority: prioritySchema,
  category: categorySchema,
  status: statusSchema,
})
  .min(1)
  .options({ allowUnknown: false })
  .messages({
    'object.min': 'At least one field must be provided for update',
  });

// ─── Middleware factories ─────────────────────────────────────────────────────

/**
 * Creates an Express middleware that validates req.query against a Joi schema.
 * @param {Joi.ObjectSchema} schema
 * @returns {Function} Express middleware
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });
    if (error) {
      const messages = error.details.map((d) => d.message);
      return res.status(400).json({ error: messages.join('; '), code: 400 });
    }
    // Replace req.query with validated + defaulted values
    req.query = value;
    return next();
  };
}

/**
 * Creates an Express middleware that validates req.body against a Joi schema.
 * @param {Joi.ObjectSchema} schema
 * @returns {Function} Express middleware
 */
function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const messages = error.details.map((d) => d.message);
      return res.status(400).json({ error: messages.join('; '), code: 400 });
    }
    req.body = value;
    return next();
  };
}

// ─── Exported middleware ──────────────────────────────────────────────────────

const validateGetTodos = validateQuery(getTodosQuerySchema);
const validateCreateTodo = validateBody(createTodoSchema);
const validateUpdateTodo = validateBody(updateTodoSchema);

module.exports = {
  validateGetTodos,
  validateCreateTodo,
  validateUpdateTodo,
  // Export schemas for testing
  getTodosQuerySchema,
  createTodoSchema,
  updateTodoSchema,
};
