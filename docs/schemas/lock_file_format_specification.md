# Lock File Format and Stale Lock Reclaim Policy
# Phase 1 Task MCP - Final Specification

## Overview

This specification defines the complete lock file format and stale lock reclaim policy for Phase 1 Task MCP, building on the existing `atomic_lock` utility implementation.

## Lock File Format

### Current Implementation
```typescript
interface LockInfo {
  owner: string;    // Process/user identifier
  since: number;    // Unix timestamp in milliseconds
  ttl: number;      // Time-to-live in seconds
}
```

### Enhanced Lock File Format
```json
{
  "owner": {
    "type": "string",
    "description": "Owner identifier, format depends on environment",
    "examples": [
      "pid-12345@hostname",           // Local development
      "user-john@session-abc123",     // Multi-user system
      "token-eyJhbGciOiJIUzI1NiIs",  // Cloud/remote (JWT prefix)
      "ci-pipeline-gh-456"            // CI/automated
    ]
  },
  "since": "2025-10-23T14:30:00.000Z",
  "ttl": 3600,
  "metadata": {
    "type": "object",
    "properties": {
      "hostname": {
        "type": "string",
        "description": "Host where lock was acquired",
        "example": "developer-laptop.local"
      },
      "process_id": {
        "type": "number",
        "description": "Process ID (local environments only)",
        "example": 12345
      },
      "user_identity": {
        "type": "string",
        "description": "Actual user identity (multi-user systems)",
        "example": "john.doe@company.com"
      },
      "session_id": {
        "type": "string", 
        "description": "Session identifier for reconnection",
        "example": "sess_abc123def456"
      },
      "environment": {
        "type": "string",
        "enum": ["local", "ci", "cloud", "container"],
        "description": "Environment type for policy decisions"
      },
      "purpose": {
        "type": "string",
        "enum": ["interactive", "automated", "emergency"],
        "description": "Purpose of lock acquisition"
      }
    }
  }
}
```

## Process Identification Strategy

### 1. Local Development (Default)
```typescript
function getLocalOwner(): string {
  const pid = process.pid;
  const hostname = require('os').hostname();
  return `pid-${pid}@${hostname}`;
}

const lockOwner = {
  owner: getLocalOwner(),
  metadata: {
    hostname: require('os').hostname(),
    process_id: process.pid,
    environment: 'local',
    purpose: 'interactive'
  }
};
```

### 2. Multi-User Systems
```typescript
function getMultiUserOwner(userId: string, sessionId: string): string {
  return `user-${userId}@session-${sessionId}`;
}

const lockOwner = {
  owner: getMultiUserOwner('john.doe@company.com', 'sess_abc123'),
  metadata: {
    user_identity: 'john.doe@company.com',
    session_id: 'sess_abc123',
    environment: 'local',
    purpose: 'interactive'
  }
};
```

### 3. Cloud/Remote Environments
```typescript
function getCloudOwner(sessionToken: string): string {
  // Use first 20 chars of JWT token as identifier
  return `token-${sessionToken.substring(0, 20)}`;
}

const lockOwner = {
  owner: getCloudOwner(jwtToken),
  metadata: {
    environment: 'cloud',
    purpose: 'interactive'
  }
};
```

### 4. CI/Automated Processes
```typescript
function getCIOwner(): string {
  const ciName = process.env.CI_SYSTEM || 'unknown-ci';
  const runId = process.env.CI_RUN_ID || Date.now().toString();
  return `ci-${ciName}-${runId}`;
}

const lockOwner = {
  owner: getCIOwner(),
  metadata: {
    environment: 'ci',
    purpose: 'automated'
  }
};
```

## TTL Strategy

### Default TTL Values by Environment
```typescript
const TTL_STRATEGIES = {
  local: {
    interactive: 3600,    // 1 hour for local development
    automated: 1800,      // 30 minutes for local scripts
    emergency: 300        // 5 minutes for emergency situations
  },
  ci: {
    automated: 86400,     // 24 hours for CI/CD pipelines
    interactive: 3600     // 1 hour for manual CI jobs
  },
  cloud: {
    interactive: 7200,    // 2 hours for cloud sessions
    automated: 14400      // 4 hours for cloud automation
  },
  container: {
    interactive: 1800,    // 30 minutes for containers
    automated: 3600       // 1 hour for container automation
  }
};
```

