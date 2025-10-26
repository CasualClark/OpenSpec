# Task MCP Security Guide

_Last updated: 2025-10-23_

## Overview

This comprehensive security guide covers the Task MCP server's security model, threat mitigation strategies, and best practices for secure deployment and usage.

## Security Architecture

### Defense in Depth

The Task MCP server implements multiple layers of security:

1. **Input Validation** - All inputs validated against strict schemas
2. **Path Sandboxing** - File system access restricted to safe directories
3. **Lock Management** - Atomic operations prevent race conditions
4. **Process Isolation** - Safe command execution with argument escaping
5. **Transport Security** - TLS encryption for HTTPS/SSE endpoints

## Threat Model

### Potential Threats

**Path Traversal Attacks**:
- Attempting to access files outside the OpenSpec sandbox
- Using relative paths like `../../../etc/passwd`
- Exploiting symbolic links

**Lock Manipulation**:
- Stealing locks from other users
- Creating stale locks to deny service
- Modifying lock file contents

**Injection Attacks**:
- Shell command injection through malicious inputs
- Argument injection in archive operations
- Template injection in scaffolding

**Resource Exhaustion**:
- Creating excessive numbers of changes
- Generating large files to consume disk space
- Lock starvation through TTL abuse

### Mitigation Strategies

**Path Traversal Protection**:
```typescript
function validatePath(requestedPath: string, allowedBase: string): void {
  const resolved = path.resolve(allowedBase, requestedPath);
  if (!resolved.startsWith(path.resolve(allowedBase))) {
    throw new Error('EPATH_ESCAPE');
  }
}
```

**Lock Security**:
- Atomic file creation using `O_CREAT | O_EXCL`
- TTL-based expiration with grace periods
- Owner validation for lock operations
- Audit logging for all lock changes

**Input Sanitization**:
- JSON schema validation for all inputs
- Slug regex enforcement: `^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$`
- Shell argument escaping using `execFile()` instead of `exec()`

## Lock File Security

### Lock File Format

```json
{
  "owner": "user@example.com",
  "since": "2025-10-23T14:30:00Z",
  "ttl": 3600,
  "pid": 12345,
  "hostname": "dev-machine.local"
}
```

### Lock File Security Properties

**Atomic Creation**:
```typescript
import { openSync, closeSync, writeFileSync } from 'fs';
import { constants } from 'fs';

function createLock(lockPath: string, lockData: LockData): void {
  try {
    const fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    writeFileSync(fd, JSON.stringify(lockData));
    closeSync(fd);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error('ELOCKED');
    }
    throw error;
  }
}
```

**Secure Permissions**:
- Lock files created with `0o600` permissions (owner read/write only)
- Sensitive data never logged or exposed in error messages
- Automatic cleanup of expired locks

**Reclaim Policy**:
```typescript
function canReclaimLock(lockPath: string, owner: string): boolean {
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const now = Date.now();
    const lockTime = new Date(lock.since).getTime();
    const ttlMs = lock.ttl * 1000;
    
    // Allow reclaim if expired or owned by same user
    return (now - lockTime) > ttlMs || lock.owner === owner;
  } catch {
    return false; // Corrupted lock file
  }
}
```

## Path Sandboxing

### Canonicalization

All paths are canonicalized and validated:

```typescript
import { resolve, normalize } from 'path';

function sandboxPath(input: string, base: string): string {
  // Normalize and resolve to absolute path
  const normalized = normalize(input);
  const absolute = resolve(base, normalized);
  
  // Ensure result is within base directory
  if (!absolute.startsWith(resolve(base))) {
    throw new Error('EPATH_ESCAPE');
  }
  
  return absolute;
}
```

### Allowed Operations

**Read Operations**:
- Files under `openspec/changes/{slug}/`
- Template files from `openspec/templates/`
- Configuration files from project root

**Write Operations**:
- Change directories under `openspec/changes/{slug}/`
- Lock files in change directories
- Receipt files after archival

**Forbidden Operations**:
- Access outside `openspec/` directory
- System files and configuration
- Other users' files (without proper permissions)

