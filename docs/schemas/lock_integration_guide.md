# Lock Management Integration Guide
# Phase 1 Task MCP

## Overview

This guide explains how to integrate the enhanced lock file format and stale lock reclaim policy with the existing Task MCP utilities and Phase 1 pseudocode implementation.

## Integration Points

### 1. Core Utilities Integration

#### Enhanced atomic_lock Function
```typescript
// src/utils/core-utilities.ts - Additions

export interface LockOwner {
  owner: string;
  metadata: {
    hostname?: string;
    process_id?: number;
    user_identity?: string;
    session_id?: string;
    environment: 'local' | 'ci' | 'cloud' | 'container';
    purpose: 'interactive' | 'automated' | 'emergency';
    reclaimed_from?: string;
    reclaimed_reason?: string;
  };
}

export interface EnhancedLockInfo extends LockInfo {
  owner: string;
  since: string; // ISO8601 format
  ttl: number;
  metadata?: LockOwner['metadata'];
}

/**
 * Enhanced atomic lock with stale lock reclaim and cross-platform support
 */
export async function atomic_lock_enhanced(
  lockPath: string, 
  owner: string | LockOwner, 
  ttl?: number,
  options?: {
    autoRefresh?: boolean;
    networkFilesystem?: boolean;
    force?: boolean;
    environment?: 'local' | 'ci' | 'cloud' | 'container';
    purpose?: 'interactive' | 'automated' | 'emergency';
  }
): Promise<EnhancedLockInfo> {
  // Backward compatibility: migrate old lock files
  await migrateLockFile(lockPath);
  
  // Normalize owner to LockOwner format
  const lockOwner = typeof owner === 'string' 
    ? createLockOwnerFromString(owner, options)
    : validateLockOwner(owner);
  
  // Determine TTL based on environment and purpose
  const finalTtl = ttl || determineTTL(lockOwner, options?.purpose);
  
  // Handle force reclaim
  if (options?.force) {
    return await forceReclaimLock(lockPath, lockOwner, finalTtl);
  }
  
  // Choose implementation based on filesystem type
  if (options?.networkFilesystem) {
    const networkManager = new NetworkFilesystemLockManager();
    return await networkManager.acquireNetworkLock(lockPath, lockOwner, finalTtl);
  }
  
  // Use cross-platform implementation with reclaim logic
  return await atomic_lock_with_reclaim(lockPath, lockOwner, finalTtl);
}

/**
 * Backward compatible wrapper for existing atomic_lock function
 */
export async function atomic_lock(
  lockPath: string, 
  owner: string, 
  ttl: number
): Promise<LockInfo> {
  const enhancedResult = await atomic_lock_enhanced(lockPath, owner, ttl, {
    environment: 'local',
    purpose: 'interactive'
  });
  
  // Convert back to legacy format
  return {
    owner: enhancedResult.owner,
    since: new Date(enhancedResult.since).getTime(),
    ttl: enhancedResult.ttl
  };
}
```

### 2. Change Template Integration

