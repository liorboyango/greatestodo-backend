/**
 * Auth Joi Validation Schemas
 * Validates request bodies for registration and login endpoints.
 */

const Joi = require('joi');

/**
 * Schema for user registration.
 * - email: valid email format, required
 * - password: min 8 chars, at least one uppercase, one lowercase, one digit, required
 */
const registerSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    'string.email': 'Please provide a valid email address.',
    'any.required': 'Email is required.',
    'string.empty': 'Email cannot be empty.',
  }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long.',
      'string.max': 'Password must not exceed 128 characters.',
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, and one number.',
      'any.required': 'Password is required.',
      'string.empty': 'Password cannot be empty.',
    }),
});

/**
 * Schema for user login.
 * - email: valid email format, required
 * - password: required (no strength check on login)
 */
const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    'string.email': 'Please provide a valid email address.',
    'any.required': 'Email is required.',
    'string.empty': 'Email cannot be empty.',
  }),
  password: Joi.string().min(1).max(128).required().messages({
    'any.required': 'Password is required.',
    'string.empty': 'Password cannot be empty.',
  }),
});

module.exports = { registerSchema, loginSchema };
