# Task MCP HTTP Server - Deployment Documentation

This directory contains comprehensive deployment configurations and scripts for the Task MCP HTTP Server, supporting both containerized and native deployment scenarios.

## 🚀 Quick Start

### Docker (Recommended for Production)

```bash
# Production deployment
docker-compose up -d

# Development with hot reload
docker-compose -f docker-compose.dev.yml up -d

# Check health
curl http://localhost:3000/healthz
```

### Native Execution

```bash
# Install dependencies
./scripts/install-deps.sh

# Start development server
./scripts/run-native.sh --dev

# Start production server with PM2
./scripts/run-native.sh --pm2
```

## 📁 File Structure

```
packages/task-mcp-http/
├── 🐳 Docker Configuration
│   ├── Dockerfile                 # Multi-stage production Dockerfile
│   ├── Dockerfile.dev            # Development Dockerfile
│   ├── docker-compose.yml        # Production stack
│   ├── docker-compose.dev.yml    # Development stack
│   └── .dockerignore             # Docker build exclusions
│
├── 📜 Scripts
│   ├── scripts/
│   │   ├── build.sh              # Multi-architecture build automation
│   │   ├── run-native.sh         # Dockerless runner with TLS support
│   │   ├── install-deps.sh       # Dependency installation
│   │   └── health-check.sh       # Health check script
│
├── ⚙️ Configuration
│   ├── config/
│   │   ├── production.env        # Production environment template
│   │   ├── development.env       # Development environment template
│   │   └── docker.env            # Docker-specific environment
│
├── 🔄 CI/CD
│   └── .github/workflows/
│       └── docker-ci.yml         # GitHub Actions pipeline
│
└── 📚 Documentation
    ├── DEPLOYMENT_GUIDE.md       # Comprehensive deployment guide
    └── DEPLOYMENT_README.md      # This file
```

## 🐳 Docker Deployment

### Production Dockerfile Features

- **Multi-stage build**: Optimized for size and security
- **Distroless runtime**: Minimal attack surface
- **Non-root user**: Security best practice
- **Health checks**: Built-in container health monitoring
- **Multi-architecture**: AMD64 and ARM64 support
- **Security scanning**: Integrated vulnerability scanning

### Build and Push

```bash
# Build for multiple architectures
./scripts/build.sh --push --scan

# Build locally only
./scripts/build.sh --no-scan

# Custom registry and version
./scripts/build.sh --registry my-registry.com --version v2.0.0
```

### Docker Compose Services

#### Production Stack
- **Task MCP HTTP Backend**: Main application server
- **Redis**: Session storage and caching
- **Nginx**: Reverse proxy with TLS termination
- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboard
- **ELK Stack**: Log aggregation (optional)

#### Development Stack
- **Hot Reload**: Live code reloading
- **Debugging**: Node.js debugger on port 9229
- **Development Tools**: Adminer, Redis Commander, MailHog
- **Database**: PostgreSQL for development
- **Monitoring**: Prometheus and Grafana

## 🖥️ Native Deployment

### Prerequisites

- **Node.js**: >= 20.19.0 (or Bun for better performance)
- **OpenSSL**: For TLS certificate management
- **PM2**: Process management (optional but recommended)

### Installation

```bash
# Install all dependencies and tools
./scripts/install-deps.sh

# Install with Bun runtime
./scripts/install-deps.sh --runtime bun

# Skip global tools
./scripts/install-deps.sh --no-global --no-dev-tools
```

### Running the Server

#### Development Mode

```bash
# Basic development server
./scripts/run-native.sh --dev

# With custom port
./scripts/run-native.sh --dev --port 8080

# With auto-generated TLS certificate
./scripts/run-native.sh --dev --auto-tls

# With PM2 process management
./scripts/run-native.sh --pm2 --dev
```

#### Production Mode

```bash
# Basic production server
./scripts/run-native.sh

# With existing TLS certificates
./scripts/run-native.sh --tls /path/to/key.pem /path/to/cert.pem

# With custom environment file
./scripts/run-native.sh --env config/production.env

# With PM2 clustering
./scripts/run-native.sh --pm2 --instances max
```

### Supported Runtimes

- **Node.js**: Standard runtime with full compatibility
- **Bun**: High-performance runtime (faster startup and execution)

## ⚙️ Configuration

### Environment Files

1. **`config/production.env`**: Production-ready settings
   - Security headers enabled
   - Rate limiting configured
   - TLS settings
   - Performance optimizations

2. **`config/development.env`**: Development-friendly settings
   - Verbose logging
   - Relaxed CORS
   - Hot reload enabled
   - Debug endpoints