### Symbolic Link Handling

```typescript
function safeResolve(symlinkPath: string, base: string): string {
  const stats = lstatSync(symlinkPath);
  if (stats.isSymbolicLink()) {
    const target = readlinkSync(symlinkPath);
    const resolved = resolve(dirname(symlinkPath), target);
    
    // Recursive check for symlink chains
    return safeResolve(resolved, base);
  }
  
  return sandboxPath(symlinkPath, base);
}
```

## Input Validation

### Slug Validation

**Regex Pattern**:
```typescript
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$/;

function validateSlug(slug: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(`EBADSLUG: Slug must match ${SLUG_REGEX}`);
  }
  
  if (slug.length > 64) {
    throw new Error('EBADSLUG: Slug too long (max 64 characters)');
  }
}
```

**Security Considerations**:
- Prevents directory traversal through slug names
- Avoids filesystem conflicts with reserved names
- Ensures URL-safe identifiers for web interfaces

### Template Validation

```typescript
const ALLOWED_TEMPLATES = ['feature', 'bugfix', 'chore'];

function validateTemplate(template: string): void {
  if (!ALLOWED_TEMPLATES.includes(template)) {
    throw new Error(`EBADTEMPLATE: Template must be one of ${ALLOWED_TEMPLATES.join(', ')}`);
  }
}
```

### TTL Validation

```typescript
function validateTTL(ttl: number): void {
  if (ttl < 60) {
    throw new Error('EBADTTL: TTL must be at least 60 seconds');
  }
  if (ttl > 86400) {
    throw new Error('EBADTTL: TTL must not exceed 24 hours');
  }
}
```

## Process Security

### Safe Command Execution

**Archive Operation**:
```typescript
import { execFile } from 'child_process';

function safeArchive(slug: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use execFile to prevent shell injection
    execFile('openspec', ['archive', slug, '--yes'], {
      cwd: process.cwd(),
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024, // 1MB output limit
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Archive failed: ${error.message}`));
        return;
      }
      resolve();
    });
  });
}
```

**Security Benefits**:
- No shell interpretation of arguments
- Explicit argument array prevents injection
- Timeout prevents hanging operations
- Buffer limits prevent memory exhaustion

### Environment Security

```typescript
function createSecureEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  
  // Remove sensitive environment variables
  delete env.PASSWORD;
  delete env.TOKEN;
  delete env.SECRET_KEY;
  
  // Add security-relevant variables
  env.NODE_ENV = 'production';
  env.OPENSPEC_SECURITY_LEVEL = 'strict';
  
  return env;
}
```

## Transport Security

### TLS Configuration

**HTTPS Server Setup**:
```typescript
import { createServer } from 'https';
import { readFileSync } from 'fs';

