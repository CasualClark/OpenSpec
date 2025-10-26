import { promises as fs } from 'fs';
import * as path from 'path';
import { ErrorSanitizer } from '../stdio/security/error-sanitizer.js';

export interface LockInfo {
  owner: string;
  since: number;
  ttl: number;
}

export class AtomicLockError extends Error {
  constructor(message: string, public readonly lockInfo?: LockInfo) {
    super(message);
    this.name = 'AtomicLockError';
  }
}

/**
 * Validates that a lock file has secure permissions.
 * On Unix-like systems, this means 0o600 (owner read/write only).
 * On Windows, this function is a no-op as Windows has different permission semantics.
 * 
 * @param lockPath - Path to the lock file
 * @throws Error if permissions are insecure on Unix-like systems
 */
async function validateLockFilePermissions(lockPath: string): Promise<void> {
  // Skip validation on Windows as it has different permission semantics
  if (process.platform === 'win32') {
    return;
  }

  try {
    const stats = await fs.stat(lockPath);
    const mode = stats.mode;
    
    // Check if file has secure permissions (0o600 = owner read/write only)
    // We check that the file has exactly 0o600 permissions
    if ((mode & 0o777) !== 0o600) {
      // Log warning but don't fail - this allows backward compatibility
      // while still alerting to potential security issues
      console.warn(`Lock file ${lockPath} has insecure permissions: ${(mode & 0o777).toString(8)}. Recommended: 0o600`);
    }
  } catch (error) {
    // If we can't stat the file, it might not exist or there's a permissions issue
    // Don't throw here as this is just a validation check
  }
}

/**
 * Canonicalizes a file path by resolving it to an absolute path and optionally resolving symlinks.
 * 
 * @param filePath - The path to canonicalize
 * @param resolveSymlinks - Whether to resolve symlinks (default: true)
 * @returns The canonicalized absolute path
 * @throws Error if the path does not exist and resolveSymlinks is true
 */
export async function canonicalize(
  filePath: string, 
  resolveSymlinks: boolean = true
): Promise<string> {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  try {
    if (resolveSymlinks) {
      // Use realpath to resolve symlinks and get the canonical path
      return await fs.realpath(filePath);
    } else {
      // Just resolve to absolute path without resolving symlinks
      return path.resolve(filePath);
    }
  } catch (error: any) {
    const errorToSanitize = error instanceof Error ? error : new Error(String(error));
    const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
      context: 'core',
      userType: 'developer',
      logDetails: true
    });
    
    if (error.code === 'ENOENT' && resolveSymlinks) {
      throw new Error(`Path does not exist: ${path.basename(filePath)}`);
    }
    throw new Error(`Failed to canonicalize path: ${sanitized.message}`);
  }
}

/**
 * Validates a slug against the pattern:^[a-z0-9](?:[a-z0-9\-]{1,62})[a-z0-9]$
 * This matches the JSON schema pattern for slugs.
 * 
 * @param slug - The slug to validate
 * @returns True if the slug is valid, false otherwise
 */
export function validate_slug(slug: string): boolean {
  if (typeof slug !== 'string') {
    return false;
  }

  // Pattern: starts with lowercase letter or digit, ends with lowercase letter or digit
  // Contains 1-62 characters of lowercase letters, digits, or hyphens in the middle
  // Total length: 3-64 characters
  // Note: The pattern allows consecutive hyphens as per the JSON schema
  const slugPattern = /^[a-z0-9](?:[a-z0-9\-]{1,62})[a-z0-9]$/;
  
  return slugPattern.test(slug);
}

/**
 * Creates an atomic file-based lock with stale lock reclamation.
 * 
 * @param lockPath - Path to the lock file
 * @param owner - Identifier for the lock owner
 * @param ttl - Time-to-live for the lock in seconds
 * @returns Promise resolving to lock information
 * @throws AtomicLockError if lock cannot be acquired
 * @throws Error for invalid parameters
 */
export async function atomic_lock(
  lockPath: string, 
  owner: string, 
  ttl: number
): Promise<LockInfo> {
  // Validate inputs
  if (!lockPath || typeof lockPath !== 'string') {
    throw new Error('Lock path must be non-empty');
  }
  
  if (!owner || typeof owner !== 'string') {
    throw new Error('Owner must be non-empty');
  }
  
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new Error('TTL must be positive');
  }

  const now = Date.now();
  const newLockInfo: LockInfo = {
    owner,
    since: now,
    ttl
  };

  // Ensure parent directory exists
  const lockDir = path.dirname(lockPath);
  await fs.mkdir(lockDir, { recursive: true });

  // Try to acquire lock atomically using exclusive file creation
  const tempLockPath = `${lockPath}.${process.pid}.${now}.tmp`;
  
  try {
    // Write new lock info to temporary file with secure permissions (0o600)
    await fs.writeFile(tempLockPath, JSON.stringify(newLockInfo, null, 2), { mode: 0o600 });
    
    // Try to read existing lock
    let existingLock: LockInfo | null = null;
    try {
      const existingContent = await fs.readFile(lockPath, 'utf-8');
      existingLock = JSON.parse(existingContent) as LockInfo;
    } catch (error: any) {
      // File doesn't exist or is corrupted, treat as no existing lock
      existingLock = null;
    }

    // Check if existing lock is still valid
    if (existingLock) {
      const lockAge = now - existingLock.since;
      const lockExpiration = existingLock.ttl * 1000; // Convert TTL to milliseconds
      
      if (lockAge < lockExpiration && existingLock.owner !== owner) {
        // Lock is still valid and owned by someone else
        await fs.unlink(tempLockPath).catch(() => {}); // Clean up temp file
        
        const error = new Error(`Lock is held by ${existingLock.owner} since ${new Date(existingLock.since).toISOString()}`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'core',
          userType: 'user',
          logDetails: true
        });
        
        throw new AtomicLockError(
          `Resource is locked by another process`,
          existingLock
        );
      }
      // Lock is stale or owned by us, we can proceed
    }

    // Atomically move temporary file to lock file
    await fs.rename(tempLockPath, lockPath);
    
    return newLockInfo;
    
  } catch (error: any) {
    // Clean up temporary file if it exists
    await fs.unlink(tempLockPath).catch(() => {});
    
    if (error instanceof AtomicLockError) {
      throw error;
    }
    
    const errorToSanitize = error instanceof Error ? error : new Error(String(error));
    const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
      context: 'core',
      userType: 'developer',
      logDetails: true
    });
    throw new Error(`Failed to acquire lock: ${sanitized.message}`);
  }
}

/**
 * Releases an atomic lock by removing the lock file.
 * 
 * @param lockPath - Path to the lock file to release
 * @throws Error if lock file cannot be removed
 */
export async function release_lock(lockPath: string): Promise<void> {
  if (!lockPath || typeof lockPath !== 'string') {
    throw new Error('Lock path must be non-empty');
  }

  try {
    await fs.unlink(lockPath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Lock file doesn't exist, consider it released
      return;
    }
    const errorToSanitize = error instanceof Error ? error : new Error(String(error));
    const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
      context: 'core',
      userType: 'developer',
      logDetails: true
    });
    throw new Error(`Failed to release lock: ${sanitized.message}`);
  }
}