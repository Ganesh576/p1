const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/ecommerce_catalog'
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        image_url VARCHAR(500),
        stock_quantity INTEGER DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0,
        reviews_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin(to_tsvector(\'english\', name))');
    
    console.log('Database initialized successfully');
    await seedData();
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Seed data
async function seedData() {
  try {
    // Check if data already exists
    const existingProducts = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(existingProducts.rows[0].count) > 0) {
      console.log('Seed data already exists');
      return;
    }

    // Insert categories
    const categories = [
      { name: 'Electronics', description: 'Electronic devices and gadgets' },
      { name: 'Clothing', description: 'Fashion and apparel' },
      { name: 'Books', description: 'Books and literature' },
      { name: 'Home & Garden', description: 'Home improvement and garden supplies' }
    ];

    for (const category of categories) {
      await pool.query(
        'INSERT INTO categories (name, description) VALUES ($1, $2)',
        [category.name, category.description]
      );
    }

    // Insert products
    const products = [
      {
        name: 'iPhone 15 Pro Max',
        description: 'Latest iPhone with titanium design and A17 Pro chip',
        price: 1199.99,
        category_id: 1,
        image_url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500',
        stock_quantity: 50,
        rating: 4.8,
        reviews_count: 1250
      },
      {
        name: 'Samsung Galaxy S24 Ultra',
        description: 'Premium Android smartphone with S Pen',
        price: 1299.99,
        category_id: 1,
        image_url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=500',
        stock_quantity: 30,
        rating: 4.7,
        reviews_count: 890
      },
      {
        name: 'MacBook Pro 14"',
        description: 'Apple MacBook Pro with M3 chip',
        price: 1999.99,
        category_id: 1,
        image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500',
        stock_quantity: 25,
        rating: 4.9,
        reviews_count: 567
      },
      {
        name: 'Nike Air Max 270',
        description: 'Comfortable running shoes with Max Air cushioning',
        price: 150.00,
        category_id: 2,
        image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500',
        stock_quantity: 100,
        rating: 4.5,
        reviews_count: 2340
      },
      {
        name: 'Levi\'s 501 Original Jeans',
        description: 'Classic straight fit jeans',
        price: 89.99,
        category_id: 2,
        image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500',
        stock_quantity: 75,
        rating: 4.3,
        reviews_count: 1890
      },
      {
        name: 'The Psychology of Money',
        description: 'Timeless lessons on wealth, greed, and happiness',
        price: 16.99,
        category_id: 3,
        image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500',
        stock_quantity: 200,
        rating: 4.6,
        reviews_count: 3456
      },
      {
        name: 'Atomic Habits',
        description: 'An Easy & Proven Way to Build Good Habits',
        price: 18.99,
        category_id: 3,
        image_url: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=500',
        stock_quantity: 150,
        rating: 4.8,
        reviews_count: 4567
      },
      {
        name: 'Dyson V15 Detect',
        description: 'Cordless vacuum with laser dust detection',
        price: 749.99,
        category_id: 4,
        image_url: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=500',
        stock_quantity: 20,
        rating: 4.4,
        reviews_count: 678
      },
      {
        name: 'Instant Pot Duo 7-in-1',
        description: 'Electric pressure cooker, slow cooker, rice cooker',
        price: 99.95,
        category_id: 4,
        image_url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=500',
        stock_quantity: 40,
        rating: 4.7,
        reviews_count: 8901
      },
      {
        name: 'KitchenAid Stand Mixer',
        description: 'Professional 5-quart stand mixer',
        price: 379.99,
        category_id: 4,
        image_url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500',
        stock_quantity: 15,
        rating: 4.9,
        reviews_count: 2345
      }
    ];

    for (const product of products) {
      await pool.query(
        `INSERT INTO products (name, description, price, category_id, image_url, stock_quantity, rating, reviews_count) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [product.name, product.description, product.price, product.category_id, 
         product.image_url, product.stock_quantity, product.rating, product.reviews_count]
      );
    }

    console.log('Seed data inserted successfully');
  } catch (error) {
    console.error('Error seeding data:', error);
  }
}

// Cache helper functions
async function getCachedData(key) {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

async function setCachedData(key, data, expireSeconds = 300) {
  try {
    await redisClient.setEx(key, expireSeconds, JSON.stringify(data));
  } catch (error) {
    console.error('Redis set error:', error);
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'catalog-service', timestamp: new Date().toISOString() });
});

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const cacheKey = 'categories:all';
    let categories = await getCachedData(cacheKey);
    
    if (!categories) {
      const result = await pool.query('SELECT * FROM categories ORDER BY name');
      categories = result.rows;
      await setCachedData(cacheKey, categories, 3600); // Cache for 1 hour
    }
    
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all products with pagination and filtering
app.get('/api/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, sort = 'created_at', order = 'DESC' } = req.query;
    const offset = (page - 1) * limit;
    
    const cacheKey = `products:${page}:${limit}:${category || 'all'}:${search || 'none'}:${sort}:${order}`;
    let cachedResult = await getCachedData(cacheKey);
    
    if (cachedResult) {
      return res.json(cachedResult);
    }

    let query = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE 1=1
    `;
    let countQuery = 'SELECT COUNT(*) FROM products p WHERE 1=1';
    let params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND p.category_id = $${paramIndex}`;
      countQuery += ` AND p.category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      countQuery += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Add sorting
    const validSortFields = ['name', 'price', 'rating', 'created_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY p.${sortField} ${sortOrder}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const [productsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
    ]);

    const result = {
      products: productsResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };

    await setCachedData(cacheKey, result, 180); // Cache for 3 minutes
    res.json(result);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `product:${id}`;
    
    let product = await getCachedData(cacheKey);
    
    if (!product) {
      const result = await pool.query(`
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      product = result.rows[0];
      await setCachedData(cacheKey, product, 600); // Cache for 10 minutes
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search products
app.get('/api/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.json({ products: [], total: 0 });
    }
    
    const cacheKey = `search:${q}:${limit}`;
    let cachedResult = await getCachedData(cacheKey);
    
    if (cachedResult) {
      return res.json(cachedResult);
    }

    const result = await pool.query(`
      SELECT p.*, c.name as category_name,
             ts_rank(to_tsvector('english', p.name || ' ' || p.description), plainto_tsquery('english', $1)) as rank
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE to_tsvector('english', p.name || ' ' || p.description) @@ plainto_tsquery('english', $1)
         OR p.name ILIKE $2 
         OR p.description ILIKE $2
      ORDER BY rank DESC, p.rating DESC
      LIMIT $3
    `, [q, `%${q}%`, limit]);

    const searchResult = {
      products: result.rows,
      total: result.rows.length,
      query: q
    };

    await setCachedData(cacheKey, searchResult, 300); // Cache for 5 minutes
    res.json(searchResult);
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product stock (for order processing)
app.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    
    if (typeof quantity !== 'number') {
      return res.status(400).json({ error: 'Quantity must be a number' });
    }

    const result = await pool.query(
      'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [quantity, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Invalidate cache
    await redisClient.del(`product:${id}`);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get featured products (high rating, good stock)
app.get('/api/featured', async (req, res) => {
  try {
    const cacheKey = 'featured:products';
    let featured = await getCachedData(cacheKey);
    
    if (!featured) {
      const result = await pool.query(`
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.rating >= 4.5 AND p.stock_quantity > 0
        ORDER BY p.rating DESC, p.reviews_count DESC
        LIMIT 8
      `);
      
      featured = result.rows;
      await setCachedData(cacheKey, featured, 1800); // Cache for 30 minutes
    }
    
    res.json(featured);
  } catch (error) {
    console.error('Error fetching featured products:', error);
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
      console.log(`Catalog service running on port ${PORT}`);
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