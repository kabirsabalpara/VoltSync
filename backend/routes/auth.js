const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const { JWT_SECRET } = require('../config/jwt');
const authMiddleware = require('../middleware/auth');
const { loginRateLimiter } = require('../middleware/rateLimiter');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidPassword = (password) => {
  if (!password || typeof password !== 'string' || password.length < 8) {
    return false;
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasNumber && hasSpecial;
};

// 1. POST /api/auth/signup - Register new driver (Public signup forces driver role)
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone, evModel } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const cleanName = String(name).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    if (!cleanName) {
      return res.status(400).json({ error: 'Valid name is required.' });
    }

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.'
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password with bcrypt salt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Public signup is strictly locked to driver role
    const user = new User({
      name: cleanName,
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone ? String(phone).trim() : '',
      evModel: evModel ? String(evModel).trim() : 'Tata Nexon EV Max',
      role: 'driver'
    });

    await user.save();

    // Generate standard JWT signed with secret
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        evModel: user.evModel,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. POST /api/auth/login - Authenticate user with rate limiting and secure password hash verification
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate standard JWT signed with secret
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        evModel: user.evModel,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. GET /api/auth/me - Fetch currently authenticated user session
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({ success: false, error: 'Invalid authentication session.' });
    }

    const user = await User.findOne({ email: req.user.email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        evModel: user.evModel,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

