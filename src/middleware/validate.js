/**
 * Validation Middleware
 * Provides reusable middleware factories for validating request body,
 * query parameters, and route parameters using Joi schemas.
 */

const { createError } = require('./errorHandler');

/**
 * Joi validation options — strip unknown fields, abort early = false
 * so all validation errors are returned at once.
 */
const JOI_OPTIONS = {
  abortEarly: false,
  stripUnknown: true,
  convert: true,
};

/**
 * Middleware factory: validates req.body against a Joi schema.
 * On success, replaces req.body with the validated (and coerced) value.
 * On failure, passes a 400 error to next().
 *
 * @param {import('joi').Schema} schema - Joi schema to validate against
 * @returns {import('express').RequestHandler}
 */
const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, JOI_OPTIONS);
  if (error) {
    const messages = error.details.map((d) => d.message).join('; ');
    return next(createError(messages, 400));
  }
  req.body = value;
  next();
};

/**
 * Middleware factory: validates req.query against a Joi schema.
 * On success, replaces req.query with the validated (and coerced) value.
 * On failure, passes a 400 error to next().
 *
 * @param {import('joi').Schema} schema - Joi schema to validate against
 * @returns {import('express').RequestHandler}
 */
const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, JOI_OPTIONS);
  if (error) {
    const messages = error.details.map((d) => d.message).join('; ');
    return next(createError(messages, 400));
  }
  req.query = value;
  next();
};

/**
 * Middleware factory: validates req.params against a Joi schema.
 * On success, replaces req.params with the validated (and coerced) value.
 * On failure, passes a 400 error to next().
 *
 * @param {import('joi').Schema} schema - Joi schema to validate against
 * @returns {import('express').RequestHandler}
 */
const validateParams = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.params, JOI_OPTIONS);
  if (error) {
    const messages = error.details.map((d) => d.message).join('; ');
    return next(createError(messages, 400));
  }
  req.params = value;
  next();
};

module.exports = { validateBody, validateQuery, validateParams };