const tlsOptions = {
  key: readFileSync('/path/to/private.key'),
  cert: readFileSync('/path/to/certificate.crt'),
  ca: readFileSync('/path/to/ca-bundle.crt'),
  
  // Strong cipher suites
  ciphers: [
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-SHA384',
    'ECDHE-RSA-AES128-SHA256'
  ].join(':'),
  
  // TLS 1.2+ only
  minVersion: 'TLSv1.2',
  
  // HSTS for additional security
  hsts: true
};
```

### Authentication

**Bearer Token Authentication**:
```typescript
function validateBearerToken(req: IncomingMessage): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.slice(7);
  return validateToken(token); // Implement token validation
}
```

**Rate Limiting**:
```typescript
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(clientId: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const client = rateLimiter.get(clientId);
  
  if (!client || now > client.resetTime) {
    rateLimiter.set(clientId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (client.count >= limit) {
    return false;
  }
  
  client.count++;
  return true;
}
```

## Audit Logging

### Security Event Logging

```typescript
interface SecurityEvent {
  timestamp: string;
  event: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  details: Record<string, any>;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

function logSecurityEvent(event: SecurityEvent): void {
  const logEntry = {
    ...event,
    timestamp: new Date().toISOString(),
    service: 'task-mcp'
  };
  
  // Write to secure log file
  appendFileSync('/var/log/openspec-security.log', JSON.stringify(logEntry) + '\n');
  
  // Critical events trigger immediate alerts
  if (event.severity === 'critical') {
    sendAlert(event);
  }
}
```

### Events to Log

**Authentication Events**:
- Successful logins
- Failed authentication attempts
- Token expirations
- Unauthorized access attempts

**Resource Access Events**:
- Change creation and archival
- Lock acquisition and release
- File access outside normal patterns
- Unusual resource consumption

**Security Violations**:
- Path traversal attempts
- Lock manipulation attempts
- Injection attack attempts
- Rate limit violations

## Best Practices

### Deployment Security

**File Permissions**:
```bash
# OpenSpec directory permissions
chmod 755 /path/to/project/openspec/
chmod 700 /path/to/project/openspec/changes/

# Lock file permissions (automatic)
touch openspec/changes/.lock
chmod 600 openspec/changes/.lock
```

**Process Isolation**:
```bash
# Run as non-root user
useradd -r -s /bin/false openspec
sudo -u openspec task-mcp --stdio

# Use container isolation
docker run --user 1000:1000 --read-only --tmpfs /tmp openspec/task-mcp
```

**Network Security**:
```bash
# Firewall rules for HTTPS endpoint
ufw allow 443/tcp
ufw deny 80/tcp  # Redirect to HTTPS

# Rate limiting with nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

### Operational Security

**Regular Security Tasks**:
```bash
# Clean up expired locks daily
find openspec/changes -name ".lock" -mtime +1 -delete

# Audit change permissions weekly
find openspec/changes -type f -not -perm 644

# Monitor for unusual activity
tail -f /var/log/openspec-security.log | grep -E "(critical|error)"
```

**Backup Security**:
```bash
# Secure backup with encryption
tar -czf - openspec/ | gpg --cipher-algo AES256 --compress-algo 1 --symmetric --output backup-$(date +%Y%m%d).tar.gz.gpg

# Verify backup integrity
gpg --decrypt backup-$(date +%Y%m%d).tar.gz.gpg | tar -tzf -
```

### Development Security

**Secure Coding Practices**:
- Always validate inputs before processing
- Use parameterized queries/command execution
- Implement proper error handling without information leakage
- Follow principle of least privilege

**Security Testing**:
```typescript
// Test path traversal protection
describe('Path Traversal Protection', () => {
  it('should reject paths outside sandbox', () => {
    expect(() => sandboxPath('../../../etc/passwd', '/safe/base'))
      .toThrow('EPATH_ESCAPE');
  });
  
  it('should handle symbolic link attacks', () => {
    // Test symlink resolution and validation
  });
});
```

**Dependency Security**:
```bash
# Regular dependency audits
npm audit
npm audit fix

# Check for known vulnerabilities
snyk test
```

## Incident Response

### Security Incident Checklist

**Detection**:
1. Monitor security logs for suspicious patterns
2. Set up alerts for critical security events
3. Regularly review access logs and error patterns

**Containment**:
1. Isolate affected systems
2. Revoke compromised credentials
3. Block malicious IP addresses

**Investigation**:
1. Preserve forensic evidence
2. Analyze attack vectors and impact
3. Identify affected data and systems

**Recovery**:
1. Patch vulnerabilities
2. Restore from clean backups
3. Implement additional security controls

**Post-Incident**:
1. Update security policies
2. Conduct security training
3. Improve monitoring and detection

### Emergency Procedures

**Lock File Corruption**:
```bash
# Emergency lock cleanup
find openspec/changes -name ".lock" -exec rm {} \;
echo "Emergency lock cleanup completed at $(date)" >> /var/log/openspec-emergency.log
```

**Security Breach Response**:
```bash
# Immediate lockdown
systemctl stop task-mcp
iptables -A INPUT -p tcp --dport 443 -j DROP

# Preserve evidence
cp -r /var/log/openspec* /evidence/$(date +%Y%m%d_%H%M%S)/
```

This security guide provides comprehensive coverage of Task MCP security considerations. Regular security reviews and updates are essential as new threats emerge and the system evolves.