#### Updated change.open Implementation
```typescript
// src/core/templates/change-templates.ts - Modifications

export class ChangeTemplateEngine {
  
  async openChange(context: ChangeContext): Promise<OpenChangeResult> {
    // Validate slug
    if (!this.validateSlug(context.slug)) {
      throw new Error(`Invalid slug: ${context.slug}`);
    }
    
    // Secure path resolution
    const changeDir = this.resolveChangePath(context.slug);
    const lockDir = path.join(this.openspecPath, '.locks');
    const lockPath = path.join(lockDir, `change-${context.slug}.lock`);
    
    // Create lock owner with enhanced metadata
    const lockOwner = this.createEnhancedLockOwner(context);
    const lockTtl = context.ttl || this.determineEnvironmentTTL(context);
    
    // Ensure lock directory exists
    await fs.mkdir(lockDir, { recursive: true });
    
    try {
      // Acquire lock with enhanced functionality
      const lockInfo = await atomic_lock_enhanced(lockPath, lockOwner, lockTtl, {
        autoRefresh: context.autoRefresh !== false,
        environment: lockOwner.metadata.environment,
        purpose: lockOwner.metadata.purpose
      });
      
      console.log(`🔒 Acquired lock for ${context.slug}: ${lockInfo.owner}`);
      
    } catch (error) {
      if (error instanceof AtomicLockError) {
        const lockAge = this.calculateLockAge(error.lockInfo);
        const suggestions = this.generateReclaimSuggestions(error.lockInfo, lockOwner);
        
        throw new Error(
          `Change "${context.slug}" is locked by ${error.lockInfo?.owner} since ${new Date(error.lockInfo?.since || 0).toLocaleString()}. ` +
          `Lock age: ${lockAge}. ` +
          `${suggestions}`
        );
      }
      throw error;
    }
    
    try {
      // Existing change creation logic...
      const result = await this.createChangeStructure(context);
      
      // Set up auto-refresh if requested
      if (context.autoRefresh !== false) {
        this.setupLockRefresh(lockPath, lockOwner, lockTtl);
      }
      
      return result;
      
    } catch (error) {
      // Clean up lock on failure
      await this.releaseLock(lockPath);
      throw error;
    }
  }
  
  private createEnhancedLockOwner(context: ChangeContext): LockOwner {
    const env = this.detectEnvironment();
    
    if (env === 'local') {
      return {
        owner: `pid-${process.pid}@${require('os').hostname()}`,
        metadata: {
          hostname: require('os').hostname(),
          process_id: process.pid,
          user_identity: process.env.USER || process.env.USERNAME || 'unknown',
          environment: 'local',
          purpose: context.purpose || 'interactive',
          session_id: context.sessionId || this.generateSessionId()
        }
      };
    }
    
    if (env === 'ci') {
      return {
        owner: `ci-${process.env.CI_SYSTEM || 'unknown'}-${process.env.CI_RUN_ID || Date.now()}`,
        metadata: {
          environment: 'ci',
          purpose: 'automated',
          hostname: process.env.CI_HOSTNAME || 'ci-runner'
        }
      };
    }
    
    if (env === 'cloud') {
      const sessionToken = process.env.OPENSPEC_SESSION_TOKEN || 'unknown';
      return {
        owner: `token-${sessionToken.substring(0, 20)}`,
        metadata: {
          environment: 'cloud',
          purpose: context.purpose || 'interactive',
          session_id: context.sessionId || this.extractSessionId(sessionToken)
        }
      };
    }
    
    // Container environment
    return {
      owner: `container-${process.env.CONTAINER_ID || Date.now()}`,
      metadata: {
        environment: 'container',
        purpose: context.purpose || 'automated',
        hostname: require('os').hostname()
      }
    };
  }
  
  private generateReclaimSuggestions(existingLock: LockInfo, newOwner: LockOwner): string {
    const suggestions = [];
    
    // Check if lock is expired
    const lockAge = Date.now() - new Date(existingLock.since).getTime();
    const isExpired = lockAge > (existingLock.ttl * 1000);
    
    if (isExpired) {
      suggestions.push('Lock is expired - use --force to reclaim automatically.');
    }
    
    // Check same user
    if (existingLock.metadata?.user_identity === newOwner.metadata?.user_identity) {
      suggestions.push('Same user can reclaim - use --force to override.');
    }
    
    // Check emergency options
    if (newOwner.metadata?.purpose === 'emergency') {
      suggestions.push('Emergency mode available - use --emergency flag.');
    }
    
    // General advice
    suggestions.push(`Wait ${Math.ceil(existingLock.ttl - (lockAge / 1000))} seconds for expiration.`);
    
    return suggestions.join(' ');
  }
}
```

### 3. Change Archive Integration

