# Environment Variables Setup Guide

## Quick Start

1. Copy the example file:
   ```bash
   cp env.example .env
   ```

2. Update the `.env` file with your actual values

3. Start the services:
   ```bash
   docker-compose up -d
   ```

## Required Environment Variables

### Application Configuration
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `FRONTEND_URL` - Frontend URL for CORS

### MongoDB
- `MONGODB_URI` - MongoDB connection string
  - Local: `mongodb://localhost:27017/impact-plus`
  - With auth: `mongodb://user:pass@host:27017/db?authSource=admin`

### JWT Authentication
- `JWT_SECRET` - Secret key for JWT signing (required)
- `JWT_EXPIRES_IN` - Token expiration (default: 7d)

### Redis (Optional but Recommended)
- `REDIS_ENABLED` - Enable Redis cache (true/false)
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (optional)

### RabbitMQ (Optional)
- `RABBITMQ_URL` - RabbitMQ connection URL
- `RABBITMQ_EMAIL_QUEUE` - Email queue name
- `RABBITMQ_EMAIL_DLQ` - Dead letter queue name
- `RABBITMQ_EMAIL_EXCHANGE` - Email exchange name
- `RABBITMQ_EMAIL_ROUTING_KEY` - Email routing key

### Rate Limiting
- `THROTTLE_TTL` - Time window in seconds (default: 60)
- `THROTTLE_LIMIT` - Max requests per window (default: 10)

## Docker Compose Defaults

When using `docker-compose.yml`, these are the default values:

- **MongoDB**: `mongodb://localhost:27017/impact-plus`
- **Redis**: `localhost:6379` (no password)
- **RabbitMQ**: `amqp://admin:admin@localhost:5672`
  - Management UI: http://localhost:15672
  - Username: `admin`
  - Password: `admin`

## Generating Secure Secrets

### JWT Secret
```bash
openssl rand -base64 32
```

### MongoDB Password
```bash
openssl rand -base64 24
```

## Production Checklist

- [ ] Change `NODE_ENV` to `production`
- [ ] Set strong `JWT_SECRET` (use openssl)
- [ ] Update `MONGODB_URI` with production credentials
- [ ] Set `REDIS_PASSWORD` if using Redis
- [ ] Update `FRONTEND_URL` to production domain
- [ ] Review and adjust `THROTTLE_LIMIT` for production load
- [ ] Enable SSL/TLS for MongoDB and Redis in production

## Troubleshooting

### MongoDB Connection Issues
- Check if MongoDB is running: `docker ps | grep mongodb`
- Verify connection string format
- Check network connectivity

### Redis Connection Issues
- Check if Redis is running: `docker ps | grep redis`
- Verify `REDIS_ENABLED=true`
- Check Redis password if set

### RabbitMQ Connection Issues
- Check if RabbitMQ is running: `docker ps | grep rabbitmq`
- Access management UI: http://localhost:15672
- Verify credentials match docker-compose.yml

