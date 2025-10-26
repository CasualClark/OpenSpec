# Lock Management Security Assessment
# Phase 1 Task MCP

## Executive Summary

The enhanced lock management system for Phase 1 Task MCP introduces several security considerations that must be addressed to ensure safe operation in multi-user and cloud environments. This assessment identifies risks, evaluates their impact, and provides specific mitigations.

## Risk Matrix

| Risk Category | Risk | Impact | Likelihood | Risk Level | Priority |
|---------------|------|--------|------------|------------|----------|
| **Data Integrity** | Lock file injection via malicious JSON | High | Low | Medium | P2 |
| **Availability** | Stale lock Denial of Service | Medium | Medium | Medium | P2 |
| **Access Control** | Privilege escalation via lock reclaim | High | Low | Medium | P2 |
| **Concurrency** | Race conditions in lock acquisition | Medium | High | Medium | P2 |
| **Network** | Network filesystem inconsistencies | Medium | Medium | Medium | P3 |
| **Audit** | Insufficient logging of lock operations | Low | High | Low | P3 |
| **Data Exposure** | Sensitive information in lock files | Medium | Low | Low | P3 |

## Detailed Risk Analysis

### 1. Lock File Injection (Medium Risk)

**Description**: Malicious actors could craft invalid JSON or oversized lock files to corrupt the lock system or cause crashes.

**Attack Vectors**:
- Direct file system access to write invalid JSON
- Path traversal to write lock files outside expected directories
- Oversized lock files causing memory exhaustion

**Mitigations**:
```typescript
// Input validation schema
const LOCK_SCHEMA = {
  type: 'object',
  required: ['owner', 'since', 'ttl'],
  properties: {
    owner: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      pattern: '^[a-zA-Z0-9._@-]+$'
    },
    since: {
      type: 'string',
      format: 'date-time'
    },
    ttl: {
      type: 'number',
      minimum: 1,
      maximum: 86400 // Max 24 hours
    },
    metadata: {
      type: 'object',
      maxProperties: 10,
      additionalProperties: false,
      properties: {
        hostname: { type: 'string', maxLength: 253 },
        process_id: { type: 'number', minimum: 1, maximum: 999999 },
        user_identity: { type: 'string', maxLength: 256, format: 'email' },
        session_id: { type: 'string', minLength: 8, maxLength: 128 },
        environment: { 
          type: 'string', 
          enum: ['local', 'ci', 'cloud', 'container'] 
        },
        purpose: { 
          type: 'string', 
          enum: ['interactive', 'automated', 'emergency'] 
        }
      }
    }
  }
};

function validateLockFile(content: string): EnhancedLockInfo {
  try {
    const parsed = JSON.parse(content);
    
    // Validate against schema
    const ajv = new Ajv();
    const validate = ajv.compile(LOCK_SCHEMA);
    
    if (!validate(parsed)) {
      throw new Error(`Invalid lock file format: ${ajv.errorsText(validate.errors)}`);
    }
    
    // Additional security checks
    if (parsed.ttl > 86400) {
      throw new Error('TTL exceeds maximum allowed duration');
    }
    
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Lock file contains invalid JSON');
    }
    throw error;
  }
}
```

**Implementation Status**: ✅ Implemented in core-utilities.ts

### 2. Stale Lock Denial of Service (Medium Risk)

**Description**: Process crashes without releasing locks could prevent legitimate users from accessing changes indefinitely.

**Attack Vectors**:
- Intentional process termination to hold locks
- System crashes leaving orphaned locks
- Network partitions preventing lock cleanup

