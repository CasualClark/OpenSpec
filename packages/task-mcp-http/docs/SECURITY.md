# Security Configuration Guide

This document provides comprehensive information about the security features implemented in the Task MCP HTTPS/SSE server.

## Overview

The server implements defense-in-depth security with multiple layers of protection:

- **Enhanced Authentication**: Bearer token and cookie-based authentication with audit logging
- **CORS Configuration**: Configurable origin whitelist with proper preflight handling
- **Rate Limiting**: IP-based and token-based rate limiting with burst control
- **Security Headers**: Comprehensive security headers including CSP, HSTS, and more
- **Audit Logging**: Structured JSON logging for all security events

## Authentication

### Bearer Token Authentication

The server supports bearer token authentication for API clients:

```bash
curl -X POST https://your-server.com/sse \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"tool": "change.open", "input": {...}}'
```

### Cookie-based Authentication

For browser-based EventSource connections, cookie authentication is supported:

```javascript
// Set cookie first (via a secure endpoint)
document.cookie = "auth_token=your-token-here; Secure; HttpOnly; SameSite=Strict";

// Then connect with EventSource
const eventSource = new EventSource('/sse');
```

### Configuration

Environment variables for authentication:

```bash
# Comma-separated list of valid tokens
AUTH_TOKENS=token1,token2,token3

# Development mode (no authentication)
AUTH_TOKENS=
```

### Features

- **Token Validation**: Validates tokens against configured list
- **Token Caching**: In-memory caching with expiration (1 hour)
- **Failed Attempt Tracking**: Tracks failed attempts per IP
- **Rate Limiting for Failed Auth**: Blocks IPs after excessive failed attempts
- **Audit Logging**: Logs all authentication attempts with correlation IDs

## CORS Configuration

### Origin Whitelist

Configure allowed origins via environment variables:

```bash
# Comma-separated list of allowed origins
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com

# Wildcard support (not recommended for production)
ALLOWED_ORIGINS=*
```

### Features

- **Preflight Handling**: Proper OPTIONS request handling
- **Credential Support**: Supports cookies and authorization headers
- **Pattern Matching**: Supports wildcard patterns (`*.example.com`)
- **Dynamic Validation**: Runtime origin validation

### Example Configuration

```javascript
// Custom CORS configuration
const corsConfig = {
  origins: [
    'https://app.example.com',
    'https://admin.example.com',
    'http://localhost:3000' // Development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID'
  ]
};
```

## Rate Limiting

### Configuration

Environment variables for rate limiting:

```bash
# Base rate limit (requests per minute)
RATE_LIMIT=60

# Burst limit (1.5x base limit by default)
RATE_LIMIT_BURST=90

# Rate limit window (milliseconds)
RATE_LIMIT_WINDOW_MS=60000

# Enable distributed rate limiting (Redis required)
ENABLE_DISTRIBUTED_RATE_LIMIT=false
REDIS_URL=redis://localhost:6379
```

### Features

- **Dual Key Strategy**: Uses auth tokens or IP addresses for rate limiting
- **Burst Control**: Allows temporary bursts above base limit
- **Token-based Limiting**: Separate limits per authentication token
- **IP-based Limiting**: Fallback to IP-based limiting for unauthenticated requests
- **Distributed Support**: Redis-based distributed rate limiting (optional)

### Rate Limit Headers

The server includes rate limit information in response headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 2023-10-25T18:00:00.000Z
Retry-After: 30
```

### Example Implementation

```javascript
// Custom rate limiting configuration
const rateLimitConfig = {
  requestsPerMinute: 100,
  burstLimit: 150,
  windowMs: 60000,
  keyGenerator: (request) => {
    // Custom key generation logic
    return request.headers['x-api-key'] || request.ip;
  }
};
```

## Security Headers

### Configuration

Environment variables for security headers:

```bash
# Enable/disable security headers
SECURITY_HEADERS_ENABLED=true
```

### Default Headers

The server sets the following security headers by default:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=(), ...
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Permitted-Cross-Domain-Policies: none
```

### HSTS Configuration

When TLS is enabled, HSTS headers are automatically configured:

```bash
# HSTS is automatically enabled when TLS is configured
TLS_KEY=/path/to/server.key
TLS_CERT=/path/to/server.crt
```

Resulting header:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### Custom Configuration

```javascript
// Custom security headers configuration
const securityHeadersConfig = {
  enabled: true,
  contentSecurityPolicy: {
    enabled: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.example.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  strictTransportSecurity: {
    enabled: true,
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false
  }
};
```

## Audit Logging

### Configuration

Environment variables for audit logging:

```bash
# Audit log level
AUDIT_LOG_LEVEL=info

# Audit log file (optional, defaults to ./audit.log)
AUDIT_LOG_FILE=./audit.log
```

### Log Format

Audit logs are structured JSON with the following format:

