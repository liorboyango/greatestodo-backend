/**
 * Todo Validation Schemas
 *
 * Joi schemas for validating todo-related request bodies and query parameters.
 */

const Joi = require('joi');

/** Valid priority values */
const PRIORITIES = ['low', 'medium', 'high'];

/** Valid status values */
const STATUSES = ['pending', 'completed'];

/**
 * Schema for creating a new todo
 */
const createTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required().messages({
    'string.min': 'Title cannot be empty',
    'string.max': 'Title must not exceed 200 characters',
    'any.required': 'Title is required',
  }),

  description: Joi.string().trim().max(2000).allow('', null).optional().messages({
    'string.max': 'Description must not exceed 2000 characters',
  }),

  dueDate: Joi.alternatives()
    .try(Joi.date().iso(), Joi.valid(null))
    .optional()
    .messages({
      'date.format': 'Due date must be a valid ISO 8601 date',
    }),

  priority: Joi.string()
    .valid(...PRIORITIES)
    .default('medium')
    .messages({
      'any.only': `Priority must be one of: ${PRIORITIES.join(', ')}`,
    }),

  category: Joi.string().trim().max(50).allow('', null).optional().messages({
    'string.max': 'Category must not exceed 50 characters',
  }),

  status: Joi.string()
    .valid(...STATUSES)
    .default('pending')
    .messages({
      'any.only': `Status must be one of: ${STATUSES.join(', ')}`,
    }),
});

/**
 * Schema for updating an existing todo (all fields optional)
 */
const updateTodoSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional().messages({
    'string.min': 'Title cannot be empty',
    'string.max': 'Title must not exceed 200 characters',
  }),

  description: Joi.string().trim().max(2000).allow('', null).optional().messages({
    'string.max': 'Description must not exceed 2000 characters',
  }),

  dueDate: Joi.alternatives()
    .try(Joi.date().iso(), Joi.valid(null))
    .optional()
    .messages({
      'date.format': 'Due date must be a valid ISO 8601 date',
    }),

  priority: Joi.string()
    .valid(...PRIORITIES)
    .optional()
    .messages({
      'any.only': `Priority must be one of: ${PRIORITIES.join(', ')}`,
    }),

  category: Joi.string().trim().max(50).allow('', null).optional().messages({
    'string.max': 'Category must not exceed 50 characters',
  }),

  status: Joi.string()
    .valid(...STATUSES)
    .optional()
    .messages({
      'any.only': `Status must be one of: ${STATUSES.join(', ')}`,
    }),
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided for update',
  });

/**
 * Schema for todo list query parameters
 */
const listTodosQuerySchema = Joi.object({
  status: Joi.string().valid(...STATUSES).optional(),
  priority: Joi.string().valid(...PRIORITIES).optional(),
  category: Joi.string().trim().max(50).optional(),
  search: Joi.string().trim().max(200).optional(),
  dueAfter: Joi.date().iso().optional(),
  dueBefore: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  page: Joi.number().integer().min(1).default(1),
  sortBy: Joi.string().valid('createdAt', 'dueDate', 'priority', 'title').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

/**
 * Validate request body against a Joi schema
 * @param {object} schema - Joi schema
 * @param {object} data - Data to validate
 * @returns {{ value: object, error: object|null }}
 */
function validate(schema, data) {
  return schema.validate(data, { abortEarly: false, stripUnknown: true });
}

module.exports = {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
  validate,
  PRIORITIES,
  STATUSES,
};