**Mitigations**:
```typescript
// TTL-based expiration with safety margins
const DEFAULT_TTL = {
  interactive: 3600,    // 1 hour
  automated: 1800,      // 30 minutes  
  emergency: 300        // 5 minutes
};

// Emergency cleanup service
class LockEmergencyCleanup {
  async cleanupOrphanedLocks(locksDir: string): Promise<CleanupResult> {
    const lockFiles = await this.findLockFiles(locksDir);
    const cleaned = [];
    
    for (const lockFile of lockFiles) {
      try {
        const lock = await this.readAndValidateLock(lockFile);
        
        // Check if process still exists
        const processExists = await this.checkProcessExists(lock);
        
        // Check if lock is expired
        const isExpired = this.isLockExpired(lock);
        
        if (!processExists || isExpired) {
          await this.safeCleanup(lockFile, lock);
          cleaned.push({ file: lockFile, reason: processExists ? 'expired' : 'orphaned' });
        }
        
      } catch (error) {
        console.warn(`Failed to process lock file ${lockFile}: ${error.message}`);
      }
    }
    
    return { cleaned, total: lockFiles.length };
  }
  
  private async checkProcessExists(lock: EnhancedLockInfo): Promise<boolean> {
    if (!lock.metadata?.process_id) return true; // Non-local locks
    
    try {
      // Check if process exists (platform-specific)
      process.kill(lock.metadata.process_id, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  private async safeCleanup(lockPath: string, lock: EnhancedLockInfo): Promise<void> {
    // Log before cleanup
    await this.auditCleanup(lockPath, lock);
    
    // Atomic cleanup with backup
    const backupPath = `${lockPath}.backup.${Date.now()}`;
    try {
      await fs.rename(lockPath, backupPath);
      
      // Verify backup was created before deleting
      const backupExists = await fs.pathExists(backupPath);
      if (backupExists) {
        await fs.unlink(backupPath);
      }
    } catch (error) {
      // If rename fails, try direct unlink
      await fs.unlink(lockPath).catch(() => {});
    }
  }
}

// Auto-cleanup on startup
async function initializeLockSystem(): Promise<void> {
  const locksDir = path.join(process.cwd(), '.openspec', '.locks');
  
  if (await fs.pathExists(locksDir)) {
    const cleanup = new LockEmergencyCleanup();
    const result = await cleanup.cleanupOrphanedLocks(locksDir);
    
    if (result.cleaned.length > 0) {
      console.log(`🧹 Cleaned up ${result.cleaned.length} orphaned locks`);
    }
  }
}
```

**Implementation Status**: ✅ Designed, needs implementation

### 3. Privilege Escalation via Lock Reclaim (Medium Risk)

**Description**: Lower-privileged processes might reclaim locks from higher-privileged processes, gaining unauthorized access.

**Attack Vectors**:
- Forging lock owner metadata to appear higher-privileged
- Exploiting bugs in privilege comparison logic
- Emergency override abuse

**Mitigations**:
```typescript
// Robust privilege hierarchy with validation
class PrivilegeValidator {
  private readonly PRIVILEGE_ORDER = ['ci', 'cloud', 'local', 'container'];
  private readonly ADMIN_USERS = new Set([
    'admin@company.com',
    'system@company.com',
    // Load from secure config in production
  ]);
  
  validatePrivilege(existingLock: EnhancedLockInfo, newOwner: LockOwner): PrivilegeResult {
    // Validate environment claims
    if (!this.isValidEnvironmentClaim(newOwner)) {
      return { allowed: false, reason: 'INVALID_ENVIRONMENT_CLAIM' };
    }
    
    // Check admin status
    if (this.isAdmin(newOwner)) {
      return { allowed: true, reason: 'ADMIN_OVERRIDE', requiresAudit: true };
    }
    
    // Validate privilege hierarchy
    const existingLevel = this.getPrivilegeLevel(existingLock);
    const newLevel = this.getPrivilegeLevel(newOwner);
    
    if (newLevel < existingLevel) {
      return { allowed: true, reason: 'HIGHER_PRIVILEGE', requiresConfirmation: true };
    }
    
    return { allowed: false, reason: 'INSUFFICIENT_PRIVILEGE' };
  }
  
  private isValidEnvironmentClaim(owner: LockOwner): boolean {
    const env = owner.metadata?.environment;
    const claim = owner.owner;
    
    // Verify environment claim matches owner format
    switch (env) {
      case 'local':
        return claim.startsWith('pid-') && claim.includes('@');
      case 'ci':
        return claim.startsWith('ci-');
      case 'cloud':
        return claim.startsWith('token-');
      case 'container':
        return claim.startsWith('container-');
      default:
        return false;
    }
  }
  
  private isAdmin(owner: LockOwner): boolean {
    const userId = owner.metadata?.user_identity;
    return userId ? this.ADMIN_USERS.has(userId) : false;
  }
  
  private getPrivilegeLevel(lock: EnhancedLockInfo): number {
    const env = lock.metadata?.environment;
    return env ? this.PRIVILEGE_ORDER.indexOf(env) : 999;
  }
}

// Emergency override with strict validation
class EmergencyOverrideValidator {
  validateEmergencyOverride(request: EmergencyRequest): EmergencyResult {
    // Require explicit environment variable
    if (process.env.OPENSPEC_EMERGENCY_OVERRIDE !== 'true') {
      return { allowed: false, reason: 'EMERGENCY_NOT_ENABLED' };
    }
    
    // Require justification
    if (!request.justification || request.justification.length < 10) {
      return { allowed: false, reason: 'INSUFFICIENT_JUSTIFICATION' };
    }
    
    // Rate limiting
    if (this.isRateLimited(request.requester)) {
      return { allowed: false, reason: 'RATE_LIMITED' };
    }
    
    // Log emergency override for audit
    this.auditEmergencyOverride(request);
    
    return { allowed: true, reason: 'EMERGENCY_APPROVED' };
  }
  
  private isRateLimited(requester: string): boolean {
    // Implement rate limiting per user
    const rateLimitStore = new Map<string, number[]>();
    const now = Date.now();
    const window = 60 * 60 * 1000; // 1 hour
    const maxRequests = 3;
    
    const requests = rateLimitStore.get(requester) || [];
    const recentRequests = requests.filter(time => now - time < window);
    
    if (recentRequests.length >= maxRequests) {
      return true;
    }
    
    recentRequests.push(now);
    rateLimitStore.set(requester, recentRequests);
    return false;
  }
}
```