```json
{
  "type": "auth_success",
  "requestId": "req_123456789",
  "timestamp": 1698234567890,
  "clientInfo": {
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "origin": "https://app.example.com"
  },
  "success": true,
  "tokenType": "bearer",
  "userId": "user_abc123",
  "sessionId": "sess_xyz789"
}
```

### Event Types

The audit system logs the following event types:

- **Authentication Events**: `auth_success`, `auth_invalid`, `auth_missing`, `auth_error`
- **Request Events**: `request_success`, `request_error`, `request_blocked`
- **Security Incidents**: `security_brute_force`, `security_injection_attempt`, `security_suspicious_activity`

### Security Metrics

Access security metrics via the `/security/metrics` endpoint:

```bash
curl -X GET https://your-server.com/security/metrics \
  -H "Authorization: Bearer your-token-here"
```

Response:
```json
{
  "success": true,
  "data": {
    "audit": {
      "totalRequests": 1250,
      "successfulAuths": 1180,
      "failedAuths": 70,
      "rateLimitedRequests": 15,
      "suspiciousIPs": ["192.168.1.100"],
      "lastUpdated": 1698234567890
    },
    "auth": {
      "cachedTokens": 25,
      "trackedIPs": 45,
      "rateLimitedIPs": ["192.168.1.100"]
    },
    "rateLimit": {
      "totalRecords": 45,
      "activeRecords": 32,
      "keyTypes": {
        "token": 28,
        "ip": 17
      }
    }
  }
}
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Authentication Metrics**
   - Failed authentication rate
   - Unique IP addresses with failed attempts
   - Rate-limited IPs

2. **Rate Limiting Metrics**
   - Rate limit violations
   - Burst limit usage
   - Token vs IP-based limiting distribution

3. **Security Incident Metrics**
   - Brute force attempts
   - Suspicious activity patterns
   - Injection attempts

### Alerting Recommendations

Set up alerts for:

- Failed authentication rate > 10% of total requests
- Rate limit violations > 100/minute
- Security incidents of any kind
- New suspicious IP addresses

### Log Analysis

Use the structured audit logs for security analysis:

```bash
# Find failed authentication attempts
grep '"type":"auth_invalid"' audit.log

# Identify suspicious IP addresses
grep '"type":"auth_invalid"' audit.log | jq -r '.clientInfo.ipAddress' | sort | uniq -c | sort -nr

# Analyze rate limit violations
grep '"type":"auth_rate_limited"' audit.log
```

## Best Practices

### Production Deployment

1. **Use HTTPS**: Always enable TLS in production
2. **Strong Authentication**: Use long, random tokens
3. **CORS Restrictions**: Limit origins to specific domains
4. **Rate Limiting**: Configure appropriate limits for your use case
5. **Monitoring**: Set up comprehensive monitoring and alerting
6. **Log Rotation**: Implement log rotation for audit logs
7. **Regular Security Reviews**: Periodically review security configurations

### Token Management

1. **Token Rotation**: Regularly rotate authentication tokens
2. **Token Expiration**: Implement token expiration policies
3. **Secure Storage**: Store tokens securely (environment variables, secret management)
4. **Least Privilege**: Use different tokens for different purposes

### Rate Limiting Strategy

1. **Tiered Limits**: Implement different limits for different user types
2. **Graduated Response**: Implement graduated responses to violations
3. **Whitelisting**: Whitelist trusted IPs if necessary
4. **Burst Allowance**: Configure appropriate burst limits for legitimate traffic

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Check `ALLOWED_ORIGINS` configuration
   - Verify preflight requests are handled correctly
   - Ensure credentials are included if needed

2. **Rate Limiting Issues**
   - Check rate limit configuration
   - Verify key generation strategy
   - Monitor rate limit headers in responses

3. **Authentication Problems**
   - Verify token format and validity
   - Check authorization header format
   - Review audit logs for error details

4. **Security Header Issues**
   - Check browser developer tools for warnings
   - Verify CSP directives
   - Ensure HSTS is properly configured

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=debug
AUDIT_LOG_LEVEL=debug
```

This will provide detailed information about security middleware operation.

## Security Considerations

### Threat Model

The security implementation addresses the following threats:

1. **Unauthorized Access**: Prevented by strong authentication
2. **Cross-Origin Attacks**: Mitigated by CORS configuration
3. **Denial of Service**: Limited by rate limiting
4. **Client-Side Attacks**: Mitigated by security headers
5. **Data Leakage**: Prevented by audit logging and monitoring

### Limitations

1. **Distributed Rate Limiting**: Requires Redis for multi-instance deployments
2. **Token Storage**: Currently uses in-memory storage (not persistent)
3. **IP Spoofing**: Limited protection against IP spoofing
4. **Browser Compatibility**: Some security headers may not be supported by older browsers

### Future Enhancements

1. **JWT Support**: Add JWT token support
2. **OAuth Integration**: Integrate with OAuth providers
3. **Web Application Firewall**: Add WAF capabilities
4. **Machine Learning**: Implement ML-based anomaly detection
5. **Geo-blocking**: Add geographic-based access control

For more information or to report security issues, please refer to the project's security policy.