/**
 * Auth Routes
 * Public endpoints for user registration and login.
 *
 * POST /api/auth/register  - Create a new user account
 * POST /api/auth/login     - Authenticate and receive a token
 */

const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../validators/auth');

/**
 * POST /api/auth/register
 * Body: { email: string, password: string }
 * Response: { token: string, user: { uid, email } }
 */
router.post('/register', validateRegister, register);

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 * Response: { token: string, refreshToken: string, expiresIn: string, user: { uid, email } }
 */
router.post('/login', validateLogin, login);

module.exports = router;
