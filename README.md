# 🛒 ShopHub - Microservices E-Commerce Platform

A production-ready, scalable e-commerce platform built with microservices architecture, featuring Amazon/Flipkart-style UI and modern tech stack.

## 🏗️ Architecture

This platform consists of 4 independent microservices:

- **Catalog Service** (Port 3001) - Product management, categories, search
- **User Service** (Port 3002) - Authentication, user profiles, JWT tokens
- **Order Service** (Port 3003) - Shopping cart, checkout, order management
- **Payment Service** (Port 3004) - Payment processing, refunds, transactions

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Git

### One-Command Setup

```bash
# Clone the repository
git clone <repository-url>
cd microservices-ecommerce-platform

# Start all services
docker-compose up --build
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:80
- **Individual Services**: 3001-3004

### Demo Credentials

```
Email: demo@example.com
Password: password123

Email: admin@example.com  
Password: admin123
```

## 📋 Features

### 🛍️ Customer Features
- **Product Browsing** - Browse by categories, search, filter & sort
- **Shopping Cart** - Add/remove items, quantity management
- **User Authentication** - Register, login, JWT-based sessions
- **Order Management** - Place orders, track status, order history
- **Payment Processing** - Mock payment gateway with various scenarios
- **Responsive Design** - Mobile-first, Amazon/Flipkart-inspired UI

### 🔧 Technical Features
- **Microservices Architecture** - Independent, scalable services
- **Docker Containerization** - Easy deployment and scaling
- **Redis Caching** - Session management and product caching
- **Message Queue** - Async order processing via Redis
- **PostgreSQL** - Separate databases per service
- **JWT Authentication** - Secure token-based auth
- **Rate Limiting** - API protection and abuse prevention
- **Health Checks** - Service monitoring and auto-healing
- **Nginx Reverse Proxy** - Load balancing and routing

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Primary database
- **Redis** - Caching and message queue
- **JWT** - Authentication tokens
- **Bcrypt** - Password hashing

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **React Query** - Server state management
- **Axios** - HTTP client
- **React Router** - Client-side routing

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Nginx** - Reverse proxy and load balancer
- **Kubernetes** - Container orchestration (manifests included)

## 📁 Project Structure

```
microservices-ecommerce-platform/
├── services/
│   ├── catalog/          # Product catalog microservice
│   ├── users/            # User authentication microservice
│   ├── orders/           # Order management microservice
│   └── payments/         # Payment processing microservice
├── frontend/             # React frontend application
├── infra/               # Infrastructure configurations
│   ├── k8s/            # Kubernetes manifests
│   ├── nginx.conf      # Nginx configuration
│   └── init-db.sql     # Database initialization
├── docker-compose.yml   # Docker Compose configuration
└── README.md           # This file
```

## 🔧 Development Setup

### Local Development

1. **Start Infrastructure**
```bash
# Start only databases and cache
docker-compose up postgres redis -d
```

2. **Run Services Individually**
```bash
# Terminal 1 - Catalog Service
cd services/catalog
npm install
npm run dev

# Terminal 2 - Users Service  
cd services/users
npm install
npm run dev

# Terminal 3 - Orders Service
cd services/orders
npm install
npm run dev

# Terminal 4 - Payments Service
cd services/payments
npm install
npm run dev

# Terminal 5 - Frontend
cd frontend
npm install
npm run dev
```

### Environment Variables

Create `.env` files in each service directory:

```bash
# services/catalog/.env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/ecommerce_catalog
REDIS_URL=redis://localhost:6379

# services/users/.env
NODE_ENV=development
PORT=3002
DATABASE_URL=postgresql://postgres:password@localhost:5432/ecommerce_users
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRE=7d
```

## ☸️ Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (minikube, Docker Desktop, or cloud provider)
- kubectl configured

### Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f infra/k8s/

# Check deployment status
kubectl get pods
kubectl get services

# Access the application
kubectl port-forward service/frontend-service 3000:3000
```

### Scaling Services

```bash
# Scale catalog service to 3 replicas
kubectl scale deployment catalog-deployment --replicas=3

# Auto-scale based on CPU usage
kubectl autoscale deployment catalog-deployment --cpu-percent=70 --min=2 --max=10
```

