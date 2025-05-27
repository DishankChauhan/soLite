# 🐳 Docker Deployment Guide for soLite

This guide provides comprehensive instructions for deploying soLite using Docker and Docker Compose.

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Git
- Basic understanding of Docker concepts

## 🚀 Quick Start (Development)

### 1. Clone and Setup
```bash
git clone https://github.com/DishankChauhan/soLite.git
cd soLite
```

### 2. Environment Configuration
```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your credentials
nano .env
```

### 3. Generate Solana Wallet (if needed)
```bash
# Install Solana CLI if not already installed
sh -c "$(curl -sSfL https://release.solana.com/v1.16.0/install)"

# Generate relayer wallet
solana-keygen new --outfile relayer-keypair.json

# Fund the wallet (devnet)
solana airdrop 2 --keypair relayer-keypair.json --url devnet
```

### 4. Start Services
```bash
# Start all services (app, database, redis)
docker-compose up -d

# View logs
docker-compose logs -f app
```

### 5. Verify Deployment
```bash
# Check health
curl http://localhost:3000/health

# Check admin dashboard
open http://localhost:3000
```

## 🔧 Configuration

### Environment Variables

#### Required Variables
```bash
# Solana Configuration
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
RELAYER_PRIVATE_KEY=your_base58_private_key
USDC_TOKEN_ADDRESS=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number

# Security
ENCRYPTION_KEY=your_32_character_encryption_key
JWT_SECRET=your_jwt_secret
```

#### Optional Variables
```bash
# Server
PORT=3000
NODE_ENV=production

# Database (auto-configured in Docker)
DB_HOST=db
DB_PORT=5432
DB_NAME=solite
DB_USER=postgres
DB_PASSWORD=postgres

# Redis (auto-configured in Docker)
REDIS_HOST=redis
REDIS_PORT=6379
```

## 🏗️ Architecture

### Docker Services

#### 1. **soLite App** (`solite-app`)
- **Image**: Custom built from Dockerfile
- **Port**: 3000
- **Dependencies**: PostgreSQL, Redis
- **Health Check**: HTTP endpoint `/health`

#### 2. **PostgreSQL Database** (`solite-db`)
- **Image**: postgres:14-alpine
- **Port**: 5432
- **Volume**: Persistent data storage
- **Health Check**: `pg_isready`

#### 3. **Redis Cache** (`solite-redis`)
- **Image**: redis:7-alpine
- **Port**: 6379
- **Purpose**: Session management and caching
- **Health Check**: `redis-cli ping`

### Network Architecture
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   soLite App    │────►│   PostgreSQL    │     │     Redis       │
│   (Port 3000)   │     │   (Port 5432)   │     │   (Port 6379)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Twilio SMS    │
│   Gateway       │
└─────────────────┘
```

## 🔒 Security Considerations

### 1. **Container Security**
- Non-root user execution
- Minimal base image (Alpine Linux)
- Security headers via Helmet.js
- Health checks for monitoring

### 2. **Network Security**
```bash
# Only expose necessary ports
ports:
  - "3000:3000"  # App only
  # Database and Redis are internal only
```

### 3. **Secret Management**
```bash
# Use Docker secrets in production
docker secret create encryption_key encryption_key.txt
docker secret create twilio_auth_token twilio_auth.txt
```

### 4. **Environment Isolation**
```bash
# Use separate environments
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 Monitoring & Health Checks

### Built-in Health Checks
```bash
# Check all services
docker-compose ps

# Check specific service health
docker inspect --format='{{.State.Health.Status}}' solite-app
```

### Application Monitoring
```bash
# View real-time logs
docker-compose logs -f app

# Monitor resource usage
docker stats solite-app solite-db solite-redis
```

### Health Endpoints
- **App Health**: `GET /health`
- **Database**: `pg_isready -U postgres -d solite`
- **Redis**: `redis-cli ping`

## 🚀 Production Deployment

### 1. **Production Docker Compose**
Create `docker-compose.prod.yml`:
```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: solite-app-prod
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - SOLANA_NETWORK=mainnet-beta
      # Add production environment variables
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - prod_data:/var/lib/postgresql/data
    restart: always

secrets:
  db_password:
    external: true

volumes:
  prod_data:
```

### 2. **SSL/TLS Configuration**
```bash
# Use reverse proxy (Nginx)
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
```

### 3. **Backup Strategy**
```bash
# Database backup
docker exec solite-db pg_dump -U postgres solite > backup.sql

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec solite-db pg_dump -U postgres solite | gzip > "backup_${DATE}.sql.gz"
```

## 🔧 Troubleshooting

### Common Issues

#### 1. **Container Won't Start**
```bash
# Check logs
docker-compose logs app

# Check configuration
docker-compose config
```

#### 2. **Database Connection Issues**
```bash
# Test database connectivity
docker exec solite-app node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: 'db',
  port: 5432,
  database: 'solite',
  user: 'postgres',
  password: 'postgres'
});
pool.query('SELECT NOW()', (err, res) => {
  console.log(err ? err : res.rows[0]);
  pool.end();
});
"
```

#### 3. **SMS Not Working**
```bash
# Check Twilio configuration
docker exec solite-app node -e "
console.log('Twilio Config:', {
  accountSid: process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Missing',
  authToken: process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Missing',
  phoneNumber: process.env.TWILIO_PHONE_NUMBER
});
"
```

#### 4. **Solana Connection Issues**
```bash
# Test Solana connectivity
docker exec solite-app node -e "
const { Connection } = require('@solana/web3.js');
const connection = new Connection(process.env.SOLANA_RPC_URL);
connection.getVersion().then(console.log).catch(console.error);
"
```

### Performance Optimization

#### 1. **Resource Limits**
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
    reservations:
      cpus: '1.0'
      memory: 1G
```

#### 2. **Database Optimization**
```bash
# PostgreSQL configuration
command: postgres -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=all -c max_connections=200
```

#### 3. **Redis Configuration**
```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
```

## 📈 Scaling

### Horizontal Scaling
```yaml
version: '3.8'

services:
  app:
    build: .
    deploy:
      replicas: 3
    depends_on:
      - db
      - redis

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    depends_on:
      - app
```

### Load Balancing
```nginx
upstream solite_backend {
    server solite-app-1:3000;
    server solite-app-2:3000;
    server solite-app-3:3000;
}

server {
    listen 80;
    location / {
        proxy_pass http://solite_backend;
    }
}
```

## 🔄 Updates and Maintenance

### 1. **Update Application**
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose build app
docker-compose up -d app
```

### 2. **Database Migrations**
```bash
# Run migrations
docker exec solite-app npm run migrate
```

### 3. **Backup Before Updates**
```bash
# Create backup
docker exec solite-db pg_dump -U postgres solite > pre_update_backup.sql

# Update
docker-compose pull
docker-compose up -d
```

## 📞 Support

For Docker-specific issues:
1. Check the logs: `docker-compose logs -f`
2. Verify configuration: `docker-compose config`
3. Test connectivity: Use the troubleshooting commands above
4. Create an issue on GitHub with logs and configuration

## 🎯 Next Steps

1. **Production Deployment**: Follow the production deployment section
2. **Monitoring**: Set up Prometheus and Grafana
3. **Scaling**: Implement load balancing and horizontal scaling
4. **Security**: Add SSL/TLS and implement proper secret management
5. **Backup**: Set up automated backup strategies 