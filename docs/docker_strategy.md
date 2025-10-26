# Docker Strategy and Deployment Guide

_Last updated: 2025-10-25_

## Overview

This guide covers Docker deployment strategies for the Task MCP HTTP server, including containerization best practices, multi-stage builds, security considerations, and production deployment patterns.

## Container Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Environment                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Load      │  │   Task MCP  │  │   OpenSpec  │         │
│  │  Balancer   │──│  HTTP Server│──│  Repository │         │
│  │  (nginx)    │  │   (Docker)  │  │   (Volume)  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Metrics   │  │   Logging   │  │   Health    │         │
│  │ (Prometheus)│  │  (ELK Stack)│  │   Checks    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Stage Dockerfile

### Complete Production Dockerfile

```dockerfile
# ============================================
# Stage 1: Build Stage
# ============================================
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY packages/task-mcp-http/package*.json ./packages/task-mcp-http/
COPY packages/task-mcp-http/tsconfig.json ./packages/task-mcp-http/

# Install pnpm and dependencies
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# Copy source code
COPY packages/task-mcp-http/src ./packages/task-mcp-http/src
COPY tsconfig.json ./
COPY packages/task-mcp-http/docker ./packages/task-mcp-http/docker

# Build the application
RUN pnpm --filter @fission-ai/task-mcp-http build

# ============================================
# Stage 2: Production Stage
# ============================================
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    jq \
    ca-certificates \
    dumb-init \
    tini \
    && update-ca-certificates

# Create non-root user with proper home directory
RUN addgroup -g 1001 -S nodejs && \
    adduser -S openspec -u 1001 -G nodejs -h /app -s /bin/sh

# Set working directory
WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=openspec:nodejs /app/packages/task-mcp-http/dist ./dist
COPY --from=builder --chown=openspec:nodejs /app/packages/task-mcp-http/node_modules ./node_modules
COPY --from=builder --chown=openspec:nodejs /app/packages/task-mcp-http/package.json ./package.json

# Copy health check scripts
COPY --from=builder --chown=openspec:nodejs /app/packages/task-mcp-http/docker/health-check.sh /usr/local/bin/health-check.sh
COPY --from=builder --chown=openspec:nodejs /app/packages/task-mcp-http/docker/readiness-check.sh /usr/local/bin/readiness-check.sh

# Make scripts executable
RUN chmod +x /usr/local/bin/health-check.sh /usr/local/bin/readiness-check.sh

# Create directories with proper permissions
RUN mkdir -p /app/logs /app/openspec && \
    chown -R openspec:nodejs /app

# Switch to non-root user
USER openspec

# Expose port
EXPOSE 8443

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8443
ENV HOST=0.0.0.0

# Health check configuration
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=30s \
            --retries=3 \
            CMD /usr/local/bin/health-check.sh

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
```

### Health Check Scripts

#### Health Check Script (`docker/health-check.sh`)

```bash
#!/bin/sh
# Docker health check for Task MCP HTTP Server

set -e

# Configuration
HOST="${HOST:-localhost}"
PORT="${PORT:-8443}"
SCHEME="${SCHEME:-https}"
TIMEOUT="${HEALTH_CHECK_TIMEOUT:-10}"
MAX_RETRIES=3

# Build health check URL
URL="${SCHEME}://${HOST}:${PORT}/healthz"

# Perform health check
check_health() {
    local attempt=1
    
    while [ $attempt -le $MAX_RETRIES ]; do
        echo "Health check attempt $attempt/$MAX_RETRIES: $URL"
        
        if curl -k -s -f --max-time "$TIMEOUT" \
            -H "User-Agent: docker-health-check/1.0" \
            "$URL" >/dev/null 2>&1; then
            echo "Health check passed on attempt $attempt"
            return 0
        fi
        
        echo "Health check failed on attempt $attempt"
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            sleep 2
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo "Health check failed after $MAX_RETRIES attempts"
    return 1
}

# Check process health
check_process() {
    if ! pgrep -f "node.*dist/index.js" >/dev/null; then
        echo "Node.js process not found"
        return 1
    fi
    
    if ! netstat -tlnp 2>/dev/null | grep ":$PORT " >/dev/null; then
        echo "Port $PORT is not being listened on"
        return 1
    fi
    
    return 0
}

main() {
    echo "Starting health check for Task MCP HTTP Server"
    
    if ! check_process; then
        echo "Process check failed"
        exit 1
    fi
    
    if check_health; then
        echo "Health check completed successfully"
        exit 0
    else
        echo "Health check failed"
        exit 1
    fi
}

main "$@"
```

