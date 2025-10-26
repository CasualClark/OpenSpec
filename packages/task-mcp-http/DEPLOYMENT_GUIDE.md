# Task MCP HTTP Server - Deployment Guide

This guide covers comprehensive deployment options for the Task MCP HTTP Server, including Docker containerization, native execution, and production configurations.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Docker Deployment](#docker-deployment)
3. [Native Deployment](#native-deployment)
4. [Environment Configuration](#environment-configuration)
5. [TLS/SSL Setup](#tlsssl-setup)
6. [Production Deployment](#production-deployment)
7. [Monitoring & Health Checks](#monitoring--health-checks)
8. [Security Considerations](#security-considerations)
9. [Troubleshooting](#troubleshooting)

## Quick Start

### Docker Quick Start

```bash
# Clone and navigate to the project
git clone https://github.com/Fission-AI/OpenSpec.git
cd OpenSpec/packages/task-mcp-http

# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Or start production environment
docker-compose up -d

# Check health
curl http://localhost:3000/healthz
```

### Native Quick Start

```bash
# Install dependencies
./scripts/install-deps.sh

# Start development server
./scripts/run-native.sh --dev

# Or start production server
./scripts/run-native.sh --pm2
```

## Docker Deployment

### Production Docker Build

```bash
# Build for multiple architectures
./scripts/build.sh --push --scan

# Or build locally
docker build -t task-mcp-http:latest .

# Run with environment file
docker run -d \
  --name task-mcp-http \
  --env-file config/production.env \
  -p 3000:3000 \
  task-mcp-http:latest
```

### Development Docker

```bash
# Build development image
docker build -f Dockerfile.dev -t task-mcp-http:dev .

# Run with hot reload
docker run -d \
  --name task-mcp-dev \
  -v $(pwd):/app \
  -v /app/node_modules \
  -p 3000:3000 \
  -p 9229:9229 \
  task-mcp-http:dev
```

### Docker Compose

#### Development Environment

```bash
# Start development stack
docker-compose -f docker-compose.dev.yml up -d

# Include additional services
docker-compose -f docker-compose.dev.yml --profile tools up -d
docker-compose -f docker-compose.dev.yml --profile database up -d
docker-compose -f docker-compose.dev.yml --profile monitoring up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f task-mcp-backend
```

#### Production Environment

```bash
# Start production stack
docker-compose up -d

# Include monitoring
docker-compose --profile monitoring up -d

# Include logging
docker-compose --profile logging up -d
```

## Native Deployment

### Prerequisites Installation

```bash
# Install all dependencies and tools
./scripts/install-deps.sh --runtime node

# Or with Bun
./scripts/install-deps.sh --runtime bun

# Skip global tools
./scripts/install-deps.sh --no-global
```

### Development Server

```bash
# Basic development server
./scripts/run-native.sh --dev

# With specific port
./scripts/run-native.sh --dev --port 8080

# With TLS
./scripts/run-native.sh --dev --auto-tls

# With PM2
./scripts/run-native.sh --pm2 --dev
```

### Production Server

```bash
# Basic production server
./scripts/run-native.sh

# With PM2 process management
./scripts/run-native.sh --pm2

# With TLS certificates
./scripts/run-native.sh --tls /path/to/key.pem /path/to/cert.pem

# With custom environment file
./scripts/run-native.sh --env config/production.env
```

### Bun Runtime

```bash
# Use Bun for better performance
./scripts/run-native.sh --runtime bun

# Development with Bun
./scripts/run-native.sh --runtime bun --dev
```

## Environment Configuration

### Configuration Files

The project includes three environment templates:

- `config/production.env` - Production-ready settings
- `config/development.env` - Development-friendly settings  
- `config/docker.env` - Docker-specific settings

### Key Environment Variables

#### Server Configuration
```bash
NODE_ENV=production          # Environment mode
PORT=3000                   # Server port
HOST=0.0.0.0               # Bind address
```

#### TLS Configuration
```bash
TLS_ENABLED=true            # Enable TLS
TLS_KEY=/path/to/key.pem    # TLS private key
TLS_CERT=/path/to/cert.pem  # TLS certificate
TLS_CA=/path/to/ca.pem      # CA certificate (optional)
```

#### Authentication
```bash
AUTH_TOKENS=token1,token2   # Comma-separated valid tokens
SECURITY_HEADERS_ENABLED=true  # Enable security headers
```

#### CORS Configuration
```bash
ALLOWED_ORIGINS=https://example.com,https://app.example.com
```

#### Rate Limiting
```bash
RATE_LIMIT=60               # Requests per minute
RATE_LIMIT_BURST=90         # Burst capacity
ENABLE_DISTRIBUTED_RATE_LIMIT=true  # Use Redis for distributed limiting
REDIS_URL=redis://localhost:6379
```

#### SSE Configuration
```bash
HEARTBEAT_MS=25000          # Heartbeat interval
MAX_SSE_CONNECTIONS=1000    # Max concurrent connections
```

#### Logging
```bash
LOG_LEVEL=info              # debug, info, warn, error
LOG_FORMAT=json             # json or pretty
AUDIT_LOG_ENABLED=true      # Enable audit logging
```

## TLS/SSL Setup

### Self-Signed Certificate (Development)

```bash
# Generate with the native runner
./scripts/run-native.sh --auto-tls

# Or generate manually
openssl req -x509 -newkey rsa:2048 \
  -keyout ssl/server.key \
  -out ssl/server.crt \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Dev/CN=localhost"
```

### Let's Encrypt Certificate (Production)

```bash
# Install Certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/server.crt
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/server.key
```

### Certificate Configuration

```bash
# Environment variables
TLS_ENABLED=true
TLS_KEY=/app/ssl/server.key
TLS_CERT=/app/ssl/server.crt

# Docker volume mount
-v $(pwd)/ssl:/app/ssl:ro
```

## Production Deployment

### Systemd Service (Native)

Create `/etc/systemd/system/task-mcp-http.service`:

```ini
[Unit]
Description=Task MCP HTTP Server
After=network.target

[Service]
Type=simple
User=task-mcp
WorkingDirectory=/opt/task-mcp-http
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/task-mcp-http/config/production.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable task-mcp-http
sudo systemctl start task-mcp-http

# Check status
sudo systemctl status task-mcp-http
```

### PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'task-mcp-http',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_file: 'config/production.env',
    max_memory_restart: '1G',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2.log',
    time: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

```bash
# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: task-mcp-http
spec:
  replicas: 3
  selector:
    matchLabels:
      app: task-mcp-http
  template:
    metadata:
      labels:
        app: task-mcp-http
    spec:
      containers:
      - name: task-mcp-http
        image: fissionai/task-mcp-http:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        envFrom:
        - configMapRef:
            name: task-mcp-config
        - secretRef:
            name: task-mcp-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: task-mcp-http-service
spec:
  selector:
    app: task-mcp-http
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

## Monitoring & Health Checks

### Health Endpoints

- `GET /healthz` - Liveness probe
- `GET /readyz` - Readiness probe
- `GET /metrics` - Prometheus metrics

### Docker Health Checks

```bash
# Check container health
docker ps
docker inspect task-mcp-http | jq '.[0].State.Health'

# Health check logs
docker inspect task-mcp-http | jq '.[0].State.Health.Log'
```

### Script Health Checks

```bash
# Interactive health check
./scripts/health-check.sh --host localhost --port 3000

# Container mode (exit codes only)
./scripts/health-check.sh --container --host localhost --port 3000

# Check with custom endpoint
./scripts/health-check.sh --endpoint /readyz
```

### Prometheus Metrics

Enable metrics collection:

```yaml
# docker-compose.yml
environment:
  - METRICS_ENABLED=true
  - METRICS_PORT=9090
  - PROMETHEUS_ENABLED=true
```

Access metrics at `http://localhost:9090/metrics`

### Log Monitoring

```bash
# Follow application logs
docker-compose logs -f task-mcp-backend

# Native logs with PM2
pm2 logs task-mcp-http

# Systemd logs
journalctl -u task-mcp-http -f
```

## Security Considerations

### Container Security

```bash
# Run as non-root user
USER node

# Use minimal base image
FROM gcr.io/distroless/nodejs20-debian12

# Security scanning
./scripts/build.sh --scan

# Trivy scan
trivy image task-mcp-http:latest
```

### Network Security

```bash
# Use reverse proxy for TLS termination
# Configure firewall rules
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp  # Direct access blocked
```

### Secrets Management

```bash
# Use Docker secrets
echo "your-secret-token" | docker secret create auth_tokens -

# Use Kubernetes secrets
kubectl create secret generic task-mcp-secrets \
  --from-literal=AUTH_TOKENS=token1,token2 \
  --from-literal=WEBHOOK_SECRET=webhook-secret
```

### Security Headers

The application automatically includes security headers:

- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`

## Troubleshooting

### Common Issues

#### Container Won't Start

```bash
# Check logs
docker logs task-mcp-http

# Check configuration
docker run --rm --env-file config/production.env task-mcp-http:latest env

# Verify health check
docker exec task-mcp-http curl -f http://localhost:3000/healthz
```

#### Native Server Issues

```bash
# Check Node.js version
node --version  # Should be >= 20.19.0

# Check dependencies
npm ls

# Validate configuration
node -e "console.log(require('./src/config.js').validateConfig())"
```

#### Performance Issues

```bash
# Check resource usage
docker stats
pm2 monit

# Profile with Node.js
node --prof dist/index.js
node --prof-process isolate-*.log > processed.txt
```

#### TLS Issues

```bash
# Verify certificate
openssl x509 -in ssl/server.crt -text -noout

# Test TLS connection
openssl s_client -connect localhost:443 -servername localhost

# Check certificate chain
curl -v https://localhost:3000/healthz
```

### Debug Mode

Enable debug logging:

```bash
# Environment variables
LOG_LEVEL=debug
DEBUG_MODE=true

# Native runner
./scripts/run-native.sh --dev

# Docker
docker run -e LOG_LEVEL=debug task-mcp-http:latest
```

### Getting Help

1. Check the logs for error messages
2. Verify environment configuration
3. Test health endpoints
4. Check network connectivity
5. Validate TLS certificates
6. Review resource usage

For additional support, create an issue in the GitHub repository with:

- Environment details
- Configuration used
- Error logs
- Steps to reproduce