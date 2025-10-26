# Security Configuration Guide

_Last updated: 2025-10-25_

## Overview

This guide covers the security features and configurations available in Task MCP HTTP server, including authentication, authorization, rate limiting, CORS, and security headers.

## Authentication

### Bearer Token Authentication

Task MCP HTTP server uses Bearer token authentication for API access.

#### Configuration

```bash
# Environment variables
AUTH_TOKENS=token1,token2,token3
```

#### Request Format

```http
POST /sse HTTP/1.1
Host: your-domain.com
Content-Type: application/json
Authorization: Bearer your-token-here
```

#### Token Security Best Practices

1. **Use long, random tokens**: Minimum 32 characters
2. **Rotate tokens regularly**: Every 90 days
3. **Use environment variables**: Never hardcode tokens
4. **Limit token scope**: Use different tokens for different environments

```bash
# Generate secure token
openssl rand -base64 32

# Example output: xJ9K2mN8pQ5rT7wV3yZ6aB1cD4eF8gH2jK5lM9nO=
```

### Token Validation

The server validates tokens using the following criteria:

- Token must be in the authorized tokens list
- Token must be at least 10 characters long
- Token must not be empty or null

```typescript
// Token validation logic
function validateToken(token: string, authorizedTokens: Set<string>): boolean {
  return authorizedTokens.has(token) && token.length >= 10;
}
```

## Authorization

### Role-Based Access Control

While the current implementation uses simple token-based authentication, the architecture supports role-based access control (RBAC) for future enhancements.

#### Future RBAC Structure

```typescript
interface Role {
  name: string;
  permissions: Permission[];
}

interface Permission {
  resource: string;
  actions: ('read' | 'write' | 'delete')[];
}

// Example roles
const roles = {
  admin: {
    name: 'admin',
    permissions: [
      { resource: '*', actions: ['read', 'write', 'delete'] }
    ]
  },
  developer: {
    name: 'developer',
    permissions: [
      { resource: 'changes', actions: ['read', 'write'] },
      { resource: 'tools', actions: ['read'] }
    ]
  }
};
```

## Rate Limiting

### Configuration

```bash
# Rate limiting settings
RATE_LIMIT=60                    # Requests per minute
RATE_LIMIT_BURST=90             # Burst limit
RATE_LIMIT_WINDOW_MS=60000      # Window size in milliseconds
ENABLE_DISTRIBUTED_RATE_LIMIT=false  # Redis-based limiting
REDIS_URL=redis://localhost:6379  # Redis URL for distributed limiting
```

### Rate Limiting Strategies

#### 1. IP-Based Rate Limiting

Default strategy using client IP address:

```typescript
class IPRateLimiter {
  private requests = new Map<string, number[]>();
  
  isAllowed(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    let requests = this.requests.get(ip) || [];
    requests = requests.filter(time => time > windowStart);
    
    if (requests.length >= this.maxRequests) {
      return false;
    }
    
    requests.push(now);
    this.requests.set(ip, requests);
    return true;
  }
}
```

#### 2. Token-Based Rate Limiting

When authentication token is provided:

```typescript
class TokenRateLimiter {
  isAllowed(token: string): boolean {
    // Use token as rate limit key
    return this.checkRateLimit(token);
  }
}
```

#### 3. Distributed Rate Limiting

For multi-instance deployments using Redis:

```typescript
class DistributedRateLimiter {
  constructor(private redis: Redis) {}
  
  async isAllowed(key: string): Promise<boolean> {
    const now = Date.now();
    const window = Math.floor(now / this.windowMs);
    const redisKey = `rate_limit:${key}:${window}`;
    
    const current = await this.redis.incr(redisKey);
    
    if (current === 1) {
      await this.redis.expire(redisKey, Math.ceil(this.windowMs / 1000));
    }
    
    return current <= this.maxRequests;
  }
}
```

### Rate Limiting Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1698224060
X-RateLimit-Retry-After: 30
```

### Rate Limiting Response

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "hint": "Try again in 30 seconds",
    "retryAfter": 30
  },
  "timestamp": "2025-10-25T10:00:00.000Z"
}
```

## CORS (Cross-Origin Resource Sharing)

### Configuration

```bash
# CORS settings
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
CORS_STRICT=true
```

### CORS Headers

```http
Access-Control-Allow-Origin: https://your-domain.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Cache-Control
Access-Control-Max-Age: 86400
Access-Control-Allow-Credentials: true
```

### CORS Middleware Implementation

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

export class CorsMiddleware {
  constructor(private config: CorsConfig) {}
  
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const origin = request.headers.origin;
      
