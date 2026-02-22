/**
 * Joi validation schemas for todo endpoints.
 * Validates all incoming request bodies and query parameters.
 */

const Joi = require('joi');

/**
 * Schema for creating a new todo.
 * Title is required; all other fields are optional.
 */
const createTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required().messages({
    'string.empty': 'Title cannot be empty',
    'string.max': 'Title cannot exceed 200 characters',
    'any.required': 'Title is required',
  }),
  description: Joi.string().trim().max(2000).allow('', null).optional().messages({
    'string.max': 'Description cannot exceed 2000 characters',
  }),
  dueDate: Joi.date().iso().allow(null).optional().messages({
    'date.format': 'dueDate must be a valid ISO 8601 date string',
  }),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium').optional().messages({
    'any.only': 'Priority must be one of: low, medium, high',
  }),
  category: Joi.string().trim().max(50).allow('', null).optional().messages({
    'string.max': 'Category cannot exceed 50 characters',
  }),
  status: Joi.string().valid('pending', 'completed').default('pending').optional().messages({
    'any.only': 'Status must be one of: pending, completed',
  }),
});

/**
 * Schema for updating an existing todo.
 * All fields are optional (partial update).
 */
const updateTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional().messages({
    'string.empty': 'Title cannot be empty',
    'string.max': 'Title cannot exceed 200 characters',
  }),
  description: Joi.string().trim().max(2000).allow('', null).optional().messages({
    'string.max': 'Description cannot exceed 2000 characters',
  }),
  dueDate: Joi.date().iso().allow(null).optional().messages({
    'date.format': 'dueDate must be a valid ISO 8601 date string',
  }),
  priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
    'any.only': 'Priority must be one of: low, medium, high',
  }),
  category: Joi.string().trim().max(50).allow('', null).optional().messages({
    'string.max': 'Category cannot exceed 50 characters',
  }),
  status: Joi.string().valid('pending', 'completed').optional().messages({
    'any.only': 'Status must be one of: pending, completed',
  }),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

/**
 * Schema for query parameters when listing todos.
 */
const listTodosQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'completed').optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional(),
  category: Joi.string().trim().max(50).optional(),
  search: Joi.string().trim().max(200).optional(),
  dueAfter: Joi.date().iso().optional().messages({
    'date.format': 'dueAfter must be a valid ISO 8601 date string',
  }),
  dueBefore: Joi.date().iso().optional().messages({
    'date.format': 'dueBefore must be a valid ISO 8601 date string',
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'dueDate', 'priority', 'title').default('createdAt').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional(),
});

module.exports = {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
};