#### Updated change.archive Implementation
```typescript
export class ChangeArchiver {
  
  async archiveChange(slug: string, options: ArchiveOptions = {}): Promise<ArchiveResult> {
    const changeDir = path.join(this.openspecPath, 'changes', slug);
    const lockPath = path.join(this.openspecPath, '.locks', `change-${slug}.lock`);
    
    // Validate change exists
    if (!await fs.pathExists(changeDir)) {
      throw new Error(`Change "${slug}" does not exist`);
    }
    
    // Verify lock ownership or force reclaim
    try {
      const lockInfo = await readLockFile(lockPath);
      const currentOwner = this.createCurrentOwner();
      
      const canArchive = await this.verifyArchivePermission(lockInfo, currentOwner, options.force);
      if (!canArchive.allowed) {
        throw new Error(`Cannot archive: ${canArchive.reason}`);
      }
      
      // Update lock for archive operation
      if (canArchive.requiresReclaim) {
        await this.reclaimLockForArchive(lockPath, currentOwner);
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // No lock file - proceed with archive
      } else {
        throw error;
      }
    }
    
    try {
      // Execute archive operation
      const receipt = await this.performArchive(slug, changeDir);
      
      // Write receipt
      const receiptPath = path.join(changeDir, 'receipt.json');
      await fs.writeJson(receiptPath, receipt, { spaces: 2 });
      
      // Release lock
      await this.releaseLock(lockPath);
      
      return {
        apiVersion: '1.0',
        slug,
        archived: true,
        alreadyArchived: false,
        receipt
      };
      
    } catch (error) {
      // Don't release lock on archive failure - allows retry
      throw new Error(`Archive failed for ${slug}: ${error.message}`);
    }
  }
  
  private async verifyArchivePermission(
    lockInfo: EnhancedLockInfo,
    currentOwner: LockOwner,
    force: boolean
  ): Promise<{ allowed: boolean; reason?: string; requiresReclaim?: boolean }> {
    
    // No lock file exists
    if (!lockInfo) {
      return { allowed: true };
    }
    
    // Same owner can archive
    if (lockInfo.owner === currentOwner.owner) {
      return { allowed: true };
    }
    
    // Same user can archive
    if (lockInfo.metadata?.user_identity === currentOwner.metadata?.user_identity) {
      return { allowed: true, requiresReclaim: true };
    }
    
    // Force override
    if (force) {
      return { allowed: true, requiresReclaim: true };
    }
    
    // Check admin privileges
    if (await this.hasArchivePrivileges(currentOwner)) {
      return { allowed: true, requiresReclaim: true };
    }
    
    return { 
      allowed: false, 
      reason: `Lock held by ${lockInfo.owner} - use --force to override` 
    };
  }
}
```

### 4. Resource Provider Integration

#### Lock-Aware Resource Providers
```typescript
// src/resources/lock-resources.ts

export class LockResourceProvider {
  
  async provideLockResource(uri: URL): Promise<Resource> {
    const slug = this.extractSlugFromUri(uri);
    const lockPath = this.getLockPath(slug);
    
    try {
      const lockInfo = await readLockFile(lockPath);
      const age = this.calculateLockAge(lockInfo);
      const status = this.determineLockStatus(lockInfo);
      
      return {
        uri: uri.toString(),
        name: `Lock: ${slug}`,
        description: `${status} - held by ${lockInfo.owner} for ${age}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          slug,
          ...lockInfo,
          age,
          status,
          actions: this.getAvailableActions(lockInfo)
        }, null, 2)
      };
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          uri: uri.toString(),
          name: `Lock: ${slug}`,
          description: 'No active lock',
          mimeType: 'application/json',
          text: JSON.stringify({
            slug,
            status: 'unlocked',
            message: 'No active lock on this change'
          }, null, 2)
        };
      }
      throw error;
    }
  }
  
  private determineLockStatus(lockInfo: EnhancedLockInfo): string {
    const age = Date.now() - new Date(lockInfo.since).getTime();
    const isExpired = age > (lockInfo.ttl * 1000);
    
    if (isExpired) return 'EXPIRED';
    if (lockInfo.metadata?.purpose === 'emergency') return 'EMERGENCY';
    if (lockInfo.metadata?.environment === 'ci') return 'AUTOMATED';
    return 'ACTIVE';
  }
  
  private getAvailableActions(lockInfo: EnhancedLockInfo): string[] {
    const actions = [];
    
    if (this.isLockExpired(lockInfo)) {
      actions.push('reclaim-expired');
    }
    
    if (this.isSameUser(lockInfo)) {
      actions.push('reclaim-same-user');
    }
    
    if (this.hasHigherPrivilege(lockInfo)) {
      actions.push('reclaim-privilege');
    }
    
    if (this.isEmergencyAvailable()) {
      actions.push('emergency-override');
    }
    
    return actions;
  }
}
```

### 5. CLI Command Integration

#### Enhanced Change Commands
```typescript
// src/commands/change.ts - Additions