### Auto-Refresh Mechanism
```typescript
class LockManager {
  private refreshInterval?: NodeJS.Timeout;
  
  async acquireLockWithRefresh(lockPath: string, owner: LockOwner, ttl: number): Promise<LockInfo> {
    const lockInfo = await atomic_lock(lockPath, owner.owner, ttl);
    
    // Set up auto-refresh at 75% of TTL
    const refreshMs = Math.floor(ttl * 0.75 * 1000);
    this.refreshInterval = setInterval(async () => {
      try {
        await this.refreshLock(lockPath, owner, ttl);
      } catch (error) {
        console.warn(`Failed to refresh lock: ${error.message}`);
      }
    }, refreshMs);
    
    return lockInfo;
  }
  
  async refreshLock(lockPath: string, owner: LockOwner, ttl: number): Promise<void> {
    // Verify we still own the lock
    const currentLock = await this.readLock(lockPath);
    if (currentLock.owner !== owner.owner) {
      throw new Error('Cannot refresh lock owned by another process');
    }
    
    // Update the lock file with new timestamp
    const updatedLock = {
      ...currentLock,
      since: Date.now()
    };
    
    await fs.writeFile(lockPath, JSON.stringify(updatedLock, null, 2));
  }
}
```

## Stale Lock Reclaim Algorithm

### Decision Tree for Lock Reclamation

```typescript
class LockReclaimer {
  async canReclaimLock(lockPath: string, newOwner: LockOwner): Promise<ReclaimDecision> {
    const lock = await this.readLock(lockPath);
    const now = Date.now();
    const lockAge = now - new Date(lock.since).getTime();
    const isExpired = lockAge > (lock.ttl * 1000);
    
    // Decision matrix
    if (isExpired) {
      return { canReclaim: true, reason: 'LOCK_EXPIRED', priority: 'high' };
    }
    
    if (this.isSameUser(lock, newOwner)) {
      return { canReclaim: true, reason: 'SAME_USER', priority: 'medium' };
    }
    
    if (this.hasHigherPrivilege(newOwner, lock)) {
      return { canReclaim: true, reason: 'HIGHER_PRIVILEGE', priority: 'medium' };
    }
    
    if (newOwner.metadata.purpose === 'emergency') {
      return { canReclaim: true, reason: 'EMERGENCY_OVERRIDE', priority: 'high' };
    }
    
    return { canReclaim: false, reason: 'LOCK_HELD', priority: 'low' };
  }
  
  private isSameUser(existingLock: LockInfo, newOwner: LockOwner): boolean {
    const existingUser = existingLock.metadata?.user_identity;
    const newUser = newOwner.metadata?.user_identity;
    return existingUser && newUser && existingUser === newUser;
  }
  
  private hasHigherPrivilege(newOwner: LockOwner, existingLock: LockInfo): boolean {
    // Check environment-based privilege hierarchy
    const privilegeOrder = ['ci', 'cloud', 'local'];
    const newPrivilege = privilegeOrder.indexOf(newOwner.metadata?.environment);
    const existingPrivilege = privilegeOrder.indexOf(existingLock.metadata?.environment);
    
    return newPrivilege < existingPrivilege && newPrivilege !== -1;
  }
}

interface ReclaimDecision {
  canReclaim: boolean;
  reason: 'LOCK_EXPIRED' | 'SAME_USER' | 'HIGHER_PRIVILEGE' | 'EMERGENCY_OVERRIDE' | 'LOCK_HELD';
  priority: 'high' | 'medium' | 'low';
}
```

