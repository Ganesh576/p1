const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3004;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/ecommerce_payments'
});

// Redis connection for message queue
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
  max: 50 // limit each IP to 50 requests per windowMs (stricter for payments)
});
app.use(limiter);

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        payment_id VARCHAR(255) UNIQUE NOT NULL,
        order_id INTEGER NOT NULL,
        order_number VARCHAR(50) NOT NULL,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        payment_method VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        gateway_response JSONB,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type VARCHAR(20) NOT NULL, -- card, paypal, etc.
        card_last_four VARCHAR(4),
        card_brand VARCHAR(20),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)');

    console.log('Payments database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Mock payment gateway functions
function mockPaymentGateway(paymentData) {
  return new Promise((resolve) => {
    // Simulate processing delay
    setTimeout(() => {
      const { amount, payment_method } = paymentData;
      
      // Mock different scenarios based on amount
      if (amount > 10000) {
        // High amount - require manual review
        resolve({
          status: 'pending_review',
          transaction_id: `txn_${uuidv4()}`,
          message: 'Payment requires manual review due to high amount',
          gateway_response: {
            code: 'HIGH_AMOUNT_REVIEW',
            processor: 'MockGateway'
          }
        });
      } else if (amount < 1) {
        // Invalid amount
        resolve({
          status: 'failed',
          transaction_id: null,
          message: 'Invalid payment amount',
          gateway_response: {
            code: 'INVALID_AMOUNT',
            processor: 'MockGateway'
          }
        });
      } else if (payment_method === 'card' && Math.random() > 0.95) {
        // 5% chance of card decline
        resolve({
          status: 'failed',
          transaction_id: null,
          message: 'Card declined by issuer',
          gateway_response: {
            code: 'CARD_DECLINED',
            processor: 'MockGateway'
          }
        });
      } else {
        // Successful payment
        resolve({
          status: 'success',
          transaction_id: `txn_${uuidv4()}`,
          message: 'Payment processed successfully',
          gateway_response: {
            code: 'SUCCESS',
            processor: 'MockGateway',
            auth_code: Math.random().toString(36).substr(2, 8).toUpperCase()
          }
        });
      }
    }, Math.random() * 2000 + 500); // Random delay between 500ms - 2.5s
  });
}

// Message queue functions
async function publishPaymentEvent(eventType, paymentData) {
  try {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: paymentData
    };
    await redisClient.lPush('payment_events', JSON.stringify(event));
    console.log(`Published payment event: ${eventType} for payment ${paymentData.payment_id}`);
  } catch (error) {
    console.error('Event publishing error:', error);
  }
}

