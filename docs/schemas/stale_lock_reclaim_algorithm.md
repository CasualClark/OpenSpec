# Stale Lock Reclaim Algorithm Decision Tree
# Phase 1 Task MCP

## Decision Tree Overview

The stale lock reclaim algorithm follows a hierarchical decision process to determine whether a lock can be safely reclaimed by a new process.

## Primary Decision Flow

```
START
  │
  ├─→ Read existing lock file
  │   │
  │   ├─→ File doesn't exist or corrupt? ──→ LOCK_AVAILABLE ──→ ACQUIRE
  │   │
  │   └─→ Parse lock data ──→ CONTINUE
  │
  ├─→ Check TTL expiration
  │   │
  │   ├─→ (now - since) > (ttl * 1000)? ──→ LOCK_EXPIRED ──→ RECLAIM
  │   │
  │   └─→ CONTINUE
  │
  ├─→ Check ownership
  │   │
  │   ├─→ Same user identity? ──→ SAME_USER ──→ RECLAIM
  │   │
  │   └─→ CONTINUE
  │
  ├─→ Check privilege level
  │   │
  │   ├─→ New owner has higher privilege? ──→ HIGHER_PRIVILEGE ──→ RECLAIM
  │   │
  │   └─→ CONTINUE
  │
  ├─→ Check emergency override
  │   │
  │   ├─→ Emergency purpose AND valid override? ──→ EMERGENCY_OVERRIDE ──→ RECLAIM
  │   │
  │   └─→ CONTINUE
  │
  └─→ No valid reclaim reason ──→ LOCK_HELD ──→ DENY
```

## Detailed Algorithm Implementation