**Implementation Status**: ✅ Designed, needs implementation

### 4. Race Conditions (Medium Risk)

**Description**: Concurrent lock acquisition attempts could lead to inconsistent state or lost locks.

**Attack Vectors**:
- High-frequency lock attempts exploiting timing windows
- Network filesystem delays causing race conditions
- Process synchronization bugs

**Mitigations**:
```typescript
// Atomic lock acquisition with proper error handling
export async function atomic_lock_race_safe(
  lockPath: string, 
  owner: LockOwner, 
  ttl: number,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<EnhancedLockInfo> {
  const {
    maxRetries = 10,
    retryDelay = 50,
    backoffMultiplier = 1.5
  } = options;
  
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const tempPath = `${lockPath}.${process.pid}.${Date.now()}.${attempt}.tmp`;
    
    try {
      // Write to temporary file with validation
      const lockData = this.createLockData(owner, ttl);
      await this.writeValidatedLockFile(tempPath, lockData);
      
      // Check existing lock with atomic read
      const existingLock = await this.atomicReadLock(lockPath);
      
      if (existingLock && !this.canReclaim(existingLock, owner)) {
        await fs.unlink(tempPath).catch(() => {});
        throw new AtomicLockError('Lock held by another process', existingLock);
      }
      
      // Atomic rename with verification
      await fs.rename(tempPath, lockPath);
      
      // Verify the lock was written correctly
      const verification = await this.atomicReadLock(lockPath);
      if (!verification || verification.owner !== owner.owner) {
        throw new Error('Lock verification failed after write');
      }
      
      return verification;
      
    } catch (error) {
      // Clean up temporary file
      await fs.unlink(tempPath).catch(() => {});
      lastError = error;
      
      // Don't retry on certain errors
      if (error instanceof AtomicLockError) {
        throw error;
      }
      
      // Exponential backoff for retries
      if (attempt < maxRetries - 1) {
        const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
        await this.sleep(delay);
      }
    }
  }
  
  throw new Error(`Failed to acquire lock after ${maxRetries} attempts: ${lastError.message}`);
}

private async atomicReadLock(lockPath: string): Promise<EnhancedLockInfo | null> {
  try {
    // Use file handle to ensure consistent read
    const fd = await fs.open(lockPath, 'r');
    try {
      const content = await fd.readFile('utf-8');
      return validateLockFile(content);
    } finally {
      await fd.close();
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
```

**Implementation Status**: ✅ Partially implemented in core-utilities.ts

### 5. Network Filesystem Inconsistencies (Low-Medium Risk)

**Description**: Network filesystems (NFS, SMB) may have caching or consistency issues affecting lock reliability.

**Attack Vectors**:
- Exploiting NFS cache inconsistencies
- Network partitions causing split-brain scenarios
- Filesystem permission mismatches

**Mitigations**:
```typescript
// Network filesystem detection and handling
class NetworkFilesystemHandler {
  async detectNetworkFilesystem(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      
      // Check filesystem type
      if (process.platform === 'linux') {
        const { stdout } = await execFile('df', ['-T', path]);
        return stdout.includes('nfs') || stdout.includes('cifs') || stdout.includes('smb');
      }
      
      // Check for network filesystem characteristics
      return stats.dev === 0 || stats.ino === 0;
      
    } catch (error) {
      console.warn(`Failed to detect filesystem type for ${path}: ${error.message}`);
      return false;
    }
  }
  
  async acquireNetworkLock(lockPath: string, owner: LockOwner, ttl: number): Promise<EnhancedLockInfo> {
    // Use conservative retry strategy
    const maxRetries = 20;
    const baseDelay = 200; // Higher base delay for network
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use file locking for additional safety
        const result = await this.atomicLockWithFileLock(lockPath, owner, ttl);
        
        // Verify lock is visible (network filesystem cache issue)
        await this.sleep(100); // Small delay for cache propagation
        const verification = await this.readLockWithRetry(lockPath, 3);
        
        if (verification && verification.owner === owner.owner) {
          return verification;
        }
        
        throw new Error('Lock verification failed on network filesystem');
        
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw new Error(`Network lock acquisition failed: ${error.message}`);
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(1.2, attempt) + Math.random() * 100;
        await this.sleep(delay);
      }
    }
    
    throw new Error('Unexpected error in network lock acquisition');
  }
  
  private async atomicLockWithFileLock(
    lockPath: string, 
    owner: LockOwner, 
    ttl: number
  ): Promise<EnhancedLockInfo> {
    const fd = await fs.open(lockPath, 'wx'); // Exclusive creation
    
    try {
      const lockData = this.createLockData(owner, ttl);
      await fd.writeFile(JSON.stringify(lockData, null, 2));
      await fd.sync(); // Force write to disk
      
      return lockData;
    } finally {
      await fd.close();
    }
  }
}
```