## 📊 API Documentation

### Catalog Service (Port 3001)
```
GET    /api/products              # Get all products (paginated)
GET    /api/products/:id          # Get product by ID
GET    /api/categories            # Get all categories
GET    /api/search?q=query        # Search products
GET    /api/featured              # Get featured products
PATCH  /api/products/:id/stock    # Update product stock
```

### Users Service (Port 3002)
```
POST   /api/auth/register         # Register new user
POST   /api/auth/login            # User login
POST   /api/auth/logout           # User logout
POST   /api/auth/refresh          # Refresh JWT token
GET    /api/users/profile         # Get user profile
PUT    /api/users/profile         # Update user profile
GET    /api/users/addresses       # Get user addresses
POST   /api/users/addresses       # Add new address
```

### Orders Service (Port 3003)
```
GET    /api/cart                  # Get user's cart
POST   /api/cart/items            # Add item to cart
PUT    /api/cart/items/:id        # Update cart item quantity
DELETE /api/cart/items/:id        # Remove item from cart
DELETE /api/cart                  # Clear cart
POST   /api/orders/checkout       # Create new order
GET    /api/orders                # Get user's orders
GET    /api/orders/:number        # Get specific order
PATCH  /api/orders/:number/cancel # Cancel order
```

### Payments Service (Port 3004)
```
POST   /api/payments/process      # Process payment
GET    /api/payments/:id          # Get payment status
GET    /api/payments/user/:userId # Get payment history
POST   /api/payments/:id/refund   # Refund payment
POST   /api/webhooks/payment      # Payment webhook
GET    /api/payments/stats/summary # Payment statistics
```

## 🧪 Testing

### Manual Testing
1. Register a new user or use demo credentials
2. Browse products and add to cart
3. Proceed to checkout
4. Complete payment (mock gateway)
5. View order history

### API Testing
```bash
# Health checks
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health

# Get products
curl http://localhost:3001/api/products

# Register user
curl -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","first_name":"Test","last_name":"User"}'
```

## 🚀 Deployment Options

### 1. Docker Compose (Recommended for Development)
```bash
docker-compose up --build
```

### 2. Kubernetes (Recommended for Production)
```bash
kubectl apply -f infra/k8s/
```

### 3. Cloud Deployment

#### AWS EKS
```bash
# Create EKS cluster
eksctl create cluster --name ecommerce-cluster --region us-west-2

# Deploy application
kubectl apply -f infra/k8s/
```

#### Vercel (Frontend Only)
```bash
cd frontend
npm install -g vercel
vercel --prod
```

## 📈 Monitoring & Observability

### Health Checks
All services expose `/health` endpoints for monitoring:
- http://localhost:3001/health (Catalog)
- http://localhost:3002/health (Users)  
- http://localhost:3003/health (Orders)
- http://localhost:3004/health (Payments)

### Logs
```bash
# View logs for specific service
docker-compose logs -f catalog
docker-compose logs -f users
docker-compose logs -f orders
docker-compose logs -f payments

# View all logs
docker-compose logs -f
```

### Metrics
- Redis metrics: Connection count, memory usage
- PostgreSQL metrics: Query performance, connection pool
- Application metrics: Response times, error rates

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - Bcrypt with salt rounds
- **Rate Limiting** - API endpoint protection
- **CORS Configuration** - Cross-origin request handling
- **Input Validation** - Request data validation
- **SQL Injection Protection** - Parameterized queries
- **Security Headers** - XSS, CSRF protection

## 🐛 Troubleshooting

### Common Issues

1. **Port Already in Use**
```bash
# Kill processes on specific ports
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9
```

2. **Database Connection Issues**
```bash
# Reset database
docker-compose down -v
docker-compose up postgres -d
```

3. **Redis Connection Issues**
```bash
# Reset Redis
docker-compose down
docker-compose up redis -d
```

4. **Frontend Build Issues**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Debug Mode
```bash
# Run services with debug output
DEBUG=* docker-compose up
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Amazon & Flipkart for UI/UX inspiration
- Open source community for excellent tools and libraries
- Docker and Kubernetes communities for containerization best practices

---

**Built with ❤️ for learning microservices architecture and modern e-commerce platforms**