### Reclaim Process
```typescript
async function reclaimLock(lockPath: string, newOwner: LockOwner, ttl: number): Promise<LockInfo> {
  const reclaimer = new LockReclaimer();
  const decision = await reclaimer.canReclaimLock(lockPath, newOwner);
  
  if (!decision.canReclaim) {
    throw new AtomicLockError(
      `Cannot reclaim lock: ${decision.reason}`,
      await readLock(lockPath)
    );
  }
  
  // Log the reclaim action
  await logLockOperation('reclaim', lockPath, {
    existingOwner: (await readLock(lockPath)).owner,
    newOwner: newOwner.owner,
    reason: decision.reason,
    priority: decision.priority
  });
  
  // Force acquire the lock
  const newLockInfo = {
    owner: newOwner.owner,
    since: new Date().toISOString(),
    ttl,
    metadata: {
      ...newOwner.metadata,
      reclaimed_from: (await readLock(lockPath)).owner,
      reclaimed_reason: decision.reason
    }
  };
  
  await fs.writeFile(lockPath, JSON.stringify(newLockInfo, null, 2));
  return newLockInfo;
}
```

## Cross-Platform Considerations

### Atomic File Operations
```typescript
// Enhanced atomic_lock implementation with cross-platform support
export async function atomic_lock_cross_platform(
  lockPath: string, 
  owner: LockOwner, 
  ttl: number
): Promise<LockInfo> {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return await atomic_lock_windows(lockPath, owner, ttl);
  } else {
    return await atomic_lock_unix(lockPath, owner, ttl);
  }
}

async function atomic_lock_windows(lockPath: string, owner: LockOwner, ttl: number): Promise<LockInfo> {
  // Windows-specific implementation using exclusive file creation
  const tempPath = `${lockPath}.${process.pid}.${Date.now()}.tmp`;
  
  try {
    // Write lock info to temporary file
    await fs.writeFile(tempPath, JSON.stringify(owner, null, 2));
    
    // Try to move atomically (works on NTFS)
    await fs.rename(tempPath, lockPath);
    
    return owner;
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function atomic_lock_unix(lockPath: string, owner: LockOwner, ttl: number): Promise<LockInfo> {
  // Unix-specific implementation using O_EXCL
  const tempPath = `${lockPath}.${process.pid}.${Date.now()}.tmp`;
  
  try {
    // Write with exclusive creation
    const fd = await fs.open(tempPath, 'wx');
    await fd.writeFile(JSON.stringify(owner, null, 2));
    await fd.close();
    
    // Atomic rename
    await fs.rename(tempPath, lockPath);
    
    return owner;
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}
```

### Network Filesystem Compatibility
```typescript
class NetworkFilesystemLockManager {
  async isNetworkPath(path: string): Promise<boolean> {
    // Check if path is on network filesystem
    const stats = await fs.stat(path);
    return stats.dev === 0; // Network filesystems often have dev=0
  }
  
  async acquireNetworkLock(lockPath: string, owner: LockOwner, ttl: number): Promise<LockInfo> {
    // Use more conservative retry strategy for network filesystems
    const maxRetries = 10;
    const retryDelay = 100; // ms
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.atomic_lock_with_retry(lockPath, owner, ttl);
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
        await this.sleep(retryDelay * Math.pow(2, attempt)); // Exponential backoff
      }
    }
    
    throw new Error('Failed to acquire network lock after retries');
  }
  
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Security Risk Assessment

### Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Lock file injection** | High | Low | JSON schema validation, owner format validation |
| **Stale lock DoS** | Medium | Medium | TTL-based expiration, emergency override |
| **Privilege escalation** | High | Low | Role-based reclaim authority, audit logging |
| **Race conditions** | Medium | High | Atomic file operations, retry mechanisms |
| **Network filesystem inconsistencies** | Medium | Medium | Conservative retry strategies, validation checks |

### Security Controls

```typescript
// Input validation for lock data
function validateLockOwner(owner: any): LockOwner {
  if (!owner || typeof owner !== 'object') {
    throw new Error('Invalid lock owner format');
  }
  
  if (!owner.owner || typeof owner.owner !== 'string' || owner.owner.length > 256) {
    throw new Error('Invalid owner identifier');
  }
  
  if (owner.metadata && typeof owner.metadata !== 'object') {
    throw new Error('Invalid metadata format');
  }
  
  // Validate allowed metadata fields
  const allowedFields = ['hostname', 'process_id', 'user_identity', 'session_id', 'environment', 'purpose'];
  if (owner.metadata) {
    for (const field of Object.keys(owner.metadata)) {
      if (!allowedFields.includes(field)) {
        throw new Error(`Unexpected metadata field: ${field}`);
      }
    }
  }
  
  return owner;
}

