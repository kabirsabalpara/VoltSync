const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const { JWT_SECRET } = require('../config/jwt');
const authMiddleware = require('../middleware/auth');

// 1. POST /api/auth/signup - Register new user
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone, evModel } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      evModel: evModel || 'Tata Nexon EV Max',
      role: 'driver' // public signup always creates a driver account
    });

    await user.save();

    // Generate standard JWT signed with secret
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
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
    res.status(500).json({ error: error.message });
  }
});

// 2. POST /api/auth/login - Authenticate user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    // Allow instant demo logins for testing
    if (!user) {
      const salt = await bcrypt.genSalt(10);
      if (email.toLowerCase() === 'driver@example.com') {
        const hashedPassword = await bcrypt.hash(password || 'driver123', salt);
        user = await User.create({
          name: 'Alex Driver',
          email: 'driver@example.com',
          password: hashedPassword,
          evModel: 'Tata Nexon EV Max',
          role: 'driver'
        });
      } else if (email.toLowerCase() === 'operator@example.com') {
        const hashedPassword = await bcrypt.hash(password || 'operator123', salt);
        user = await User.create({
          name: 'Sam Operator',
          email: 'operator@example.com',
          password: hashedPassword,
          evModel: 'Hyundai Ioniq 5',
          role: 'operator'
        });
      } else {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
    } else {
      const isMatch = await bcrypt.compare(password, user.password);
      const isLegacyMatch = !isMatch && user.password === password;
      if (!isMatch && !isLegacyMatch) {
        return res.status(401).json({ error: 'Invalid password.' });
      }
    }

    // Generate standard JWT signed with secret
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
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
    res.status(500).json({ error: error.message });
  }
});

// 3. GET /api/auth/me - Fetch current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
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
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
