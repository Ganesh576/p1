const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3002;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/ecommerce_users'
});

// Redis connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Rate limiting - stricter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth
  message: { error: 'Too many authentication attempts, please try again later' }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/auth', authLimiter);
app.use(generalLimiter);

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        is_verified BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(20) DEFAULT 'shipping', -- shipping, billing
        street_address VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20) NOT NULL,
        country VARCHAR(100) DEFAULT 'US',
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id)');

    console.log('User database initialized successfully');
    await seedUsers();
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Seed demo users
async function seedUsers() {
  try {
    const existingUsers = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(existingUsers.rows[0].count) > 0) {
      console.log('Demo users already exist');
      return;
    }

    const demoUsers = [
      {
        email: 'demo@example.com',
        password: 'password123',
        first_name: 'Demo',
        last_name: 'User',
        phone: '+1234567890',
        is_verified: true
      },
      {
        email: 'admin@example.com',
        password: 'admin123',
        first_name: 'Admin',
        last_name: 'User',
        phone: '+1987654321',
        is_verified: true
      }
    ];

    for (const user of demoUsers) {
      const hashedPassword = await bcrypt.hash(user.password, 12);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, is_verified) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [user.email, hashedPassword, user.first_name, user.last_name, user.phone, user.is_verified]
      );

      // Add default address
      await pool.query(
        `INSERT INTO user_addresses (user_id, street_address, city, state, postal_code, is_default) 
         VALUES ($1, $2, $3, $4, $5, true)`,
        [result.rows[0].id, '123 Demo Street', 'Demo City', 'Demo State', '12345']
      );
    }

    console.log('Demo users created successfully');
  } catch (error) {
    console.error('Error seeding users:', error);
  }
}

// Helper functions
async function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
  
  // Store refresh token in Redis
  await redisClient.setEx(`refresh_token:${userId}`, 7 * 24 * 60 * 60, refreshToken); // 7 days
  
  return { accessToken, refreshToken };
}

async function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

async function getUserFromCache(userId) {
  try {
    const cachedUser = await redisClient.get(`user:${userId}`);
    return cachedUser ? JSON.parse(cachedUser) : null;
  } catch (error) {
    return null;
  }
}

async function cacheUser(user) {
  try {
    const userToCache = { ...user };
    delete userToCache.password_hash; // Never cache password hash
    await redisClient.setEx(`user:${user.id}`, 900, JSON.stringify(userToCache)); // 15 minutes
  } catch (error) {
    console.error('Cache error:', error);
  }
}

// Auth middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = await verifyToken(token);
    
    // Check if user is cached
    let user = await getUserFromCache(decoded.userId);
    
    if (!user) {
      const result = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found or inactive' });
      }
      user = result.rows[0];
      await cacheUser(user);
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Validation middleware
const validateRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('first_name').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('last_name').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('phone').optional().isMobilePhone()
];

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 }).withMessage('Password is required')
];

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'users-service', timestamp: new Date().toISOString() });
});

// User registration
app.post('/api/auth/register', validateRegistration, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, first_name, last_name, phone } = req.body;

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, phone, created_at`,
      [email, hashedPassword, first_name, last_name, phone]
    );

    const newUser = result.rows[0];
    
    // Generate tokens
    const tokens = await generateTokens(newUser.id);

    // Cache user
    await cacheUser({ ...newUser, id: newUser.id });

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser,
      ...tokens
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User login
app.post('/api/auth/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Get user
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const tokens = await generateTokens(user.id);

    // Cache user
    await cacheUser(user);

    // Remove password hash from response
    delete user.password_hash;

    res.json({
      message: 'Login successful',
      user,
      ...tokens
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = await verifyToken(refreshToken);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check if refresh token exists in Redis
    const storedToken = await redisClient.get(`refresh_token:${decoded.userId}`);
    if (storedToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Generate new tokens
    const tokens = await generateTokens(decoded.userId);

    res.json(tokens);
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Remove refresh token from Redis
    await redisClient.del(`refresh_token:${userId}`);
    
    // Remove user from cache
    await redisClient.del(`user:${userId}`);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const user = { ...req.user };
    delete user.password_hash;

    // Get user addresses
    const addresses = await pool.query('SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC', [user.id]);
    user.addresses = addresses.rows;

    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, [
  body('first_name').optional().trim().isLength({ min: 1 }),
  body('last_name').optional().trim().isLength({ min: 1 }),
  body('phone').optional().isMobilePhone()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { first_name, last_name, phone } = req.body;

    const result = await pool.query(
      `UPDATE users SET first_name = COALESCE($1, first_name), 
       last_name = COALESCE($2, last_name), 
       phone = COALESCE($3, phone), 
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4 RETURNING id, email, first_name, last_name, phone, updated_at`,
      [first_name, last_name, phone, userId]
    );

    // Update cache
    await cacheUser(result.rows[0]);

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add user address
app.post('/api/users/addresses', authenticateToken, [
  body('street_address').trim().isLength({ min: 1 }).withMessage('Street address is required'),
  body('city').trim().isLength({ min: 1 }).withMessage('City is required'),
  body('state').trim().isLength({ min: 1 }).withMessage('State is required'),
  body('postal_code').trim().isLength({ min: 1 }).withMessage('Postal code is required'),
  body('country').optional().trim().isLength({ min: 1 }),
  body('type').optional().isIn(['shipping', 'billing'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { street_address, city, state, postal_code, country = 'US', type = 'shipping', is_default = false } = req.body;

    // If this is set as default, unset other defaults
    if (is_default) {
      await pool.query('UPDATE user_addresses SET is_default = false WHERE user_id = $1', [userId]);
    }

    const result = await pool.query(
      `INSERT INTO user_addresses (user_id, street_address, city, state, postal_code, country, type, is_default) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, street_address, city, state, postal_code, country, type, is_default]
    );

    res.status(201).json({
      message: 'Address added successfully',
      address: result.rows[0]
    });
  } catch (error) {
    console.error('Address creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user addresses
app.get('/api/users/addresses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query('SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC', [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Address fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify user (internal endpoint for other services)
app.get('/api/internal/users/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    
    let user = await getUserFromCache(id);
    
    if (!user) {
      const result = await pool.query('SELECT id, email, first_name, last_name, is_active FROM users WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      user = result.rows[0];
      await cacheUser(user);
    }

    if (!user.is_active) {
      return res.status(400).json({ error: 'User is inactive' });
    }

    res.json(user);
  } catch (error) {
    console.error('User verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Users service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  await redisClient.quit();
  process.exit(0);
});