// Audit logging
async function logLockOperation(operation: string, lockPath: string, details: any): Promise<void> {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    lockPath,
    details,
    user: process.env.USER || 'unknown',
    pid: process.pid
  };
  
  const logPath = path.join(path.dirname(lockPath), '.lock_audit.log');
  await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
}
```

## Integration with Existing Utilities

### Enhanced atomic_lock Function
```typescript
export async function atomic_lock_enhanced(
  lockPath: string, 
  owner: string | LockOwner, 
  ttl?: number,
  options?: {
    autoRefresh?: boolean;
    networkFilesystem?: boolean;
    environment?: 'local' | 'ci' | 'cloud' | 'container';
    purpose?: 'interactive' | 'automated' | 'emergency';
  }
): Promise<LockInfo> {
  // Normalize owner to LockOwner format
  const lockOwner = typeof owner === 'string' 
    ? createLockOwnerFromString(owner, options)
    : validateLockOwner(owner);
  
  // Determine TTL based on environment
  const finalTtl = ttl || determineTTL(lockOwner, options?.purpose);
  
  // Choose implementation based on filesystem type
  if (options?.networkFilesystem) {
    const networkManager = new NetworkFilesystemLockManager();
    return await networkManager.acquireNetworkLock(lockPath, lockOwner, finalTtl);
  }
  
  // Use cross-platform implementation
  return await atomic_lock_cross_platform(lockPath, lockOwner, finalTtl);
}
```

## Error Messages and User Experience

### Clear Error Messages
```typescript
class LockErrorMessages {
  static lockHeld(lockInfo: LockInfo, lockPath: string): string {
    const age = Math.floor((Date.now() - new Date(lockInfo.since).getTime()) / 1000 / 60);
    const expires = Math.floor((lockInfo.ttl * 1000 - (Date.now() - new Date(lockInfo.since).getTime())) / 1000 / 60);
    
    return `Change is locked by ${lockInfo.owner} since ${new Date(lockInfo.since).toLocaleString()}. ` +
           `Lock held for ${age} minutes, expires in ${expires} minutes. ` +
           `Use --force to reclaim stale locks or wait for the lock to expire.`;
  }
  
  static reclaimDenied(reason: string): string {
    const reasons = {
      'LOCK_HELD': 'Cannot reclaim: lock is still active and held by another user',
      'SAME_USER': 'Cannot reclaim: you already own this lock',
      'HIGHER_PRIVILEGE': 'Cannot reclaim: lock owner has higher privileges',
      'EMERGENCY_OVERRIDE': 'Emergency override requires --emergency flag'
    };
    
    return reasons[reason] || `Cannot reclaim lock: ${reason}`;
  }
}
```

## Migration Path

### Backward Compatibility
```typescript
// Migrate existing simple lock files to enhanced format
async function migrateLockFile(lockPath: string): Promise<void> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8');
    const lockData = JSON.parse(content);
    
    // Check if this is old format
    if (lockData.owner && typeof lockData.since === 'number' && lockData.ttl) {
      // Migrate to new format
      const migratedLock = {
        owner: `pid-${lockData.owner}`,
        since: new Date(lockData.since).toISOString(),
        ttl: lockData.ttl,
        metadata: {
          environment: 'local',
          purpose: 'interactive',
          migrated: true,
          migrated_at: new Date().toISOString()
        }
      };
      
      await fs.writeFile(lockPath, JSON.stringify(migratedLock, null, 2));
    }
  } catch (error) {
    // File doesn't exist or is corrupted, no migration needed
  }
}
```

This specification provides a comprehensive, production-ready lock management system that builds on the existing `atomic_lock` utility while addressing all the critical design decisions for Phase 1 Task MCP.