```typescript
interface ReclaimContext {
  existingLock: EnhancedLockInfo;
  newOwner: LockOwner;
  lockPath: string;
  currentTime: number;
}

interface ReclaimResult {
  allowed: boolean;
  reason: ReclaimReason;
  priority: 'critical' | 'high' | 'medium' | 'low';
  requiresConfirmation?: boolean;
  message?: string;
}

type ReclaimReason = 
  | 'LOCK_EXPIRED'
  | 'SAME_USER' 
  | 'SAME_SESSION'
  | 'HIGHER_PRIVILEGE'
  | 'EMERGENCY_OVERRIDE'
  | 'ADMIN_OVERRIDE'
  | 'LOCK_HELD'
  | 'INVALID_OWNER';

class StaleLockReclaimer {
  
  async evaluateReclaimRequest(context: ReclaimContext): Promise<ReclaimResult> {
    
    // Step 1: Check TTL expiration (highest priority)
    const expiredResult = this.checkTTLExpiration(context);
    if (expiredResult.allowed) {
      return expiredResult;
    }
    
    // Step 2: Check same user identity
    const sameUserResult = this.checkSameUser(context);
    if (sameUserResult.allowed) {
      return sameUserResult;
    }
    
    // Step 3: Check same session (for reconnection)
    const sameSessionResult = this.checkSameSession(context);
    if (sameSessionResult.allowed) {
      return sameSessionResult;
    }
    
    // Step 4: Check privilege hierarchy
    const privilegeResult = this.checkPrivilegeHierarchy(context);
    if (privilegeResult.allowed) {
      return privilegeResult;
    }
    
    // Step 5: Check emergency override
    const emergencyResult = this.checkEmergencyOverride(context);
    if (emergencyResult.allowed) {
      return emergencyResult;
    }
    
    // Step 6: Check admin override
    const adminResult = this.checkAdminOverride(context);
    if (adminResult.allowed) {
      return adminResult;
    }
    
    // No valid reclaim reason
    return {
      allowed: false,
      reason: 'LOCK_HELD',
      priority: 'low',
      message: `Lock is held by ${context.existingLock.owner} and cannot be reclaimed`
    };
  }
  
  private checkTTLExpiration(context: ReclaimContext): ReclaimResult {
    const lockAge = context.currentTime - new Date(context.existingLock.since).getTime();
    const lockExpiration = context.existingLock.ttl * 1000;
    
    if (lockAge > lockExpiration) {
      const expiredMinutes = Math.floor(lockAge / 1000 / 60);
      return {
        allowed: true,
        reason: 'LOCK_EXPIRED',
        priority: 'critical',
        message: `Lock expired ${expiredMinutes} minutes ago, safe to reclaim`
      };
    }
    
    return { allowed: false, reason: 'LOCK_HELD', priority: 'low' };
  }
  
  private checkSameUser(context: ReclaimContext): ReclaimResult {
    const existingUser = context.existingLock.metadata?.user_identity;
    const newUser = context.newOwner.metadata?.user_identity;
    
    if (existingUser && newUser && existingUser === newUser) {
      return {
        allowed: true,
        reason: 'SAME_USER',
        priority: 'medium',
        message: `Same user (${existingUser}) can reclaim across sessions`
      };
    }
    
    return { allowed: false, reason: 'LOCK_HELD', priority: 'low' };
  }
  
  private checkSameSession(context: ReclaimContext): ReclaimResult {
    const existingSession = context.existingLock.metadata?.session_id;
    const newSession = context.newOwner.metadata?.session_id;
    
    if (existingSession && newSession && existingSession === newSession) {
      return {
        allowed: true,
        reason: 'SAME_SESSION',
        priority: 'high',
        message: `Same session (${existingSession}) can reconnect to lock`
      };
    }
    
    return { allowed: false, reason: 'LOCK_HELD', priority: 'low' };
  }
  
  private checkPrivilegeHierarchy(context: ReclaimContext): ReclaimResult {
    const privilegeOrder = ['ci', 'cloud', 'local', 'container'];
    
    const existingEnv = context.existingLock.metadata?.environment;
    const newEnv = context.newOwner.metadata?.environment;
    
    if (!existingEnv || !newEnv) {
      return { allowed: false, reason: 'INVALID_OWNER', priority: 'low' };
    }
    
    const existingLevel = privilegeOrder.indexOf(existingEnv);
    const newLevel = privilegeOrder.indexOf(newEnv);
    
    // Lower index = higher privilege
    if (newLevel < existingLevel && newLevel !== -1) {
      return {
        allowed: true,
        reason: 'HIGHER_PRIVILEGE',
        priority: 'medium',
        requiresConfirmation: true,
        message: `${newEnv} environment has higher privilege than ${existingEnv}`
      };
    }
    
    return { allowed: false, reason: 'LOCK_HELD', priority: 'low' };
  }
  
  private checkEmergencyOverride(context: ReclaimContext): ReclaimResult {
    const isEmergency = context.newOwner.metadata?.purpose === 'emergency';
    const hasEmergencyFlag = process.env.OPENSPEC_EMERGENCY_OVERRIDE === 'true';
    
    if (isEmergency && hasEmergencyFlag) {
      return {
        allowed: true,
        reason: 'EMERGENCY_OVERRIDE',
        priority: 'critical',
        requiresConfirmation: true,
        message: 'Emergency override activated - use with caution'
      };
    }
    
    return { allowed: false, reason: 'LOCK_HELD', priority: 'low' };
  }
  
  private checkAdminOverride(context: ReclaimContext): ReclaimResult {
    const isAdmin = process.env.OPENSPEC_ADMIN_USER === context.newOwner.metadata?.user_identity;
    const hasAdminPrivilege = this.checkSystemAdminPrivileges(context.newOwner);
    
    if (isAdmin || hasAdminPrivilege) {
      return {
        allowed: true,
        reason: 'ADMIN_OVERRIDE',
        priority: 'high',
        requiresConfirmation: true,
        message: 'Administrator override - will be audited'
      };
    }
    
    return { allowed: false, reason: 'LOCK_HELD', priority: 'low' };
  }
  
  private checkSystemAdminPrivileges(owner: LockOwner): boolean {
    // Check for system-level admin privileges
    // This could be integrated with OS user groups, sudo, etc.
    return false; // Implementation depends on security requirements
  }
}
```

## Reclaim Process Flow