      if (this.isOriginAllowed(origin)) {
        reply.header('Access-Control-Allow-Origin', origin);
      }
      
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
      reply.header('Access-Control-Max-Age', '86400');
      
      if (request.method === 'OPTIONS') {
        reply.code(204).send();
        return;
      }
    };
  }
  
  private isOriginAllowed(origin?: string): boolean {
    if (!origin) return false;
    if (this.config.allowedOrigins.includes('*')) return true;
    return this.config.allowedOrigins.includes(origin);
  }
}
```

### Preflight Request Handling

```http
OPTIONS /sse HTTP/1.1
Host: your-domain.com
Origin: https://your-domain.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type, Authorization

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://your-domain.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Cache-Control
Access-Control-Max-Age: 86400
```

## Security Headers

### Default Security Headers

```bash
# Enable security headers
SECURITY_HEADERS_ENABLED=true
```

### Header Configuration

```typescript
export class SecurityHeadersMiddleware {
  constructor(private config: SecurityConfig) {}
  
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!this.config.enabled) return;
      
      // Content Security Policy
      reply.header('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self'; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'"
      );
      
      // Frame protection
      reply.header('X-Frame-Options', 'DENY');
      
      // MIME type sniffing protection
      reply.header('X-Content-Type-Options', 'nosniff');
      
      // XSS protection
      reply.header('X-XSS-Protection', '1; mode=block');
      
      // HTTP Strict Transport Security (HTTPS only)
      if (this.config.strictTransportSecurity?.enabled) {
        const hstsValue = [
          `max-age=${this.config.strictTransportSecurity.maxAge}`,
          this.config.strictTransportSecurity.includeSubDomains ? 'includeSubDomains' : '',
          this.config.strictTransportSecurity.preload ? 'preload' : ''
        ].filter(Boolean).join('; ');
        
        reply.header('Strict-Transport-Security', hstsValue);
      }
      
      // Referrer policy
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Permissions policy
      reply.header('Permissions-Policy', 
        'geolocation=(), ' +
        'microphone=(), ' +
        'camera=(), ' +
        'payment=(), ' +
        'usb=(), ' +
        'magnetometer=(), ' +
        'gyroscope=(), ' +
        'accelerometer=()'
      );
    };
  }
}
```

### HSTS Configuration

```typescript
interface HSTSConfig {
  enabled: boolean;
  maxAge: number;
  includeSubDomains: boolean;
  preload: boolean;
}

// Example configuration
const hstsConfig: HSTSConfig = {
  enabled: true,
  maxAge: 31536000, // 1 year
  includeSubDomains: true,
  preload: false
};
```

## Input Validation

### Schema Validation

All inputs are validated against JSON schemas using Zod:

```typescript
import { z } from 'zod';

const ToolRequestSchema = z.object({
  tool: z.string().min(1).max(100),
  input: z.record(z.any()),
  apiVersion: z.string().optional().default('1.0.0')
});

const ChangeOpenInputSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9\-]{1,62})[a-z0-9]$/),
  template: z.enum(['feature', 'bugfix', 'chore']).optional(),
  rationale: z.string().max(1000).optional(),
  owner: z.string().max(100).optional(),
  ttl: z.number().int().min(60).max(86400).optional()
});
```

### Input Sanitization

```typescript
export class InputSanitizer {
  static sanitizeString(input: string, maxLength: number = 1000): string {
    return input
      .trim()
      .substring(0, maxLength)
      .replace(/[<>]/g, ''); // Remove potential HTML
  }
  
  static sanitizeSlug(slug: string): string {
    return slug
      .toLowerCase()
      .replace(/[^a-z0-9\-]/g, '')
      .replace(/^-+|-+$/g, '');
  }
  
  static validateJSON(input: string): boolean {
    try {
      JSON.parse(input);
      return true;
    } catch {
      return false;
    }
  }
}
```

## Path Security

### Path Sandboxing

All file operations are restricted to the configured working directory:

```typescript
import path from 'path';

export class PathSandbox {
  constructor(private allowedRoot: string) {}
  
  validatePath(requestedPath: string): string {
    const resolvedPath = path.resolve(this.allowedRoot, requestedPath);
    
    if (!resolvedPath.startsWith(this.allowedRoot)) {
      throw new Error('Path traversal detected');
    }
    
    return resolvedPath;
  }
  