#### Readiness Check Script (`docker/readiness-check.sh`)

```bash
#!/bin/sh
# Docker readiness check for Task MCP HTTP Server

set -e

HOST="${HOST:-localhost}"
PORT="${PORT:-8443}"
SCHEME="${SCHEME:-https}"
TIMEOUT="${READINESS_CHECK_TIMEOUT:-10}"

URL="${SCHEME}://${HOST}:${PORT}/readyz"

echo "Checking readiness: $URL"

if curl -k -s -f --max-time "$TIMEOUT" \
    -H "User-Agent: docker-readiness-check/1.0" \
    "$URL" >/dev/null 2>&1; then
    echo "Readiness check passed"
    exit 0
else
    echo "Readiness check failed"
    exit 1
fi
```

## Docker Compose Configurations

### Development Environment

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  task-mcp-dev:
    build:
      context: .
      dockerfile: packages/task-mcp-http/docker/health-checks.dockerfile
      target: builder
    ports:
      - "8443:8443"
      - "9229:9229"  # Debug port
    environment:
      - NODE_ENV=development
      - PORT=8443
      - HOST=0.0.0.0
      - LOG_LEVEL=debug
      - AUTH_TOKENS=dev-token-1,dev-token-2
      - WORKING_DIRECTORY=/app/openspec
      - CORS_ORIGINS=http://localhost:3000,http://localhost:8080
    volumes:
      - ./openspec:/app/openspec:rw
      - ./packages/task-mcp-http/src:/app/packages/task-mcp-http/src:rw
      - ./logs:/app/logs:rw
    command: ["pnpm", "--filter", "@fission-ai/task-mcp-http", "start:dev"]
    healthcheck:
      test: ["CMD", "/usr/local/bin/health-check.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - task-mcp-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - task-mcp-network

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    networks:
      - task-mcp-network

volumes:
  redis-data:
  prometheus-data:

networks:
  task-mcp-network:
    driver: bridge
```

### Production Environment

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - task-mcp-1
      - task-mcp-2
    networks:
      - task-mcp-network
    restart: unless-stopped

  task-mcp-1:
    image: fission-ai/task-mcp-http:latest
    environment:
      - NODE_ENV=production
      - PORT=8443
      - HOST=0.0.0.0
      - LOG_LEVEL=info
      - AUTH_TOKENS=${AUTH_TOKENS}
      - WORKING_DIRECTORY=/app/openspec
      - CORS_ORIGINS=${CORS_ORIGINS}
      - RATE_LIMIT=${RATE_LIMIT:-60}
      - MAX_RESPONSE_SIZE_KB=${MAX_RESPONSE_SIZE_KB:-1024}
      - TLS_CERT=/app/ssl/cert.pem
      - TLS_KEY=/app/ssl/key.pem
    volumes:
      - ./openspec:/app/openspec:ro
      - ./ssl:/app/ssl:ro
      - ./logs/app:/app/logs
    healthcheck:
      test: ["CMD", "/usr/local/bin/health-check.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - task-mcp-network
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  task-mcp-2:
    image: fission-ai/task-mcp-http:latest
    environment:
      - NODE_ENV=production
      - PORT=8443
      - HOST=0.0.0.0
      - LOG_LEVEL=info
      - AUTH_TOKENS=${AUTH_TOKENS}
      - WORKING_DIRECTORY=/app/openspec
      - CORS_ORIGINS=${CORS_ORIGINS}
      - RATE_LIMIT=${RATE_LIMIT:-60}
      - MAX_RESPONSE_SIZE_KB=${MAX_RESPONSE_SIZE_KB:-1024}
      - TLS_CERT=/app/ssl/cert.pem
      - TLS_KEY=/app/ssl/key.pem
    volumes:
      - ./openspec:/app/openspec:ro
      - ./ssl:/app/ssl:ro
      - ./logs/app:/app/logs
    healthcheck:
      test: ["CMD", "/usr/local/bin/health-check.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - task-mcp-network
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
      - ./redis/redis.conf:/etc/redis/redis.conf:ro
    command: redis-server /etc/redis/redis.conf
    networks:
      - task-mcp-network
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    networks:
      - task-mcp-network
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources:ro
    networks:
      - task-mcp-network
    restart: unless-stopped

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
      - xpack.security.enabled=false
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data
    networks:
      - task-mcp-network
    restart: unless-stopped

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logging/logstash.conf:/usr/share/logstash/pipeline/logstash.conf:ro
      - ./logs:/logs:ro
    depends_on:
      - elasticsearch
    networks:
      - task-mcp-network
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    depends_on:
      - elasticsearch
    networks:
      - task-mcp-network
    restart: unless-stopped

volumes:
  redis-data:
  prometheus-data:
  grafana-data:
  elasticsearch-data:

networks:
  task-mcp-network:
    driver: bridge
```

## Nginx Configuration

### Production Nginx Config

```nginx
# nginx/nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream task_mcp_backend {
        least_conn;
        server task-mcp-1:8443 max_fails=3 fail_timeout=30s;
        server task-mcp-2:8443 max_fails=3 fail_timeout=30s;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=sse:10m rate=5r/s;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                   '$status $body_bytes_sent "$http_referer" '
                   '"$http_user_agent" "$http_x_forwarded_for" '
                   'rt=$request_time uct="$upstream_connect_time" '
                   'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    server {
        listen 80;
        server_name _;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # API endpoints
        location /sse {
            limit_req zone=sse burst=10 nodelay;
            
            proxy_pass https://task_mcp_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # SSE specific headers
            proxy_set_header Cache-Control no-cache;
            proxy_set_header Connection '';
            proxy_http_version 1.1;
            proxy_buffering off;
            proxy_read_timeout 86400;
        }

        location /mcp {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass https://task_mcp_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # NDJSON streaming
            proxy_set_header Connection '';
            proxy_buffering off;
            proxy_read_timeout 86400;
        }

        location /healthz {
            proxy_pass https://task_mcp_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /readyz {
            proxy_pass https://task_mcp_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /security/metrics {
            proxy_pass https://task_mcp_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Static content and monitoring
        location /metrics {
            proxy_pass http://prometheus:9090/metrics;
        }

        location /grafana/ {
            proxy_pass http://grafana:3000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

## Security Configuration

### Container Security Best Practices

```dockerfile
# Security-focused Dockerfile additions
FROM node:20-alpine AS production

# Security: Use non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S openspec -u 1001 -G nodejs -h /app -s /bin/sh

# Security: Remove unnecessary packages
RUN apk del --purge \
    python3 \
    make \
    g++ \
    git && \
    rm -rf /var/cache/apk/*

# Security: Set proper file permissions
RUN chmod 755 /app && \
    chmod 644 /app/package.json && \
    chmod -R 755 /app/dist

# Security: Read-only filesystem where possible
VOLUME ["/app/logs", "/app/openspec"]

# Security: Drop capabilities
RUN setcap cap_net_bind_service=+ep /usr/local/bin/node

# Security: Seccomp profile (runtime)
# docker run --security-opt seccomp=default.json ...

# Security: AppArmor/SELinux (runtime)
# docker run --security-opt apparmor:docker-default ...

# Security: No new privileges
USER openspec
```

### Environment Security

```bash
# .env.production
# Authentication
AUTH_TOKENS=token1,token2,token3
AUTH_TOKEN_HASH_SALT=your-salt-here

# Network Security
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
CORS_STRICT=true

# Rate Limiting
RATE_LIMIT=60
RATE_LIMIT_BURST=90
ENABLE_DISTRIBUTED_RATE_LIMIT=true
REDIS_URL=redis://redis:6379

# TLS Security
TLS_CERT=/app/ssl/cert.pem
TLS_KEY=/app/ssl/key.pem
TLS_MIN_VERSION=1.2

# Logging Security
LOG_LEVEL=info
AUDIT_LOG_LEVEL=warn
AUDIT_LOG_FILE=/app/logs/audit.log
SECURITY_HEADERS_ENABLED=true

# Resource Limits
MAX_RESPONSE_SIZE_KB=1024
MAX_CONCURRENT_CONNECTIONS=100
REQUEST_TIMEOUT_MS=30000

# File Security
WORKING_DIRECTORY=/app/openspec
ALLOWED_PATHS=/app/openspec
MAX_FILE_SIZE_MB=10
```

## Deployment Strategies

### Blue-Green Deployment

```yaml
# docker-compose.blue-green.yml
version: '3.8'

services:
  # Blue environment (current)
  task-mcp-blue:
    image: fission-ai/task-mcp-http:${BLUE_VERSION}
    environment:
      - NODE_ENV=production
      - PORT=8443
      - DEPLOYMENT_COLOR=blue
    volumes:
      - ./openspec:/app/openspec:ro
      - ./logs/blue:/app/logs
    networks:
      - task-mcp-network
    healthcheck:
      test: ["CMD", "/usr/local/bin/health-check.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  # Green environment (new)
  task-mcp-green:
    image: fission-ai/task-mcp-http:${GREEN_VERSION}
    environment:
      - NODE_ENV=production
      - PORT=8444
      - DEPLOYMENT_COLOR=green
    volumes:
      - ./openspec:/app/openspec:ro
      - ./logs/green:/app/logs
    networks:
      - task-mcp-network
    healthcheck:
      test: ["CMD", "/usr/local/bin/health-check.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  # Load balancer
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/blue-green.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - task-mcp-blue
      - task-mcp-green
    networks:
      - task-mcp-network

networks:
  task-mcp-network:
    driver: bridge
```

### Canary Deployment Script

```bash
#!/bin/bash
# deploy-canary.sh

set -e

CURRENT_VERSION=${1:-latest}
CANARY_VERSION=${2:-canary}
CANARY_PERCENTAGE=${3:-10}

echo "Starting canary deployment..."
echo "Current version: $CURRENT_VERSION"
echo "Canary version: $CANARY_VERSION"
echo "Canary percentage: $CANARY_PERCENTAGE%"

# Update docker-compose with canary configuration
cat > docker-compose.canary.yml << EOF
version: '3.8'
services:
  task-mcp-current:
    image: fission-ai/task-mcp-http:$CURRENT_VERSION
    environment:
      - NODE_ENV=production
      - PORT=8443
      - DEPLOYMENT_VERSION=current
    deploy:
      replicas: $((100 - CANARY_PERCENTAGE))

  task-mcp-canary:
    image: fission-ai/task-mcp-http:$CANARY_VERSION
    environment:
      - NODE_ENV=production
      - PORT=8444
      - DEPLOYMENT_VERSION=canary
    deploy:
      replicas: $CANARY_PERCENTAGE

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/canary.conf:/etc/nginx/nginx.conf:ro
EOF

# Deploy canary
docker-compose -f docker-compose.canary.yml up -d

# Wait for health checks
echo "Waiting for canary to be healthy..."
sleep 30

# Monitor canary performance
echo "Monitoring canary performance for 5 minutes..."
for i in {1..5}; do
    echo "Check $i/5..."
    
    # Check health endpoints
    curl -f http://localhost/healthz || exit 1
    curl -f http://localhost:8444/healthz || exit 1
    
    # Check error rates (simplified)
    error_rate=$(curl -s http://localhost:9090/api/v1/query \
        --data-urlencode 'query=rate(http_requests_total{status=~"5.."}[5m])' \
        | jq '.data.result[0].value[1]' || echo "0")
    
    if (( $(echo "$error_rate > 0.05" | bc -l) )); then
        echo "Error rate too high: $error_rate"
        echo "Rolling back canary..."
        docker-compose -f docker-compose.canary.yml down
        docker-compose -f docker-compose.prod.yml up -d
        exit 1
    fi
    
    sleep 60
done

echo "Canary deployment successful!"
echo "Consider promoting to full deployment"
```

## Monitoring and Observability

### Prometheus Configuration

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'task-mcp'
    static_configs:
      - targets: ['task-mcp-1:8443', 'task-mcp-2:8443']
    metrics_path: '/security/metrics'
    scrape_interval: 30s

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:9113']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

### Alert Rules

```yaml
# monitoring/alert_rules.yml
groups:
  - name: task-mcp-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors per second"

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }} seconds"

      - alert: ServiceDown
        expr: up{job="task-mcp"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Task MCP service is down"
          description: "Task MCP instance {{ $labels.instance }} is down"

      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value | humanizePercentage }}"
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Task MCP Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{status}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          },
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "50th percentile"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m])",
            "legendFormat": "Error Rate"
          }
        ]
      },
      {
        "title": "Active Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "sse_active_connections",
            "legendFormat": "SSE Connections"
          }
        ]
      }
    ]
  }
}
```

## Backup and Recovery

### Backup Script

```bash
#!/bin/bash
# backup.sh

set -e

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="task-mcp-backup-$DATE"

echo "Starting backup: $BACKUP_NAME"

# Create backup directory
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# Backup OpenSpec data
echo "Backing up OpenSpec data..."
docker run --rm -v $(pwd)/openspec:/source -v "$BACKUP_DIR/$BACKUP_NAME":/backup alpine tar czf /backup/openspec.tar.gz -C /source .

# Backup configuration
echo "Backing up configuration..."
cp -r ./config "$BACKUP_DIR/$BACKUP_NAME/"
cp .env.production "$BACKUP_DIR/$BACKUP_NAME/"

# Backup logs
echo "Backing up logs..."
docker run --rm -v $(pwd)/logs:/source -v "$BACKUP_DIR/$BACKUP_NAME":/backup alpine tar czf /backup/logs.tar.gz -C /source .

# Create backup metadata
cat > "$BACKUP_DIR/$BACKUP_NAME/metadata.json" << EOF
{
  "backup_date": "$(date -Iseconds)",
  "version": "$(git describe --tags --always)",
  "docker_images": {
    "task-mcp": "$(docker images fission-ai/task-mcp-http --format '{{.Tag}}')"
  }
}
EOF

# Compress backup
echo "Compressing backup..."
cd "$BACKUP_DIR"
tar czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

echo "Backup completed: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
```

### Recovery Script

```bash
#!/bin/bash
# recover.sh

set -e

BACKUP_FILE=${1:-""}
if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file.tar.gz>"
    exit 1
fi

BACKUP_DIR=$(dirname "$BACKUP_FILE")
BACKUP_NAME=$(basename "$BACKUP_FILE" .tar.gz)

echo "Starting recovery from: $BACKUP_FILE"

# Extract backup
cd "$BACKUP_DIR"
tar xzf "$BACKUP_FILE"

# Stop services
echo "Stopping services..."
docker-compose -f docker-compose.prod.yml down

# Restore OpenSpec data
echo "Restoring OpenSpec data..."
docker run --rm -v $(pwd)/openspec:/target -v "$BACKUP_DIR/$BACKUP_NAME":/backup alpine tar xzf /backup/openspec.tar.gz -C /target

# Restore configuration
echo "Restoring configuration..."
cp -r "$BACKUP_DIR/$BACKUP_NAME/config/"* ./config/
cp "$BACKUP_DIR/$BACKUP_NAME/.env.production" ./

# Start services
echo "Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for health checks
echo "Waiting for services to be healthy..."
sleep 60

# Verify recovery
if curl -f http://localhost/healthz; then
    echo "Recovery completed successfully!"
else
    echo "Recovery failed - services not healthy"
    exit 1
fi

# Cleanup
rm -rf "$BACKUP_DIR/$BACKUP_NAME"

echo "Recovery completed successfully"
```

## Performance Optimization

### Resource Limits

```yaml
# docker-compose.optimized.yml
version: '3.8'

services:
  task-mcp:
    image: fission-ai/task-mcp-http:latest
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 256M
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
    environment:
      - NODE_OPTIONS=--max-old-space-size=768
      - UV_THREADPOOL_SIZE=16
    sysctls:
      - net.core.somaxconn=65535
      - net.ipv4.tcp_max_syn_backlog=65535
```

### Caching Strategy

```yaml
# redis cache for distributed rate limiting
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
  volumes:
    - redis-data:/data
    - ./redis/redis.conf:/etc/redis/redis.conf:ro
```

This comprehensive Docker strategy guide provides production-ready deployment patterns, security configurations, monitoring setups, and operational procedures for running Task MCP HTTP server in containerized environments.