```typescript
async function executeReclaim(
  lockPath: string, 
  newOwner: LockOwner, 
  ttl: number,
  force: boolean = false
): Promise<EnhancedLockInfo> {
  
  const reclaimer = new StaleLockReclaimer();
  const existingLock = await readLockFile(lockPath);
  
  const context: ReclaimContext = {
    existingLock,
    newOwner,
    lockPath,
    currentTime: Date.now()
  };
  
  const result = await reclaimer.evaluateReclaimRequest(context);
  
  // Handle confirmation requirements
  if (result.requiresConfirmation && !force) {
    throw new Error(
      `Reclaim requires confirmation: ${result.message}. Use --force to proceed.`
    );
  }
  
  if (!result.allowed) {
    throw new AtomicLockError(
      `Cannot reclaim lock: ${result.message}`,
      existingLock
    );
  }
  
  // Log the reclaim action
  await auditReclaimAction(lockPath, context, result);
  
  // Execute the reclaim
  const reclaimedLock = await createReclaimedLock(context, ttl);
  await writeLockFile(lockPath, reclaimedLock);
  
  return reclaimedLock;
}

async function auditReclaimAction(
  lockPath: string,
  context: ReclaimContext,
  result: ReclaimResult
): Promise<void> {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    action: 'RECLAIM_LOCK',
    lockPath,
    existingOwner: context.existingLock.owner,
    newOwner: context.newOwner.owner,
    reason: result.reason,
    priority: result.priority,
    forced: result.requiresConfirmation,
    userAgent: process.env.USER_AGENT || 'unknown',
    pid: process.pid,
    hostname: require('os').hostname()
  };
  
  const auditPath = path.join(path.dirname(lockPath), '.lock_audit.log');
  await fs.appendFile(auditPath, JSON.stringify(auditEntry) + '\n');
  
  // Also log to system log if available
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[LOCK_RECLAIM] ${result.reason}: ${lockPath} by ${context.newOwner.owner}`);
  }
}
```

## Integration with CLI Commands

### Force Reclaim Command
```typescript
// In change.ts command handler
async function handleForceReclaim(slug: string, options: any): Promise<void> {
  const lockPath = getLockPath(slug);
  const owner = createLockOwnerFromEnvironment(options);
  
  try {
    const reclaimedLock = await executeReclaim(lockPath, owner, options.ttl || 3600, true);
    console.log(`✅ Successfully reclaimed lock for ${slug}`);
    console.log(`   Previous owner: ${reclaimedLock.metadata?.reclaimed_from}`);
    console.log(`   Reclaim reason: ${reclaimedLock.metadata?.reclaimed_reason}`);
  } catch (error) {
    console.error(`❌ Failed to reclaim lock: ${error.message}`);
    process.exit(1);
  }
}
```

### Interactive Reclaim Prompt
```typescript
async function interactiveReclaimPrompt(
  lockPath: string,
  context: ReclaimContext,
  result: ReclaimResult
): Promise<boolean> {
  if (!result.requiresConfirmation) {
    return true;
  }
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = `
⚠️  Lock Reclaim Required

${result.message}

Lock details:
- Owner: ${context.existingLock.owner}
- Held since: ${new Date(context.existingLock.since).toLocaleString()}
- TTL: ${context.existingLock.ttl} seconds

Do you want to proceed with reclaim? (y/N): `;
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
```

## Monitoring and Alerting

### Lock Stale Detection
```typescript
class LockMonitor {
  async detectStaleLocks(locksDirectory: string): Promise<StaleLockInfo[]> {
    const lockFiles = await fs.readdir(locksDirectory);
    const staleLocks: StaleLockInfo[] = [];
    
    for (const file of lockFiles) {
      if (!file.endsWith('.lock')) continue;
      
      const lockPath = path.join(locksDirectory, file);
      const lock = await readLockFile(lockPath);
      
      const age = Date.now() - new Date(lock.since).getTime();
      const isStale = age > (lock.ttl * 1000);
      
      if (isStale) {
        staleLocks.push({
          lockPath,
          lock,
          ageMinutes: Math.floor(age / 1000 / 60),
          severity: this.calculateStaleSeverity(age, lock)
        });
      }
    }
    
    return staleLocks;
  }
  
  private calculateStaleSeverity(age: number, lock: EnhancedLockInfo): 'low' | 'medium' | 'high' | 'critical' {
    const ageMinutes = Math.floor(age / 1000 / 60);
    
    if (ageMinutes > 1440) return 'critical'; // > 24 hours
    if (ageMinutes > 480) return 'high';     // > 8 hours  
    if (ageMinutes > 120) return 'medium';    // > 2 hours
    return 'low';
  }
}
```

### Automated Cleanup
```typescript
class LockCleanupService {
  async scheduleCleanup(): Promise<void> {
    // Run cleanup every hour
    setInterval(async () => {
      try {
        await this.cleanupStaleLocks();
      } catch (error) {
        console.error('Lock cleanup failed:', error.message);
      }
    }, 60 * 60 * 1000);
  }
  
  async cleanupStaleLocks(): Promise<CleanupResult> {
    const monitor = new LockMonitor();
    const locksDir = path.join(process.cwd(), '.openspec', '.locks');
    const staleLocks = await monitor.detectStaleLocks(locksDir);
    
    let cleaned = 0;
    let failed = 0;
    
    for (const staleLock of staleLocks) {
      if (staleLock.severity === 'critical') {
        try {
          await fs.unlink(staleLock.lockPath);
          cleaned++;
          
          await this.logCleanup(staleLock, 'AUTO_CLEANUP');
        } catch (error) {
          failed++;
        }
      }
    }
    
    return { cleaned, failed, total: staleLocks.length };
  }
}
```

This decision tree provides a robust, auditable, and secure approach to lock reclamation that handles all the edge cases and security requirements for Phase 1 Task MCP.