  isPathAllowed(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    return resolvedPath.startsWith(this.allowedRoot);
  }
}
```

### File Access Controls

```typescript
export class FileAccessControl {
  private readonly allowedExtensions = ['.md', '.json', '.txt'];
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  
  validateFile(filePath: string, content: Buffer): void {
    // Check file extension
    const ext = path.extname(filePath);
    if (!this.allowedExtensions.includes(ext)) {
      throw new Error(`File extension ${ext} not allowed`);
    }
    
    // Check file size
    if (content.length > this.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size`);
    }
    
    // Check for malicious content patterns
    const contentStr = content.toString('utf8');
    if (this.containsMaliciousContent(contentStr)) {
      throw new Error('File contains potentially malicious content');
    }
  }
  
  private containsMaliciousContent(content: string): boolean {
    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i
    ];
    
    return maliciousPatterns.some(pattern => pattern.test(content));
  }
}
```

## Audit Logging

### Configuration

```bash
# Audit logging settings
AUDIT_LOG_LEVEL=info
AUDIT_LOG_FILE=/var/log/task-mcp/audit.log
AUDIT_LOG_FORMAT=json
```

### Audit Event Structure

```typescript
interface AuditEvent {
  timestamp: string;
  requestId: string;
  event: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource: string;
  action: string;
  outcome: 'success' | 'failure';
  details?: Record<string, any>;
  risk: 'low' | 'medium' | 'high';
}
```

### Audit Logger Implementation

```typescript
export class AuditLogger {
  constructor(private config: AuditConfig) {}
  
  log(event: AuditEvent): void {
    const auditEntry = {
      ...event,
      timestamp: new Date().toISOString(),
      service: 'task-mcp-http'
    };
    
    this.writeLog(auditEntry);
  }
  
  private writeLog(entry: AuditEvent): void {
    const logLine = JSON.stringify(entry);
    
    if (this.config.logFile) {
      require('fs').appendFileSync(this.config.logFile, logLine + '\n');
    }
    
    if (this.config.enableConsole) {
      console.log(`[AUDIT] ${logLine}`);
    }
  }
  
  // Convenience methods
  logAuthentication(requestId: string, token: string, success: boolean, ip: string): void {
    this.log({
      requestId,
      event: 'authentication',
      userId: this.hashToken(token),
      ipAddress: ip,
      resource: 'auth',
      action: 'authenticate',
      outcome: success ? 'success' : 'failure',
      risk: success ? 'low' : 'medium'
    });
  }
  
  logToolExecution(requestId: string, tool: string, success: boolean, duration: number): void {
    this.log({
      requestId,
      event: 'tool_execution',
      resource: 'tool',
      action: tool,
      outcome: success ? 'success' : 'failure',
      details: { duration },
      risk: 'low'
    });
  }
  
  private hashToken(token: string): string {
    return require('crypto')
      .createHash('sha256')
      .update(token)
      .digest('hex')
      .substring(0, 8);
  }
}
```

## Security Monitoring

### Metrics Collection

```typescript
export class SecurityMetrics {
  private metrics = {
    authenticationAttempts: 0,
    authenticationFailures: 0,
    rateLimitViolations: 0,
    suspiciousRequests: 0,
    blockedRequests: 0
  };
  
  recordAuthenticationAttempt(success: boolean): void {
    this.metrics.authenticationAttempts++;
    if (!success) {
      this.metrics.authenticationFailures++;
    }
  }
  
  recordRateLimitViolation(): void {
    this.metrics.rateLimitViolations++;
  }
  
  recordSuspiciousRequest(): void {
    this.metrics.suspiciousRequests++;
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      authenticationFailureRate: this.metrics.authenticationAttempts > 0 
        ? this.metrics.authenticationFailures / this.metrics.authenticationAttempts 
        : 0
    };
  }
}
```

### Security Alerts

```typescript
export class SecurityAlerts {
  constructor(private auditLogger: AuditLogger) {}
  
  checkForSuspiciousActivity(metrics: SecurityMetrics): void {
    // High authentication failure rate
    if (metrics.authenticationFailureRate > 0.1) {
      this.alert('High authentication failure rate detected', {
        failureRate: metrics.authenticationFailureRate,
        totalAttempts: metrics.authenticationAttempts
      });
    }
    
    // Multiple rate limit violations
    if (metrics.rateLimitViolations > 100) {
      this.alert('High rate of limit violations detected', {
        violations: metrics.rateLimitViolations
      });
    }
  }
  
  private alert(message: string, details: any): void {
    this.auditLogger.log({
      requestId: 'system',
      event: 'security_alert',
      resource: 'system',
      action: 'alert',
      outcome: 'failure',
      details: { alert: message, ...details },
      risk: 'high'
    });
    
    // Send to external monitoring system
    this.sendToMonitoring(message, details);
  }
  
  private sendToMonitoring(message: string, details: any): void {
    // Integration with monitoring systems
    // Example: Prometheus alerts, Slack notifications, etc.
  }
}
```

## TLS/SSL Configuration

### Certificate Management

```bash
# TLS configuration
TLS_CERT=/app/ssl/cert.pem
TLS_KEY=/app/ssl/key.pem
```

### TLS Configuration

```typescript
export interface TLSConfig {
  cert: string;
  key: string;
  minVersion?: string;
  ciphers?: string[];
  rejectUnauthorized?: boolean;
}

const defaultTLSConfig: Partial<TLSConfig> = {
  minVersion: 'TLSv1.2',
  ciphers: [
    'ECDHE-RSA-AES256-GCM-SHA512',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-SHA384',
    'ECDHE-RSA-AES128-SHA256'
  ],
  rejectUnauthorized: true
};
```

### Certificate Rotation

```bash
#!/bin/bash
# Certificate rotation script

CERT_DIR="/app/ssl"
BACKUP_DIR="/app/ssl/backup"
NEW_CERT="$CERT_DIR/cert.new.pem"
NEW_KEY="$CERT_DIR/key.new.pem"

# Backup current certificates
mkdir -p "$BACKUP_DIR"
cp "$CERT_DIR/cert.pem" "$BACKUP_DIR/cert.$(date +%Y%m%d_%H%M%S).pem"
cp "$CERT_DIR/key.pem" "$BACKUP_DIR/key.$(date +%Y%m%d_%H%M%S).pem"

# Validate new certificates
if openssl x509 -in "$NEW_CERT" -text -noout && \
   openssl rsa -in "$NEW_KEY" -check; then
  
  # Replace certificates
  mv "$NEW_CERT" "$CERT_DIR/cert.pem"
  mv "$NEW_KEY" "$CERT_DIR/key.pem"
  
  # Reload server (graceful restart)
  kill -USR1 $(cat /var/run/task-mcp.pid)
  
  echo "Certificate rotation completed successfully"
else
  echo "Certificate validation failed"
  exit 1
fi
```

## Security Best Practices

### 1. Environment Security

```bash
# Use read-only filesystem where possible
docker run --read-only --tmpfs /tmp task-mcp-http

# Drop unnecessary capabilities
docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE task-mcp-http

# Use non-root user
docker run -u 1001:1001 task-mcp-http

# Set resource limits
docker run --memory=512m --cpus=1.0 task-mcp-http
```

### 2. Network Security

```bash
# Use internal networks
docker network create --driver bridge task-mcp-internal

# Expose only necessary ports
docker run -p 127.0.0.1:8443:8443 task-mcp-http

# Use firewall rules
ufw allow from 10.0.0.0/8 to any port 8443
```

### 3. Secret Management

```bash
# Use environment variables for secrets
export AUTH_TOKENS="token1,token2,token3"

# Use secret management systems
# AWS Secrets Manager, HashiCorp Vault, etc.

# Never log secrets
# Configure logging to exclude sensitive fields
```

### 4. Monitoring and Alerting

```yaml
# Prometheus alerts for security
groups:
  - name: security
    rules:
      - alert: HighAuthFailureRate
        expr: rate(authentication_failures_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High authentication failure rate"
          
      - alert: SuspiciousActivity
        expr: rate(suspicious_requests_total[5m]) > 10
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Suspicious activity detected"
```

## Security Checklist

### Deployment Security

- [ ] TLS/SSL certificates are valid and properly configured
- [ ] Authentication tokens are strong and regularly rotated
- [ ] Rate limiting is configured and tested
- [ ] CORS is properly configured for allowed origins
- [ ] Security headers are enabled
- [ ] File access is restricted to working directory
- [ ] Input validation is implemented for all endpoints
- [ ] Audit logging is enabled and monitored
- [ ] Container is running as non-root user
- [ ] Resource limits are configured
- [ ] Network access is restricted
- [ ] Secrets are properly managed

### Operational Security

- [ ] Regular security updates are applied
- [ ] Certificate expiration is monitored
- [ ] Security metrics are monitored
- [ ] Incident response plan is in place
- [ ] Backup and recovery procedures are tested
- [ ] Access logs are reviewed regularly
- [ ] Vulnerability scanning is performed
- [ ] Penetration testing is conducted
- [ ] Security training is provided to team

This comprehensive security guide provides all the necessary information to configure, monitor, and maintain secure deployments of Task MCP HTTP server.