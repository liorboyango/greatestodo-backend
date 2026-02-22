/**
 * Authentication Routes
 *
 * Public routes for user registration and login.
 * No authentication middleware required.
 *
 * POST /api/auth/register
 * POST /api/auth/login
 */

const express = require('express');
const { register, login } = require('../controllers/authController');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * @body    { email: string, password: string }
 * @returns { token: string, user: { uid: string, email: string } }
 */
router.post('/register', register);

/**
 * @route   POST /api/auth/login
 * @desc    Login an existing user
 * @access  Public
 * @body    { email: string, password: string }
 * @returns { token: string, user: { uid: string, email: string } }
 */
router.post('/login', login);

module.exports = router;
