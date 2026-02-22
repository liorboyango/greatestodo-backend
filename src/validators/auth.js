/**
 * Auth Validation Schemas (Joi)
 * Validates request bodies for authentication endpoints.
 */

const Joi = require('joi');

/**
 * Schema for POST /api/auth/register
 */
const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must be at most 128 characters long',
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'Password is required',
    }),
}).options({ allowUnknown: false });

/**
 * Schema for POST /api/auth/login
 */
const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(1).required().messages({
    'any.required': 'Password is required',
    'string.empty': 'Password cannot be empty',
  }),
}).options({ allowUnknown: false });

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

const validateRegister = validateBody(registerSchema);
const validateLogin = validateBody(loginSchema);

module.exports = {
  validateRegister,
  validateLogin,
  registerSchema,
  loginSchema,
};
