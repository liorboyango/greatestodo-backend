/**
 * Auth Validation Schemas (Joi)
 * Validates request bodies for registration and login endpoints.
 */

const Joi = require('joi');

/**
 * Schema for POST /api/auth/register
 * - email: valid email format, required
 * - password: minimum 6 characters (Firebase minimum), required
 */
const registerSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(254)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address.',
      'string.max': 'Email must not exceed 254 characters.',
      'any.required': 'Email is required.',
      'string.empty': 'Email is required.',
    }),

  password: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      'string.min': 'Password must be at least 6 characters.',
      'string.max': 'Password must not exceed 128 characters.',
      'any.required': 'Password is required.',
      'string.empty': 'Password is required.',
    }),
});

/**
 * Schema for POST /api/auth/login
 * - email: valid email format, required
 * - password: required (no length restriction for login)
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(254)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address.',
      'any.required': 'Email is required.',
      'string.empty': 'Email is required.',
    }),

  password: Joi.string()
    .min(1)
    .max(128)
    .required()
    .messages({
      'any.required': 'Password is required.',
      'string.empty': 'Password is required.',
    }),
});

module.exports = { registerSchema, loginSchema };