export class ChangeCommand {
  
  async open(options: ChangeOpenOptions): Promise<void> {
    const context = {
      slug: options.slug,
      template: options.template || 'feature',
      ttl: options.ttl,
      owner: options.owner,
      purpose: options.purpose,
      sessionId: options.sessionId,
      autoRefresh: options.autoRefresh
    };
    
    try {
      const templateEngine = new ChangeTemplateEngine();
      const result = await templateEngine.openChange(context);
      
      console.log(`✅ Change "${options.slug}" opened successfully`);
      console.log(`📁 Location: ${result.changeDir}`);
      console.log(`🔒 Lock: ${result.lockInfo.owner}`);
      console.log(`⏰ TTL: ${result.lockInfo.ttl} seconds`);
      
      if (result.lockInfo.metadata?.session_id) {
        console.log(`🔗 Session: ${result.lockInfo.metadata.session_id}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to open change: ${error.message}`);
      
      // Provide helpful suggestions for lock conflicts
      if (error.message.includes('locked by')) {
        console.log('\n💡 Suggestions:');
        console.log('   • Wait for the lock to expire');
        console.log('   • Use --force to reclaim stale locks');
        console.log('   • Use --emergency for critical situations');
        console.log('   • Contact the lock owner if needed');
      }
      
      process.exit(1);
    }
  }
  
  async reclaim(slug: string, options: ReclaimOptions): Promise<void> {
    const lockPath = getLockPath(slug);
    const owner = createLockOwnerFromOptions(options);
    
    try {
      const reclaimedLock = await executeReclaim(
        lockPath, 
        owner, 
        options.ttl || 3600, 
        options.force
      );
      
      console.log(`✅ Successfully reclaimed lock for ${slug}`);
      console.log(`🔒 New owner: ${reclaimedLock.owner}`);
      console.log(`📝 Reason: ${reclaimedLock.metadata?.reclaimed_reason}`);
      console.log(`⏰ TTL: ${reclaimedLock.ttl} seconds`);
      
    } catch (error) {
      console.error(`❌ Failed to reclaim lock: ${error.message}`);
      process.exit(1);
    }
  }
  
  async status(slug?: string): Promise<void> {
    const lockManager = new LockStatusManager();
    
    if (slug) {
      const status = await lockManager.getLockStatus(slug);
      console.log(`Lock status for ${slug}:`);
      console.log(JSON.stringify(status, null, 2));
    } else {
      const allStatuses = await lockManager.getAllLockStatuses();
      console.log('All active locks:');
      
      for (const status of allStatuses) {
        const icon = status.status === 'ACTIVE' ? '🔒' : '⚠️';
        console.log(`${icon} ${status.slug}: ${status.owner} (${status.age})`);
      }
    }
  }
}
```

### 6. Error Handling Integration

#### Enhanced Error Messages
```typescript
// src/utils/lock-errors.ts

export class LockErrorHandler {
  
  static handleLockError(error: Error, context: LockErrorContext): string {
    if (error instanceof AtomicLockError) {
      return this.formatAtomicLockError(error, context);
    }
    
    return error.message;
  }
  
  private static formatAtomicLockError(error: AtomicLockError, context: LockErrorContext): string {
    const lock = error.lockInfo;
    if (!lock) return error.message;
    
    const age = this.calculateLockAge(lock);
    const expires = this.calculateExpiration(lock);
    const suggestions = this.generateSuggestions(lock, context);
    
    return [
      `🔒 Change "${context.slug}" is locked by ${lock.owner}`,
      `📅 Since: ${new Date(lock.since).toLocaleString()}`,
      `⏱️  Age: ${age}`,
      `🕐 Expires in: ${expires}`,
      '',
      '💡 Suggestions:',
      ...suggestions.map(s => `   • ${s}`)
    ].join('\n');
  }
  
