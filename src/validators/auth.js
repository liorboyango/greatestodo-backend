/**
 * Authentication Validation Schemas
 *
 * Joi schemas for validating auth-related request bodies.
 */

const Joi = require('joi');

/**
 * Schema for user registration
 * Validates email format and password strength
 */
const registerSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(254)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email must not exceed 254 characters',
      'any.required': 'Email is required',
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'password strength')
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.name':
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'Password is required',
    }),
});

/**
 * Schema for user login
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(254)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),

  password: Joi.string().min(1).max(128).required().messages({
    'string.min': 'Password is required',
    'any.required': 'Password is required',
  }),
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

module.exports = { registerSchema, loginSchema, validate };
