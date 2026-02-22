/**
 * Auth Routes
 *
 * POST /api/auth/register — Register a new user
 * POST /api/auth/login    — Login an existing user
 *
 * Validation is applied via Joi middleware before reaching controllers.
 */

const express = require('express');
const router = express.Router();

const { registerSchema, loginSchema } = require('../validators/auth');
const { validateBody } = require('../middleware/validate');
const authController = require('../controllers/authController');

/**
 * POST /api/auth/register
 * Body: { email: string, password: string }
 * Response: { token: string, user: { uid: string, email: string } }
 */
router.post(
  '/register',
  validateBody(registerSchema),
  authController.register
);

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 * Response: { token: string, user: { uid: string, email: string } }
 */
router.post(
  '/login',
  validateBody(loginSchema),
  authController.login
);

module.exports = router;