  private static generateSuggestions(lock: EnhancedLockInfo, context: LockErrorContext): string[] {
    const suggestions = [];
    
    if (this.isExpired(lock)) {
      suggestions.push('Lock is expired - use `openspec change reclaim --force <slug>`');
    }
    
    if (this.isSameUser(lock, context.currentUser)) {
      suggestions.push('Same user - use `openspec change reclaim --force <slug>`');
    }
    
    if (this.isAutomatedLock(lock)) {
      suggestions.push('Automated lock - consider waiting or contact admin');
    }
    
    suggestions.push(`Wait for lock to expire (${this.getTimeToExpiration(lock)})`);
    suggestions.push('Use `openspec change status <slug>` for details');
    
    return suggestions;
  }
}
```

## Testing Integration

### Enhanced Test Suite
```typescript
// test/utils/lock-integration.test.ts

describe('Lock Integration', () => {
  
  describe('Phase 1 Pseudocode Integration', () => {
    it('should integrate with change.open pseudocode', async () => {
      const mockContext = {
        slug: 'test-feature',
        template: 'feature',
        ttl: 3600
      };
      
      const result = await change_open(mockContext);
      
      expect(result.slug).toBe('test-feature');
      expect(result.lockInfo).toBeDefined();
      expect(result.lockInfo.owner).toMatch(/^pid-\d+@/);
    });
    
    it('should integrate with change.archive pseudocode', async () => {
      // First create a change
      await change_open({ slug: 'archive-test', template: 'feature' });
      
      // Then archive it
      const result = await change_archive({ slug: 'archive-test' });
      
      expect(result.archived).toBe(true);
      expect(result.receipt).toBeDefined();
    });
  });
  
  describe('Cross-Platform Lock Operations', () => {
    it('should work on Windows and Unix systems', async () => {
      // Test would be run on both platforms in CI
      const lockPath = path.join(testDir, 'cross-platform.lock');
      const owner = createTestLockOwner('local');
      
      const lockInfo = await atomic_lock_enhanced(lockPath, owner, 3600);
      expect(lockInfo.owner).toBe(owner.owner);
      
      // Verify lock file exists and is valid
      const exists = await fs.pathExists(lockPath);
      expect(exists).toBe(true);
    });
  });
  
  describe('Stale Lock Reclaim', () => {
    it('should reclaim expired locks', async () => {
      const lockPath = path.join(testDir, 'stale.lock');
      const oldOwner = createTestLockOwner('local');
      const newOwner = createTestLockOwner('local');
      
      // Create lock with short TTL
      await atomic_lock_enhanced(lockPath, oldOwner, 1);
      await sleep(1500); // Wait for expiration
      
      // Should be able to reclaim
      const reclaimed = await atomic_lock_enhanced(lockPath, newOwner, 3600);
      expect(reclaimed.owner).toBe(newOwner.owner);
      expect(reclaimed.metadata?.reclaimed_from).toBe(oldOwner.owner);
    });
  });
});
```

## Configuration

### Environment Variables
```bash
# Lock management configuration
OPENSPEC_LOCK_DIR=${PWD}/.openspec/.locks
OPENSPEC_DEFAULT_TTL=3600
OPENSPEC_AUTO_REFRESH=true

# Security and overrides
OPENSPEC_ADMIN_USER=admin@company.com
OPENSPEC_EMERGENCY_OVERRIDE=false
OPENSPEC_AUDIT_LOCKS=true

# Environment detection
OPENSPEC_ENVIRONMENT=local
OPENSPEC_SESSION_TOKEN=your-session-token
OPENSPEC_CI_SYSTEM=github-actions
OPENSPEC_CI_RUN_ID=12345

# Network filesystem handling
OPENSPEC_NETWORK_FILESYSTEM=false
OPENSPEC_LOCK_RETRY_COUNT=10
OPENSPEC_LOCK_RETRY_DELAY=100
```

This integration guide provides complete documentation for incorporating the enhanced lock management system into Phase 1 Task MCP, ensuring backward compatibility while adding robust security and usability features.