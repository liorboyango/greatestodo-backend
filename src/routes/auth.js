/**
 * Auth Router
 *
 * Public routes for user registration and login.
 * No authentication middleware required.
 *
 * Routes:
 *   POST /api/auth/register  - Register a new user
 *   POST /api/auth/login     - Login an existing user
 */

const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public
 * @body    { email: string, password: string }
 */
router.post('/register', register);

/**
 * @route   POST /api/auth/login
 * @desc    Login with email and password
 * @access  Public
 * @body    { email: string, password: string }
 */
router.post('/login', login);

module.exports = router;
