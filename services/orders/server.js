const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3003;

// Service URLs
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://users:3002';
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://catalog:3001';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payments:3004';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/ecommerce_orders'
});

// Redis connection for cart storage and message queue
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
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        total_amount DECIMAL(10,2) NOT NULL,
        shipping_address JSONB NOT NULL,
        billing_address JSONB,
        payment_id VARCHAR(255),
        payment_status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        product_image VARCHAR(500),
        price DECIMAL(10,2) NOT NULL,
        quantity INTEGER NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');

    console.log('Orders database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Helper functions
async function verifyUser(userId) {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/api/internal/users/${userId}/verify`, {
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.error('User verification error:', error);
    return null;
  }
}

async function getProductDetails(productId) {
  try {
    const response = await axios.get(`${CATALOG_SERVICE_URL}/api/products/${productId}`, {
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.error('Product fetch error:', error);
    return null;
  }
}

async function updateProductStock(productId, quantity) {
  try {
    await axios.patch(`${CATALOG_SERVICE_URL}/api/products/${productId}/stock`, {
      quantity: -quantity // Reduce stock
    }, { timeout: 5000 });
    return true;
  } catch (error) {
    console.error('Stock update error:', error);
    return false;
  }
}

async function processPayment(paymentData) {
  try {
    const response = await axios.post(`${PAYMENT_SERVICE_URL}/api/payments/process`, paymentData, {
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    console.error('Payment processing error:', error);
    return null;
  }
}

// Simple auth middleware (expects user ID in header for demo)
async function authenticateUser(req, res, next) {
  const userId = req.headers['x-user-id'];
  
  if (!userId) {
    return res.status(401).json({ error: 'User ID required in x-user-id header' });
  }

  const user = await verifyUser(userId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid user' });
  }

  req.user = user;
  next();
}

// Cart management functions
async function getCartKey(userId) {
  return `cart:${userId}`;
}

async function getCart(userId) {
  try {
    const cartData = await redisClient.get(await getCartKey(userId));
    return cartData ? JSON.parse(cartData) : { items: [], total: 0 };
  } catch (error) {
    console.error('Cart fetch error:', error);
    return { items: [], total: 0 };
  }
}

async function saveCart(userId, cart) {
  try {
    await redisClient.setEx(await getCartKey(userId), 3600, JSON.stringify(cart)); // 1 hour expiry
  } catch (error) {
    console.error('Cart save error:', error);
  }
}

async function calculateCartTotal(items) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return Math.round(total * 100) / 100; // Round to 2 decimal places
}

// Message queue functions
async function publishOrderEvent(eventType, orderData) {
  try {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: orderData
    };
    await redisClient.lPush('order_events', JSON.stringify(event));
    console.log(`Published event: ${eventType} for order ${orderData.order_number}`);
  } catch (error) {
    console.error('Event publishing error:', error);
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'orders-service', timestamp: new Date().toISOString() });
});

// Get user's cart
app.get('/api/cart', authenticateUser, async (req, res) => {
  try {
    const cart = await getCart(req.user.id);
    res.json(cart);
  } catch (error) {
    console.error('Cart fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to cart
app.post('/api/cart/items', authenticateUser, async (req, res) => {
  try {
    const { product_id, quantity = 1 } = req.body;

    if (!product_id || quantity <= 0) {
      return res.status(400).json({ error: 'Valid product_id and quantity required' });
    }

    // Get product details
    const product = await getProductDetails(product_id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.stock_quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    // Get current cart
    const cart = await getCart(req.user.id);

    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(item => item.product_id === product_id);

    if (existingItemIndex >= 0) {
      // Update quantity
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].total = cart.items[existingItemIndex].price * cart.items[existingItemIndex].quantity;
    } else {
      // Add new item
      cart.items.push({
        product_id: product.id,
        name: product.name,
        image_url: product.image_url,
        price: parseFloat(product.price),
        quantity,
        total: parseFloat(product.price) * quantity
      });
    }

    cart.total = await calculateCartTotal(cart.items);
    await saveCart(req.user.id, cart);

    res.json({
      message: 'Item added to cart',
      cart
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cart item quantity
app.put('/api/cart/items/:productId', authenticateUser, async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    const cart = await getCart(req.user.id);
    const itemIndex = cart.items.findIndex(item => item.product_id == productId);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found in cart' });
    }

    // Verify stock availability
    const product = await getProductDetails(productId);
    if (!product || product.stock_quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].total = cart.items[itemIndex].price * quantity;
    cart.total = await calculateCartTotal(cart.items);

    await saveCart(req.user.id, cart);

    res.json({
      message: 'Cart updated',
      cart
    });
  } catch (error) {
    console.error('Cart update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
app.delete('/api/cart/items/:productId', authenticateUser, async (req, res) => {
  try {
    const { productId } = req.params;
    const cart = await getCart(req.user.id);

    cart.items = cart.items.filter(item => item.product_id != productId);
    cart.total = await calculateCartTotal(cart.items);

    await saveCart(req.user.id, cart);

    res.json({
      message: 'Item removed from cart',
      cart
    });
  } catch (error) {
    console.error('Cart item removal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear cart
app.delete('/api/cart', authenticateUser, async (req, res) => {
  try {
    await redisClient.del(await getCartKey(req.user.id));
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Cart clear error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Checkout - Create order
app.post('/api/orders/checkout', authenticateUser, async (req, res) => {
  try {
    const { shipping_address, billing_address, payment_method = 'card' } = req.body;

    if (!shipping_address) {
      return res.status(400).json({ error: 'Shipping address required' });
    }

    // Get cart
    const cart = await getCart(req.user.id);
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Verify stock for all items
    for (const item of cart.items) {
      const product = await getProductDetails(item.product_id);
      if (!product || product.stock_quantity < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${item.name}. Available: ${product?.stock_quantity || 0}` 
        });
      }
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Create order
    const orderResult = await pool.query(
      `INSERT INTO orders (order_number, user_id, total_amount, shipping_address, billing_address, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [orderNumber, req.user.id, cart.total, JSON.stringify(shipping_address), JSON.stringify(billing_address || shipping_address)]
    );

    const order = orderResult.rows[0];

    // Create order items
    for (const item of cart.items) {
      await pool.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, total) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, item.product_id, item.name, item.image_url, item.price, item.quantity, item.total]
      );
    }

    // Process payment
    const paymentData = {
      order_id: order.id,
      order_number: orderNumber,
      amount: cart.total,
      currency: 'USD',
      payment_method,
      user_id: req.user.id
    };

    const paymentResult = await processPayment(paymentData);
    
    if (paymentResult && paymentResult.status === 'success') {
      // Update order with payment info
      await pool.query(
        'UPDATE orders SET payment_id = $1, payment_status = $2, status = $3 WHERE id = $4',
        [paymentResult.payment_id, 'completed', 'confirmed', order.id]
      );

      // Update product stocks
      for (const item of cart.items) {
        await updateProductStock(item.product_id, item.quantity);
      }

      // Clear cart
      await redisClient.del(await getCartKey(req.user.id));

      // Publish order event
      await publishOrderEvent('order_created', {
        order_id: order.id,
        order_number: orderNumber,
        user_id: req.user.id,
        total: cart.total,
        status: 'confirmed'
      });

      res.status(201).json({
        message: 'Order placed successfully',
        order: {
          ...order,
          payment_id: paymentResult.payment_id,
          payment_status: 'completed',
          status: 'confirmed'
        }
      });
    } else {
      // Payment failed
      await pool.query(
        'UPDATE orders SET payment_status = $1, status = $2 WHERE id = $3',
        ['failed', 'cancelled', order.id]
      );

      res.status(400).json({
        error: 'Payment failed',
        order_number: orderNumber,
        message: paymentResult?.message || 'Payment processing error'
      });
    }
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's orders
app.get('/api/orders', authenticateUser, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const ordersResult = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const orders = [];
    for (const order of ordersResult.rows) {
      const itemsResult = await pool.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      );
      
      orders.push({
        ...order,
        items: itemsResult.rows
      });
    }

    const totalResult = await pool.query('SELECT COUNT(*) FROM orders WHERE user_id = $1', [req.user.id]);

    res.json({
      orders,
      total: parseInt(totalResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / limit)
    });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific order
app.get('/api/orders/:orderNumber', authenticateUser, async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE order_number = $1 AND user_id = $2',
      [orderNumber, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const itemsResult = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [order.id]
    );

    res.json({
      ...order,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Order fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel order (if not yet shipped)
app.patch('/api/orders/:orderNumber/cancel', authenticateUser, async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE order_number = $1 AND user_id = $2',
      [orderNumber, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'Order cannot be cancelled' });
    }

    // Update order status
    await pool.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['cancelled', order.id]
    );

    // Restore product stock
    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    for (const item of itemsResult.rows) {
      await axios.patch(`${CATALOG_SERVICE_URL}/api/products/${item.product_id}/stock`, {
        quantity: item.quantity // Add back to stock
      }, { timeout: 5000 });
    }

    // Publish cancellation event
    await publishOrderEvent('order_cancelled', {
      order_id: order.id,
      order_number: orderNumber,
      user_id: req.user.id
    });

    res.json({ message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Order cancellation error:', error);
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
      console.log(`Orders service running on port ${PORT}`);
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