**Implementation Status**: ✅ Designed, needs implementation

## Security Controls Summary

### Implemented Controls
1. ✅ JSON schema validation for lock files
2. ✅ Atomic file operations using fs.rename()
3. ✅ TTL-based lock expiration
4. ✅ Basic privilege hierarchy
5. ✅ Error handling with AtomicLockError

### Planned Controls
1. 🔄 Emergency cleanup service for orphaned locks
2. 🔄 Enhanced privilege validation with admin checks
3. 🔄 Rate limiting for emergency overrides
4. 🔄 Network filesystem detection and handling
5. 🔄 Comprehensive audit logging
6. 🔄 Race condition prevention with retry logic

### Configuration-Based Controls
```typescript
// Security configuration
interface SecurityConfig {
  maxTTL: number;           // Maximum lock duration (default: 24h)
  emergencyOverride: boolean; // Enable emergency override
  adminUsers: string[];     // Admin user list
  auditLevel: 'none' | 'basic' | 'detailed'; // Audit verbosity
  networkFilesystem: boolean; // Enable network FS handling
  rateLimiting: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  maxTTL: 86400,
  emergencyOverride: false,
  adminUsers: [],
  auditLevel: 'basic',
  networkFilesystem: false,
  rateLimiting: {
    enabled: true,
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3
  }
};
```

## Monitoring and Alerting

### Security Metrics
```typescript
interface SecurityMetrics {
  lockAcquisitions: {
    total: number;
    successful: number;
    failed: number;
    rejected: number;
  };
  emergencyOverrides: {
    total: number;
    byUser: Record<string, number>;
  };
  staleLocks: {
    detected: number;
    cleaned: number;
    ageDistribution: Record<string, number>;
  };
  securityViolations: {
    invalidFormats: number;
    privilegeEscalations: number;
    rateLimitHits: number;
  };
}

class SecurityMonitor {
  async collectMetrics(): Promise<SecurityMetrics> {
    // Implementation for collecting security metrics
  }
  
  async generateSecurityReport(): Promise<string> {
    const metrics = await this.collectMetrics();
    
    return `
Security Report - ${new Date().toISOString()}
============================================

Lock Operations:
- Total acquisitions: ${metrics.lockAcquisitions.total}
- Success rate: ${(metrics.lockAcquisitions.successful / metrics.lockAcquisitions.total * 100).toFixed(1)}%

Emergency Overrides:
- Total: ${metrics.emergencyOverrides.total}
- Users: ${Object.keys(metrics.emergencyOverrides.byUser).join(', ')}

Stale Lock Management:
- Detected: ${metrics.staleLocks.detected}
- Cleaned: ${metrics.staleLocks.cleaned}
- Cleanup rate: ${(metrics.staleLocks.cleaned / metrics.staleLocks.detected * 100).toFixed(1)}%

Security Violations:
- Invalid formats: ${metrics.securityViolations.invalidFormats}
- Privilege escalations: ${metrics.securityViolations.privilegeEscalations}
- Rate limit hits: ${metrics.securityViolations.rateLimitHits}
`;
  }
}
```

## Recommendations

### Immediate Actions (P2)
1. Implement the emergency cleanup service for orphaned locks
2. Add comprehensive input validation with JSON schema
3. Enhance privilege validation with admin override support
4. Implement rate limiting for emergency overrides

### Future Enhancements (P3)
1. Add comprehensive audit logging with tamper protection
2. Implement network filesystem detection and handling
3. Add security metrics collection and reporting
4. Consider integration with external authentication systems

### Operational Practices
1. Regular monitoring of lock files and cleanup operations
2. Periodic security audits of lock patterns and usage
3. Documentation of emergency procedures for lock issues
4. Training for administrators on lock security implications

This security assessment provides a comprehensive framework for ensuring the lock management system meets security requirements while maintaining usability and performance.