-- Create databases for each microservice
CREATE DATABASE ecommerce_catalog;
CREATE DATABASE ecommerce_users;
CREATE DATABASE ecommerce_orders;
CREATE DATABASE ecommerce_payments;

-- Create a user for the application (optional, for better security)
CREATE USER ecommerce_app WITH PASSWORD 'app_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ecommerce_catalog TO ecommerce_app;
GRANT ALL PRIVILEGES ON DATABASE ecommerce_users TO ecommerce_app;
GRANT ALL PRIVILEGES ON DATABASE ecommerce_orders TO ecommerce_app;
GRANT ALL PRIVILEGES ON DATABASE ecommerce_payments TO ecommerce_app;