3. **`config/docker.env`**: Container-specific settings
   - Container orchestration variables
   - Service discovery configuration
   - Resource limits

### Key Configuration Options

```bash
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# TLS Configuration
TLS_ENABLED=true
TLS_KEY=/path/to/key.pem
TLS_CERT=/path/to/cert.pem

# Authentication
AUTH_TOKENS=token1,token2,token3
SECURITY_HEADERS_ENABLED=true

# CORS
ALLOWED_ORIGINS=https://example.com,https://app.example.com

# Rate Limiting
RATE_LIMIT=60
ENABLE_DISTRIBUTED_RATE_LIMIT=true
REDIS_URL=redis://localhost:6379

# SSE Configuration
HEARTBEAT_MS=25000
MAX_SSE_CONNECTIONS=1000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
AUDIT_LOG_ENABLED=true
```

## 🔒 Security Features

### Container Security

- **Non-root user**: Runs as node user (UID 1000)
- **Distroless image**: Minimal packages and attack surface
- **Security scanning**: Automated vulnerability detection
- **SBOM generation**: Software Bill of Materials

### Application Security

- **Security headers**: CSP, HSTS, X-Frame-Options, etc.
- **Rate limiting**: IP and token-based with distributed support
- **Input validation**: Comprehensive request validation
- **Audit logging**: Structured security event logging
- **TLS support**: HTTPS with certificate management

### Secret Management

```bash
# Environment variables for sensitive data
AUTH_TOKENS=your-secure-tokens
WEBHOOK_SECRET=your-webhook-secret
REDIS_PASSWORD=your-redis-password

# Docker secrets (recommended for production)
echo "secret-value" | docker secret create secret-name -
```

## 🔍 Monitoring & Health Checks

### Health Endpoints

- **`GET /healthz`**: Liveness probe
- **`GET /readyz`**: Readiness probe  
- **`GET /metrics`**: Prometheus metrics
- **`GET /security/metrics`**: Security metrics (authenticated)

### Health Check Script

```bash
# Interactive health check
./scripts/health-check.sh --host localhost --port 3000

# Container mode (exit codes only)
./scripts/health-check.sh --container --host localhost --port 3000

# Custom endpoint
./scripts/health-check.sh --endpoint /readyz --timeout 10
```

### Monitoring Stack

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and alerting
- **Loki**: Log aggregation
- **Promtail**: Log shipping

## 🚀 CI/CD Pipeline

### GitHub Actions Workflow

The pipeline includes:

1. **Testing**: Unit tests, linting, type checking
2. **Security Scanning**: Trivy vulnerability scanning
3. **Multi-arch Build**: AMD64 and ARM64 support
4. **Container Scanning**: Image vulnerability analysis
5. **SBOM Generation**: Software Bill of Materials
6. **Deployment**: Staging and production environments
7. **Integration Testing**: Post-deployment validation
8. **Performance Testing**: Load and stress testing

### Pipeline Triggers

- **Push to main**: Staging deployment
- **Tags**: Production deployment
- **Pull requests**: Testing and validation only

## 🔧 Troubleshooting

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

```bash
# Enable debug logging
LOG_LEVEL=debug DEBUG_MODE=true ./scripts/run-native.sh --dev

# Docker debug mode
docker run -e LOG_LEVEL=debug -e DEBUG_MODE=true task-mcp-http:latest
```

## 📚 Additional Resources

- **[Deployment Guide](DEPLOYMENT_GUIDE.md)**: Comprehensive deployment documentation
- **[API Documentation](../docs/api_reference.md)**: API endpoint documentation
- **[Security Guide](../docs/security.md)**: Security best practices
- **[Performance Guide](../docs/performance.md)**: Performance optimization

## 🆘 Support

For deployment issues:

1. Check the troubleshooting section above
2. Review application logs for error messages
3. Validate environment configuration
4. Test health endpoints
5. Check network connectivity
6. Verify TLS certificates

For additional support:
- Create an issue in the GitHub repository
- Include environment details and error logs
- Provide steps to reproduce the issue

---

## 🎯 Deployment Checklist

### Pre-deployment

- [ ] Review and update environment configurations
- [ ] Generate/obtain TLS certificates
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategies
- [ ] Review security settings
- [ ] Test health endpoints

### Post-deployment

- [ ] Verify all services are running
- [ ] Check health endpoints
- [ ] Monitor application logs
- [ ] Validate TLS certificates
- [ ] Test key functionality
- [ ] Review monitoring dashboards

### Ongoing Maintenance

- [ ] Regular security updates
- [ ] Monitor performance metrics
- [ ] Review and rotate secrets
- [ ] Update documentation
- [ ] Backup configurations and data
- [ ] Test disaster recovery procedures