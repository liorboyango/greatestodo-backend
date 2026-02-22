/**
 * Todos Joi Validation Schemas
 * Validates request bodies and query parameters for todo endpoints.
 */

const Joi = require('joi');

/**
 * Schema for creating a new todo.
 */
const createTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required().messages({
    'string.min': 'Title must be at least 1 character long.',
    'string.max': 'Title must not exceed 200 characters.',
    'any.required': 'Title is required.',
    'string.empty': 'Title cannot be empty.',
  }),
  description: Joi.string().trim().max(2000).allow('', null).optional().messages({
    'string.max': 'Description must not exceed 2000 characters.',
  }),
  dueDate: Joi.alternatives()
    .try(
      Joi.date().iso(),
      Joi.string().isoDate(),
      Joi.valid(null)
    )
    .optional()
    .messages({
      'alternatives.match': 'Due date must be a valid ISO 8601 date string or null.',
    }),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium').messages({
    'any.only': 'Priority must be one of: low, medium, high.',
  }),
  category: Joi.string().trim().max(50).allow('', null).optional().messages({
    'string.max': 'Category must not exceed 50 characters.',
  }),
  status: Joi.string().valid('pending', 'completed').default('pending').messages({
    'any.only': 'Status must be one of: pending, completed.',
  }),
});

/**
 * Schema for updating an existing todo (all fields optional).
 */
const updateTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional().messages({
    'string.min': 'Title must be at least 1 character long.',
    'string.max': 'Title must not exceed 200 characters.',
    'string.empty': 'Title cannot be empty.',
  }),
  description: Joi.string().trim().max(2000).allow('', null).optional().messages({
    'string.max': 'Description must not exceed 2000 characters.',
  }),
  dueDate: Joi.alternatives()
    .try(
      Joi.date().iso(),
      Joi.string().isoDate(),
      Joi.valid(null)
    )
    .optional()
    .messages({
      'alternatives.match': 'Due date must be a valid ISO 8601 date string or null.',
    }),
  priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
    'any.only': 'Priority must be one of: low, medium, high.',
  }),
  category: Joi.string().trim().max(50).allow('', null).optional().messages({
    'string.max': 'Category must not exceed 50 characters.',
  }),
  status: Joi.string().valid('pending', 'completed').optional().messages({
    'any.only': 'Status must be one of: pending, completed.',
  }),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update.',
});

/**
 * Schema for todo list query parameters.
 */
const listTodosQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'completed').optional().messages({
    'any.only': 'Status filter must be one of: pending, completed.',
  }),
  priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
    'any.only': 'Priority filter must be one of: low, medium, high.',
  }),
  category: Joi.string().trim().max(50).optional().messages({
    'string.max': 'Category filter must not exceed 50 characters.',
  }),
  search: Joi.string().trim().max(200).optional().messages({
    'string.max': 'Search query must not exceed 200 characters.',
  }),
  dueAfter: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'dueAfter must be a valid ISO 8601 date string.',
  }),
  dueBefore: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'dueBefore must be a valid ISO 8601 date string.',
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).optional().messages({
    'number.min': 'Limit must be at least 1.',
    'number.max': 'Limit must not exceed 100.',
    'number.integer': 'Limit must be an integer.',
  }),
  page: Joi.number().integer().min(1).default(1).optional().messages({
    'number.min': 'Page must be at least 1.',
    'number.integer': 'Page must be an integer.',
  }),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'dueDate', 'priority', 'title').optional().messages({
    'any.only': 'sortBy must be one of: createdAt, updatedAt, dueDate, priority, title.',
  }),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional().messages({
    'any.only': 'sortOrder must be one of: asc, desc.',
  }),
});

/**
 * Schema for todo ID path parameter.
 */
const todoIdSchema = Joi.object({
  id: Joi.string().trim().min(1).max(128).required().messages({
    'any.required': 'Todo ID is required.',
    'string.empty': 'Todo ID cannot be empty.',
    'string.max': 'Todo ID is invalid.',
  }),
});

module.exports = {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
  todoIdSchema,
};
