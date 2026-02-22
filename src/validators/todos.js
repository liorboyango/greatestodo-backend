/**
 * Todos Validation Schemas
 * Joi schemas for validating todo-related request data.
 * Used by the todos controller to validate inputs before processing.
 */

const Joi = require('joi');

/**
 * Schema for creating a new todo.
 * Validates the request body for POST /api/todos.
 */
const createTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required().messages({
    'string.empty': 'Title cannot be empty',
    'string.max': 'Title cannot exceed 200 characters',
    'any.required': 'Title is required',
  }),

  description: Joi.string().trim().max(2000).allow('').optional().messages({
    'string.max': 'Description cannot exceed 2000 characters',
  }),

  dueDate: Joi.date().iso().allow(null).optional().messages({
    'date.format': 'Due date must be a valid ISO 8601 date string',
  }),

  priority: Joi.string().valid('low', 'medium', 'high').default('medium').messages({
    'any.only': 'Priority must be one of: low, medium, high',
  }),

  category: Joi.string().trim().max(50).allow('').optional().messages({
    'string.max': 'Category cannot exceed 50 characters',
  }),
});

/**
 * Schema for updating an existing todo.
 * All fields are optional for partial updates.
 * Validates the request body for PUT /api/todos/:id.
 */
const updateTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional().messages({
    'string.empty': 'Title cannot be empty',
    'string.max': 'Title cannot exceed 200 characters',
  }),

  description: Joi.string().trim().max(2000).allow('').optional().messages({
    'string.max': 'Description cannot exceed 2000 characters',
  }),

  dueDate: Joi.date().iso().allow(null).optional().messages({
    'date.format': 'Due date must be a valid ISO 8601 date string',
  }),

  priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
    'any.only': 'Priority must be one of: low, medium, high',
  }),

  category: Joi.string().trim().max(50).allow('').optional().messages({
    'string.max': 'Category cannot exceed 50 characters',
  }),

  status: Joi.string().valid('pending', 'completed').optional().messages({
    'any.only': 'Status must be one of: pending, completed',
  }),
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided for update',
  });

/**
 * Schema for listing/filtering todos.
 * Validates query parameters for GET /api/todos.
 * Includes search parameter for full-text search.
 */
const listTodosSchema = Joi.object({
  status: Joi.string().valid('pending', 'completed').optional().messages({
    'any.only': 'Status must be one of: pending, completed',
  }),

  priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
    'any.only': 'Priority must be one of: low, medium, high',
  }),

  category: Joi.string().trim().max(50).optional().messages({
    'string.max': 'Category filter cannot exceed 50 characters',
  }),

  /**
   * Search term for full-text search across title, description, and category.
   * Search is case-insensitive and performed in-memory after Firestore query.
   */
  search: Joi.string().trim().min(1).max(200).optional().messages({
    'string.empty': 'Search term cannot be empty',
    'string.max': 'Search term cannot exceed 200 characters',
  }),

  dueAfter: Joi.date().iso().optional().messages({
    'date.format': 'dueAfter must be a valid ISO 8601 date string',
  }),

  dueBefore: Joi.date().iso().optional().messages({
    'date.format': 'dueBefore must be a valid ISO 8601 date string',
  }),

  limit: Joi.number().integer().min(1).max(100).default(20).optional().messages({
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 100',
  }),

  page: Joi.number().integer().min(1).default(1).optional().messages({
    'number.min': 'Page must be at least 1',
  }),
});

/**
 * Schema for the dedicated search endpoint.
 * Validates query parameters for GET /api/todos/search.
 */
const searchTodosSchema = Joi.object({
  q: Joi.string().trim().min(1).max(200).required().messages({
    'string.empty': 'Search query cannot be empty',
    'string.max': 'Search query cannot exceed 200 characters',
    'any.required': 'Search query parameter "q" is required',
  }),

  status: Joi.string().valid('pending', 'completed').optional().messages({
    'any.only': 'Status must be one of: pending, completed',
  }),

  priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
    'any.only': 'Priority must be one of: low, medium, high',
  }),

  limit: Joi.number().integer().min(1).max(100).default(20).optional().messages({
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 100',
  }),

  page: Joi.number().integer().min(1).default(1).optional().messages({
    'number.min': 'Page must be at least 1',
  }),
});

module.exports = {
  createTodoSchema,
  updateTodoSchema,
  listTodosSchema,
  searchTodosSchema,
};
