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