// Background payment processor
async function processAsyncPayments() {
  try {
    // Get pending payments older than 1 minute
    const pendingPayments = await pool.query(`
      SELECT * FROM payments 
      WHERE status = 'pending' 
      AND created_at < NOW() - INTERVAL '1 minute'
      LIMIT 10
    `);

    for (const payment of pendingPayments.rows) {
      console.log(`Processing async payment: ${payment.payment_id}`);
      
      const gatewayResult = await mockPaymentGateway({
        amount: parseFloat(payment.amount),
        payment_method: payment.payment_method,
        currency: payment.currency
      });

      // Update payment status
      await pool.query(
        `UPDATE payments SET 
         status = $1, 
         gateway_response = $2, 
         processed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [gatewayResult.status, JSON.stringify(gatewayResult.gateway_response), payment.id]
      );

      // Publish event
      await publishPaymentEvent('payment_processed', {
        payment_id: payment.payment_id,
        order_id: payment.order_id,
        order_number: payment.order_number,
        user_id: payment.user_id,
        status: gatewayResult.status,
        amount: payment.amount
      });
    }
  } catch (error) {
    console.error('Async payment processing error:', error);
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'payments-service', timestamp: new Date().toISOString() });
});

// Process payment
app.post('/api/payments/process', async (req, res) => {
  try {
    const { 
      order_id, 
      order_number, 
      user_id, 
      amount, 
      currency = 'USD', 
      payment_method = 'card' 
    } = req.body;

    // Validate required fields
    if (!order_id || !order_number || !user_id || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: order_id, order_number, user_id, amount' 
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    // Generate payment ID
    const paymentId = `pay_${Date.now()}_${uuidv4().substr(0, 8)}`;

    // Store payment record
    const paymentResult = await pool.query(
      `INSERT INTO payments (payment_id, order_id, order_number, user_id, amount, currency, payment_method, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing') RETURNING *`,
      [paymentId, order_id, order_number, user_id, amount, currency, payment_method]
    );

    const payment = paymentResult.rows[0];

    // Process payment through mock gateway
    const gatewayResult = await mockPaymentGateway({
      amount: parseFloat(amount),
      payment_method,
      currency
    });

    // Update payment with gateway response
    await pool.query(
      `UPDATE payments SET 
       status = $1, 
       gateway_response = $2, 
       processed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [gatewayResult.status, JSON.stringify(gatewayResult.gateway_response), payment.id]
    );

    // Publish payment event
    await publishPaymentEvent('payment_initiated', {
      payment_id: paymentId,
      order_id,
      order_number,
      user_id,
      status: gatewayResult.status,
      amount
    });

    // Return response based on gateway result
    if (gatewayResult.status === 'success') {
      res.json({
        status: 'success',
        payment_id: paymentId,
        transaction_id: gatewayResult.transaction_id,
        message: gatewayResult.message,
        amount,
        currency
      });
    } else if (gatewayResult.status === 'pending_review') {
      res.json({
        status: 'pending_review',
        payment_id: paymentId,
        message: gatewayResult.message,
        amount,
        currency
      });
    } else {
      res.status(400).json({
        status: 'failed',
        payment_id: paymentId,
        message: gatewayResult.message,
        error: 'Payment processing failed'
      });
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payment status
app.get('/api/payments/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;

    const result = await pool.query('SELECT * FROM payments WHERE payment_id = $1', [paymentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = result.rows[0];
    
    res.json({
      payment_id: payment.payment_id,
      order_id: payment.order_id,
      order_number: payment.order_number,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.payment_method,
      status: payment.status,
      processed_at: payment.processed_at,
      created_at: payment.created_at
    });
  } catch (error) {
    console.error('Payment status fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's payment history
app.get('/api/payments/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT payment_id, order_id, order_number, amount, currency, payment_method, status, processed_at, created_at 
       FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const totalResult = await pool.query('SELECT COUNT(*) FROM payments WHERE user_id = $1', [userId]);

    res.json({
      payments: result.rows,
      total: parseInt(totalResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / limit)
    });
  } catch (error) {
    console.error('Payment history fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refund payment (mock implementation)
app.post('/api/payments/:paymentId/refund', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason = 'Customer request' } = req.body;

    const paymentResult = await pool.query('SELECT * FROM payments WHERE payment_id = $1', [paymentId]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== 'success') {
      return res.status(400).json({ error: 'Can only refund successful payments' });
    }

    const refundAmount = amount || payment.amount;

    if (refundAmount > payment.amount) {
      return res.status(400).json({ error: 'Refund amount cannot exceed original payment' });
    }

    // Mock refund processing
    const refundId = `ref_${Date.now()}_${uuidv4().substr(0, 8)}`;
    
    // In a real implementation, you would:
    // 1. Call the payment gateway's refund API
    // 2. Store refund record in database
    // 3. Update payment status if fully refunded

    // For demo, we'll just return success
    await publishPaymentEvent('payment_refunded', {
      payment_id: paymentId,
      refund_id: refundId,
      order_id: payment.order_id,
      order_number: payment.order_number,
      user_id: payment.user_id,
      refund_amount: refundAmount,
      reason
    });

    res.json({
      status: 'success',
      refund_id: refundId,
      payment_id: paymentId,
      refund_amount: refundAmount,
      message: 'Refund processed successfully'
    });
  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook endpoint for external payment gateways (mock)
app.post('/api/webhooks/payment', async (req, res) => {
  try {
    const { payment_id, status, transaction_id } = req.body;

    if (!payment_id || !status) {
      return res.status(400).json({ error: 'Missing required webhook data' });
    }

    // Update payment status
    const result = await pool.query(
      `UPDATE payments SET 
       status = $1, 
       gateway_response = jsonb_set(COALESCE(gateway_response, '{}'), '{webhook_received}', 'true'),
       processed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
       WHERE payment_id = $2 RETURNING *`,
      [status, payment_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = result.rows[0];

    // Publish webhook event
    await publishPaymentEvent('payment_webhook_received', {
      payment_id,
      order_id: payment.order_id,
      order_number: payment.order_number,
      user_id: payment.user_id,
      status,
      transaction_id
    });

    res.json({ status: 'success', message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payment statistics (for admin/monitoring)
app.get('/api/payments/stats/summary', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount END), 0) as total_amount,
        COALESCE(AVG(CASE WHEN status = 'success' THEN amount END), 0) as average_amount
      FROM payments 
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Stats fetch error:', error);
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
    
    // Start background payment processor
    setInterval(processAsyncPayments, 30000); // Process every 30 seconds
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Payments service running on port ${PORT}`);
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