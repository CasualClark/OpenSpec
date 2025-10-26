# Nginx Setup Guide for Task MCP HTTP Server

This comprehensive guide covers the setup, configuration, and deployment of Nginx as a reverse proxy for the Task MCP HTTP server with SSE and NDJSON streaming capabilities.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration Structure](#configuration-structure)
5. [Environment Setup](#environment-setup)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [Performance Tuning](#performance-tuning)
8. [Security Hardening](#security-hardening)
9. [Monitoring and Logging](#monitoring-and-logging)
10. [Troubleshooting](#troubleshooting)
11. [Maintenance](#maintenance)

## Overview

The Nginx configuration for Task MCP HTTP server provides:

- **Reverse Proxy**: Load balancing and request routing
- **SSE Optimization**: Specialized configuration for Server-Sent Events
- **NDJSON Streaming**: Optimized for streaming JSON responses
- **Security Hardening**: Comprehensive security headers and protections
- **TLS Termination**: Modern SSL/TLS configuration
- **Rate Limiting**: Protection against abuse and DDoS
- **Monitoring**: Structured logging and metrics

## Prerequisites

### System Requirements

- **Operating System**: Ubuntu 20.04+, CentOS 8+, or RHEL 8+
- **Nginx**: Version 1.20+ (for HTTP/2 and modern TLS)
- **OpenSSL**: Version 1.1.1+ (for TLS 1.3 support)
- **Memory**: Minimum 2GB RAM
- **Storage**: Minimum 10GB available disk space
- **Network**: Stable internet connection for certificate management

### Software Dependencies

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx openssl curl

# CentOS/RHEL
sudo yum update
sudo yum install nginx openssl curl

# Or using dnf (newer versions)
sudo dnf install nginx openssl curl
```

## Installation

### 1. Basic Nginx Installation

```bash
# Ubuntu/Debian
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2. Configuration Deployment

```bash
# Create configuration directories
sudo mkdir -p /etc/nginx/sites-available
sudo mkdir -p /etc/nginx/sites-enabled
sudo mkdir -p /etc/nginx/conf.d
sudo mkdir -p /etc/nginx/ssl

# Copy configuration files
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
sudo cp nginx/conf.d/* /etc/nginx/conf.d/
sudo cp nginx/sites-available/* /etc/nginx/sites-available/

# Enable sites (create symlinks)
sudo ln -sf /etc/nginx/sites-available/task-mcp-prod.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/task-mcp-staging.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/task-mcp-dev.conf /etc/nginx/sites-enabled/

# Create log directories
sudo mkdir -p /var/log/nginx
sudo mkdir -p /var/www/task-mcp/static
```

### 3. Configuration Validation

```bash
# Test Nginx configuration
sudo nginx -t

# If successful, reload Nginx
sudo systemctl reload nginx
```

## Configuration Structure

```
nginx/
├── nginx.conf                 # Main configuration file
├── conf.d/                    # Modular configurations
│   ├── upstream.conf          # Backend server definitions
│   ├── ssl.conf              # SSL/TLS settings
│   ├── security.conf         # Security headers and limits
│   ├── sse.conf              # SSE-specific configuration
│   └── logging.conf          # Log formats and settings
├── sites-available/           # Site configurations
│   ├── task-mcp-dev.conf     # Development environment
│   ├── task-mcp-staging.conf # Staging environment
│   └── task-mcp-prod.conf    # Production environment
└── ssl/                      # SSL certificates
    ├── task-mcp-server.crt
    ├── task-mcp-server.key
    └── task-mcp-chain.crt
```

## Environment Setup

### Development Environment

1. **Update server configuration**:
   ```bash
   sudo nano /etc/nginx/sites-available/task-mcp-dev.conf
   ```

2. **Configure upstream servers**:
   ```bash
   sudo nano /etc/nginx/conf.d/upstream.conf
   # Update backend server IPs and ports
   ```

3. **Enable development site**:
   ```bash
   sudo ln -sf /etc/nginx/sites-available/task-mcp-dev.conf /etc/nginx/sites-enabled/01-task-mcp-dev.conf
   sudo systemctl reload nginx
   ```

### Staging Environment

1. **Configure staging settings**:
   ```bash
   sudo nano /etc/nginx/sites-available/task-mcp-staging.conf
   ```

2. **Set up SSL certificates**:
   ```bash
   sudo certbot --nginx -d staging.task-mcp.fission.ai
   ```

3. **Enable staging site**:
   ```bash
   sudo ln -sf /etc/nginx/sites-available/task-mcp-staging.conf /etc/nginx/sites-enabled/02-task-mcp-staging.conf
   sudo systemctl reload nginx
   ```

### Production Environment

1. **Configure production settings**:
   ```bash
   sudo nano /etc/nginx/sites-available/task-mcp-prod.conf
   ```

2. **Set up production SSL**:
   ```bash
   sudo certbot --nginx -d task-mcp.fission.ai -d api.task-mcp.fission.ai
   ```

3. **Enable production site**:
   ```bash
   sudo ln -sf /etc/nginx/sites-available/task-mcp-prod.conf /etc/nginx/sites-enabled/00-task-mcp-prod.conf
   sudo systemctl reload nginx
   ```

## SSL/TLS Configuration

### Let's Encrypt Setup

1. **Install Certbot**:
   ```bash
   # Ubuntu/Debian
   sudo apt install certbot python3-certbot-nginx
   
   # CentOS/RHEL
   sudo yum install certbot python3-certbot-nginx
   ```

2. **Obtain SSL Certificate**:
   ```bash
   sudo certbot --nginx -d task-mcp.fission.ai -d api.task-mcp.fission.ai
   ```

3. **Set up Auto-renewal**:
   ```bash
   sudo crontab -e
   # Add: 0 12 * * * /usr/bin/certbot renew --quiet
   ```

### Manual SSL Certificate Setup

1. **Generate Private Key**:
   ```bash
   sudo openssl genrsa -out /etc/nginx/ssl/task-mcp-server.key 2048
   ```

2. **Generate Certificate Signing Request**:
   ```bash
   sudo openssl req -new -key /etc/nginx/ssl/task-mcp-server.key -out /etc/nginx/ssl/task-mcp-server.csr
   ```

3. **Generate Self-Signed Certificate (for development)**:
   ```bash
   sudo openssl x509 -req -days 365 -in /etc/nginx/ssl/task-mcp-server.csr -signkey /etc/nginx/ssl/task-mcp-server.key -out /etc/nginx/ssl/task-mcp-server.crt
   ```

### SSL Configuration

Edit `/etc/nginx/conf.d/ssl.conf`:

```nginx
# Modern TLS 1.3 configuration
ssl_protocols TLSv1.3;
ssl_ciphers TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256;
ssl_prefer_server_ciphers on;

# Session settings
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:50m;
ssl_session_tickets off;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;

# HSTS
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

## Performance Tuning

### Worker Process Configuration

Edit `/etc/nginx/nginx.conf`:

```nginx
# Optimize worker processes
worker_processes auto;
worker_connections 4096;

# Enable epoll for Linux
events {
    use epoll;
    multi_accept on;
}
```

### Buffer and Timeout Settings

```nginx
# Client settings
client_max_body_size 10M;
client_body_buffer_size 128k;
client_header_buffer_size 1k;

# Proxy settings
proxy_buffering off;
proxy_buffer_size 4k;
proxy_buffers 8 4k;
proxy_connect_timeout 30s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
```

### Gzip Compression

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types
    text/plain
    text/css
    text/xml
    application/json
    application/javascript;
```

### Keep-alive Optimization

```nginx
keepalive_timeout 65;
keepalive_requests 100;

# Upstream keepalive
upstream task_mcp_backend {
    keepalive 32;
    keepalive_requests 100;
    keepalive_timeout 60s;
}
```

## Security Hardening

### Rate Limiting

```nginx
# Define rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=sse:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=20r/s;

# Apply rate limiting
location /api {
    limit_req zone=api burst=20 nodelay;
}

location /sse {
    limit_req zone=sse burst=10 nodelay;
}
```

### Security Headers

```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'" always;
```

### IP Restrictions

```nginx
# Restrict access to sensitive endpoints
location /admin {
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;
}

location /metrics {
    allow 127.0.0.1;
    allow 10.0.0.0/8;
    deny all;
}
```

### Request Validation

```nginx
# Block suspicious requests
if ($request_method !~ ^(GET|POST|HEAD|OPTIONS)$) {
    return 405;
}

# Block common attack patterns
location ~* \.(aspx|php|jsp|cgi)$ {
    deny all;
}
```

## Monitoring and Logging

### Log Configuration

1. **Custom Log Formats**:
   ```bash
   sudo nano /etc/nginx/conf.d/logging.conf
   ```

2. **Structured JSON Logging**:
   ```nginx
   log_format json_main escape=json
       '{'
       '"time_local":"$time_local",'
       '"remote_addr":"$remote_addr",'
       '"request":"$request",'
       '"status": "$status",'
       '"request_time":"$request_time",'
       '"upstream_response_time":"$upstream_response_time"'
       '}';
   ```

3. **Access Log Configuration**:
   ```nginx
   access_log /var/log/nginx/access.log json_main buffer=64k flush=1m;
   error_log /var/log/nginx/error.log warn buffer=32k flush=1m;
   ```

### Log Rotation

Create `/etc/logrotate.d/nginx`:

```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 nginx nginx
    postrotate
        /bin/kill -USR1 `cat /run/nginx.pid 2> /dev/null` 2> /dev/null || true
    endscript
}
```

### Health Checks

```bash
# Check Nginx status
sudo systemctl status nginx

# Test configuration
sudo nginx -t

# Check active connections
sudo ss -tulpn | grep nginx

# Monitor logs in real-time
sudo tail -f /var/log/nginx/access.log
```

### Metrics Collection

1. **Prometheus Integration**:
   ```nginx
   location /nginx_status {
     stub_status on;
     access_log off;
     allow 127.0.0.1;
     deny all;
   }
   ```

2. **Custom Metrics**:
   ```nginx
   # Add custom metrics to logs
   log_format metrics '$remote_addr - $remote_user [$time_local] "$request" '
                     '$status $body_bytes_sent $request_time '
                     '$upstream_response_time $upstream_addr';
   ```

## Troubleshooting

### Common Issues

1. **502 Bad Gateway**:
   ```bash
   # Check backend status
   curl -I http://localhost:3000/healthz
   
   # Check Nginx error log
   sudo tail -f /var/log/nginx/error.log
   
   # Verify upstream configuration
   sudo nginx -t | grep upstream
   ```

2. **SSL Certificate Issues**:
   ```bash
   # Check certificate validity
   openssl x509 -in /etc/nginx/ssl/task-mcp-server.crt -text -noout
   
   # Test SSL configuration
   sudo nginx -t
   
   # Check certificate chain
   openssl s_client -connect task-mcp.fission.ai:443 -servername task-mcp.fission.ai
   ```

3. **Performance Issues**:
   ```bash
   # Check Nginx connections
   sudo ss -tulpn | grep nginx
   
   # Monitor resource usage
   top -p $(pgrep nginx)
   
   # Check slow requests
   sudo tail -f /var/log/nginx/access.log | awk '$NF > 1.0'
   ```

### Debug Commands

```bash
# Test configuration syntax
sudo nginx -t

# Check loaded modules
sudo nginx -V

# Monitor real-time traffic
sudo tcpdump -i any port 80 or port 443

# Check SSL handshake
openssl s_client -connect localhost:443 -servername localhost

# Test SSE endpoint
curl -N -H "Accept: text/event-stream" http://localhost/sse

# Test NDJSON endpoint
curl -N -H "Accept: application/x-ndjson" http://localhost/mcp
```

### Performance Analysis

```bash
# Benchmark with ApacheBench
ab -n 1000 -c 10 http://localhost/healthz

# Test with wrk
wrk -t12 -c400 -d30s http://localhost/

# Check response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost/healthz
```

## Maintenance

### Regular Tasks

1. **Daily**:
   ```bash
   # Check logs for errors
   sudo grep -i error /var/log/nginx/error.log
   
   # Monitor SSL certificate expiry
   sudo certbot certificates
   ```

2. **Weekly**:
   ```bash
   # Update Nginx
   sudo apt update && sudo apt upgrade nginx
   
   # Rotate logs
   sudo logrotate -f /etc/logrotate.d/nginx
   
   # Check configuration
   sudo nginx -t
   ```

3. **Monthly**:
   ```bash
   # Performance tuning review
   sudo nginx -T | grep -E "(worker|keepalive|timeout)"
   
   # Security audit
   sudo nginx -T | grep -E "(add_header|ssl|limit_req)"
   ```

### Backup Configuration

```bash
# Backup Nginx configuration
sudo tar -czf /backup/nginx-$(date +%Y%m%d).tar.gz /etc/nginx/

# Backup SSL certificates
sudo tar -czf /backup/nginx-ssl-$(date +%Y%m%d).tar.gz /etc/nginx/ssl/

# Backup logs
sudo tar -czf /backup/nginx-logs-$(date +%Y%m%d).tar.gz /var/log/nginx/
```

### Updates and Upgrades

```bash
# Check current version
nginx -v

# Update Nginx
sudo apt update
sudo apt upgrade nginx

# Test after upgrade
sudo nginx -t
sudo systemctl reload nginx
```

## Additional Resources

- [Nginx Official Documentation](https://nginx.org/en/docs/)
- [OWASP Nginx Security Hardening](https://cheatsheetseries.owasp.org/cheatsheets/Nginx_Security_Cheat_Sheet.html)
- [SSL Labs SSL Test](https://www.ssllabs.com/ssltest/)
- [Nginx Performance Tuning Guide](https://www.nginx.com/blog/nginx-performance-tuning/)

## Support

For issues related to the Task MCP Nginx configuration:

1. Check the [troubleshooting section](#troubleshooting)
2. Review application logs in `/var/log/nginx/`
3. Verify backend service status
4. Test configuration with `nginx -t`
5. Check upstream server connectivity

For general Nginx issues, refer to the official Nginx documentation and community forums.