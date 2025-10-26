/**
 * Test utilities for performance benchmarks
 */

import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Create a mock security object for testing
 */
export function createTestSecurity(sandboxRoot: string) {
  return {
    sandboxRoot,
    validatePath: (testPath: string) => {
      if (!testPath.startsWith(sandboxRoot)) {
        throw new Error('Access denied: path outside sandbox');
      }
      return true;
    },
    sanitizePath: (testPath: string) => {
      return path.normalize(testPath).replace(/\.\./g, '');
    }
  };
}

/**
 * Create a mock logger for testing
 */
export function createTestLogger() {
  const logs: Array<{ level: string; message: string; timestamp: number }> = [];
  
  return {
    logs,
    logger: (level: string, message: string) => {
      logs.push({
        level,
        message,
        timestamp: Date.now()
      });
      console.log(`[${level.toUpperCase()}] ${message}`);
    },
    clearLogs: () => {
      logs.length = 0;
    },
    getLogs: () => [...logs],
    hasLog: (level: string, message: string) => {
      return logs.some(log => 
        log.level === level && log.message.includes(message)
      );
    }
  };
}

/**
 * Create a temporary directory for testing
 */
export async function createTempDir(prefix: string = 'test-'): Promise<string> {
  const tempDir = path.join(process.cwd(), `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up a temporary directory
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup temp dir ${tempDir}:`, error);
  }
}

/**
 * Create a large test file
 */
export async function createTestFile(filePath: string, sizeInBytes: number): Promise<void> {
  const content = 'x'.repeat(sizeInBytes);
  await fs.writeFile(filePath, content);
}

/**
 * Create a test changes directory with multiple changes
 */
export async function createTestChanges(changesDir: string, count: number): Promise<void> {
  await fs.mkdir(changesDir, { recursive: true });
  
  for (let i = 0; i < count; i++) {
    const changeDir = path.join(changesDir, `change-${String(i).padStart(4, '0')}`);
    await fs.mkdir(changeDir, { recursive: true });

    // Create proposal.md
    const proposalContent = `# Change ${i}

## Description
This is test change ${i} for performance testing.

## Requirements
- Requirement 1 for change ${i}
- Requirement 2 for change ${i}

## Implementation
Implementation details for change ${i}.
`;
    await fs.writeFile(path.join(changeDir, 'proposal.md'), proposalContent);

    // Create specs directory
    const specsDir = path.join(changeDir, 'specs');
    await fs.mkdir(specsDir, { recursive: true });
    await fs.writeFile(path.join(specsDir, 'spec1.md'), `# Spec for change ${i}`);

    // Create tasks directory
    const tasksDir = path.join(changeDir, 'tasks');
    await fs.mkdir(tasksDir, { recursive: true });
    await fs.writeFile(
      path.join(tasksDir, 'task1.json'),
      JSON.stringify({
        name: `Task 1 for change ${i}`,
        status: 'pending'
      }, null, 2)
    );
  }
}

/**
 * IDE Response Validator for testing IDE-specific response formats
 */
export class IDEResponseValidator {
  /**
   * Validate pagination response format for IDE consumption
   */
  validatePaginationResponse(response: any): boolean {
    try {
      // Check required fields
      if (!response || typeof response !== 'object') {
        return false;
      }

      const requiredFields = ['changes', 'total', 'generated', 'processingTime'];
      for (const field of requiredFields) {
        if (!(field in response)) {
          return false;
        }
      }

      // Validate changes array
      if (!Array.isArray(response.changes)) {
        return false;
      }

      // Validate each change entry
      for (const change of response.changes) {
        if (!this.validateChangeEntry(change)) {
          return false;
        }
      }

      // Validate total count
      if (typeof response.total !== 'number' || response.total < 0) {
        return false;
      }

      // Validate timestamp
      if (typeof response.generated !== 'string' || !Date.parse(response.generated)) {
        return false;
      }

      // Validate processing time
      if (typeof response.processingTime !== 'number' || response.processingTime < 0) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate individual change entry
   */
  private validateChangeEntry(change: any): boolean {
    if (!change || typeof change !== 'object') {
      return false;
    }

    const requiredFields = ['slug', 'title', 'status', 'modified'];
    for (const field of requiredFields) {
      if (!(field in change)) {
        return false;
      }
    }

    // Validate slug
    if (typeof change.slug !== 'string' || change.slug.length === 0) {
      return false;
    }

    // Validate title
    if (typeof change.title !== 'string') {
      return false;
    }

    // Validate status
    const validStatuses = ['draft', 'planned', 'in-progress', 'complete', 'error', 'unknown', 'locked'];
    if (!validStatuses.includes(change.status)) {
      return false;
    }

    // Validate modified timestamp
    if (typeof change.modified !== 'string' || !Date.parse(change.modified)) {
      return false;
    }

    return true;
  }

  /**
   * Validate streaming response format for IDE consumption
   */
  validateStreamingResponse(response: any): boolean {
    try {
      if (!response || typeof response !== 'object') {
        return false;
      }

      // Check streaming-specific fields
      if (response.validation && typeof response.validation === 'object') {
        const validation = response.validation;
        if (typeof validation.isValid !== 'boolean') {
          return false;
        }
      }

      if (response.content !== undefined && typeof response.content !== 'string') {
        return false;
      }

      if (response.metadata && typeof response.metadata !== 'object') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate error response format for IDE consumption
   */
  validateErrorResponse(response: any): boolean {
    try {
      if (!response || typeof response !== 'object') {
        return false;
      }

      // Check error-specific fields
      const requiredFields = ['success', 'error'];
      for (const field of requiredFields) {
        if (!(field in response)) {
          return false;
        }
      }

      // Validate success flag
      if (typeof response.success !== 'boolean' || response.success !== false) {
        return false;
      }

      // Validate error message
      if (typeof response.error !== 'string' || response.error.length === 0) {
        return false;
      }

      // Optional error code
      if (response.errorCode !== undefined && typeof response.errorCode !== 'string') {
        return false;
      }

      // Optional recovery suggestions
      if (response.recoverySuggestions !== undefined && !Array.isArray(response.recoverySuggestions)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate progress update format for IDE UI
   */
  validateProgressUpdate(progress: any): boolean {
    try {
      if (!progress || typeof progress !== 'object') {
        return false;
      }

      // Required fields
      const requiredFields = ['percentage', 'timestamp'];
      for (const field of requiredFields) {
        if (!(field in progress)) {
          return false;
        }
      }

      // Validate percentage
      if (typeof progress.percentage !== 'number' || 
          progress.percentage < 0 || 
          progress.percentage > 100) {
        return false;
      }

      // Validate timestamp
      if (typeof progress.timestamp !== 'number' || progress.timestamp <= 0) {
        return false;
      }

      // Optional stage
      if (progress.stage !== undefined && typeof progress.stage !== 'string') {
        return false;
      }

      // Optional bytes read
      if (progress.bytesRead !== undefined && typeof progress.bytesRead !== 'number') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}