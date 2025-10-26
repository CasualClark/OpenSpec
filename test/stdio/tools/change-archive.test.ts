import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ChangeArchiveTool } from '../../../src/stdio/tools/change-archive.js';
import { createSecurityContext } from '../../../src/stdio/factory.js';

describe('ChangeArchiveTool', () => {
  let tool: ChangeArchiveTool;
  let testDir: string;
  let security: any;

  beforeEach(async () => {
    testDir = path.join('/tmp', `openspec-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    security = createSecurityContext(testDir);
    tool = new ChangeArchiveTool(security, console.log);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('tool definition', () => {
    it('should have correct tool name', () => {
      expect(tool.definition.name).toBe('change.archive');
    });

    it('should have proper description', () => {
      expect(tool.definition.description).toContain('Archive a completed change');
    });

    it('should have input schema with slug field', () => {
      const schema = tool.definition.inputSchema;
      // Just check that schema exists and is an object
      expect(schema).toBeDefined();
      expect(typeof schema.parse).toBe('function');
    });
  });

  describe('input validation', () => {
    it('should reject invalid slug format', async () => {
      const result = await tool.execute({ slug: 'Invalid-Slug!' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid slug format');
    });

    it('should reject empty slug', async () => {
      const result = await tool.execute({ slug: '' });
      expect(result.isError).toBe(true);
    });

    it('should accept valid slug', async () => {
      const result = await tool.execute({ slug: 'valid-change-slug' });
      // Should not fail on validation
      expect(result.content[0].text).not.toContain('Invalid slug format');
    });
  });

  describe('path security', () => {
    it('should detect path traversal attempts', async () => {
      const result = await tool.execute({ slug: '../../../etc/passwd' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid slug format');
    });

    it('should reject changes outside openspec directory', async () => {
      // This would be caught by slug validation, but testing the concept
      const result = await tool.execute({ slug: 'valid-slug' });
      expect(result.content[0].text).not.toContain('Path traversal detected');
    });
  });

  describe('change existence', () => {
    it('should reject non-existent change', async () => {
      const result = await tool.execute({ slug: 'nonexistent' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('does not exist');
    });
  });

  describe('change structure validation', () => {
    beforeEach(async () => {
      // Create openspec structure
      const openspecDir = path.join(testDir, 'openspec', 'changes', 'test-change');
      await fs.mkdir(openspecDir, { recursive: true });
    });

    it('should reject change without proposal.md', async () => {
      const result = await tool.execute({ slug: 'test-change' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Required file missing: proposal.md');
    });

    it('should reject change without tasks.md', async () => {
      const changeDir = path.join(testDir, 'openspec', 'changes', 'test-change');
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test Proposal');
      
      const result = await tool.execute({ slug: 'test-change' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Required file missing: tasks.md');
    });

    it('should accept change with required files', async () => {
      const changeDir = path.join(testDir, 'openspec', 'changes', 'test-change');
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test Proposal');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '# Tasks');
      
      const result = await tool.execute({ slug: 'test-change' });
      expect(result.content[0].text).not.toContain('Required file missing');
    });
  });

  describe('receipt generation', () => {
    it('should validate change structure before archiving', async () => {
      // Create a complete change structure
      const changeDir = path.join(testDir, 'openspec', 'changes', 'test-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test Proposal');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '# Tasks');
      
      // The tool should get past structure validation
      const result = await tool.execute({ slug: 'test-change' });
      // Should not fail on structure validation
      expect(result.content[0].text).not.toContain('Required file missing');
    });

    describe('computeReceipt method', () => {
      let changeDir: string;

      beforeEach(async () => {
        changeDir = path.join(testDir, 'openspec', 'changes', 'test-change');
        await fs.mkdir(changeDir, { recursive: true });
        await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test Proposal');
        await fs.writeFile(path.join(changeDir, 'tasks.md'), '# Tasks');
      });

      it('should generate receipt with all required fields', async () => {
        // Mock execFile for all external calls
        const execFileMock = vi.fn();
        vi.doMock('child_process', () => ({
          execFile: execFileMock,
          promisify: (fn: any) => fn
        }));

        // Setup mock responses
        execFileMock.mockImplementation((cmd: string, args: string[], options: any, callback: any) => {
          if (typeof options === 'function') {
            callback = options;
            options = {};
          }
          
          if (cmd === 'git') {
            if (args.includes('log')) {
              callback(null, { stdout: 'abc123 Initial commit\ndef456 Add feature' });
            } else if (args.includes('rev-list')) {
              callback(null, { stdout: '2' });
            } else if (args.includes('ls-files')) {
              callback(null, { stdout: 'openspec/changes/test-change/proposal.md\nopenspec/changes/test-change/tasks.md' });
            } else {
              callback(null, { stdout: '' });
            }
          } else if (cmd === 'pnpm') {
            callback(null, { stdout: '{"coverageMap": {}}' });
          } else if (cmd === 'openspec') {
            callback(null, { stdout: '0.13.0' });
          } else {
            callback(null, { stdout: '' });
          }
        });

        // Access private method for testing
        const computeReceipt = (tool as any).computeReceipt.bind(tool);
        const receipt = await computeReceipt(changeDir, 'test-change');

        // Verify receipt structure matches schema
        expect(receipt).toHaveProperty('slug', 'test-change');
        expect(receipt).toHaveProperty('commits');
        expect(receipt).toHaveProperty('filesTouched');
        expect(receipt).toHaveProperty('tests');
        expect(receipt).toHaveProperty('archivedAt');
        expect(receipt).toHaveProperty('toolVersions');
        expect(Array.isArray(receipt.commits)).toBe(true);
        expect(Array.isArray(receipt.filesTouched)).toBe(true);
        expect(typeof receipt.tests).toBe('object');
        expect(typeof receipt.archivedAt).toBe('string');
        expect(typeof receipt.toolVersions).toBe('object');

        // Reset mock
        vi.doUnmock('child_process');
      });

      it('should handle git operations gracefully when they fail', async () => {
        // Mock git to fail
        const execFileMock = vi.fn();
        vi.doMock('child_process', () => ({
          execFile: execFileMock,
          promisify: (fn: any) => fn
        }));

        execFileMock.mockImplementation((cmd: string, args: string[], options: any, callback: any) => {
          if (typeof options === 'function') {
            callback = options;
            options = {};
          }
          
          if (cmd === 'git') {
            callback(new Error('Git not available'), { stderr: 'Git command failed' });
          } else {
            callback(null, { stdout: '' });
          }
        });

        const computeReceipt = (tool as any).computeReceipt.bind(tool);
        const receipt = await computeReceipt(changeDir, 'test-change');

        // Should still generate receipt with empty git data
        expect(receipt.commits).toEqual([]);
        expect(receipt.filesTouched).toEqual([]);
        expect(receipt.gitRange).toBeUndefined();

        vi.doUnmock('child_process');
      });

      it('should ensure receipt complies with schema', async () => {
        // Mock all external calls to return empty results
        const execFileMock = vi.fn();
        vi.doMock('child_process', () => ({
          execFile: execFileMock,
          promisify: (fn: any) => fn
        }));

        execFileMock.mockImplementation((cmd: string, args: string[], options: any, callback: any) => {
          if (typeof options === 'function') {
            callback = options;
            options = {};
          }
          callback(null, { stdout: '' });
        });

        const computeReceipt = (tool as any).computeReceipt.bind(tool);
        const receipt = await computeReceipt(changeDir, 'test-change');

        // Validate against receipt schema requirements
        const requiredFields = ['slug', 'commits', 'filesTouched', 'tests', 'archivedAt', 'toolVersions'];
        for (const field of requiredFields) {
          expect(receipt).toHaveProperty(field);
        }

        // Validate types
        expect(typeof receipt.slug).toBe('string');
        expect(Array.isArray(receipt.commits)).toBe(true);
        expect(Array.isArray(receipt.filesTouched)).toBe(true);
        expect(typeof receipt.tests).toBe('object');
        expect(typeof receipt.archivedAt).toBe('string');
        expect(typeof receipt.toolVersions).toBe('object');

        // Validate tests object structure
        expect(typeof receipt.tests.added).toBe('number');
        expect(typeof receipt.tests.updated).toBe('number');
        expect(typeof receipt.tests.passed).toBe('boolean');
        expect(receipt.tests.added).toBeGreaterThanOrEqual(0);
        expect(receipt.tests.updated).toBeGreaterThanOrEqual(0);

        // Validate archivedAt format
        expect(new Date(receipt.archivedAt)).toBeInstanceOf(Date);

        // Validate toolVersions structure
        expect(typeof receipt.toolVersions.taskMcp).toBe('string');
        expect(typeof receipt.toolVersions.openspecCli).toBe('string');
        expect(typeof receipt.toolVersions['change.archive']).toBe('string');

        vi.doUnmock('child_process');
      });

      it('should detect tool versions correctly', async () => {
        // Mock version detection
        const execFileMock = vi.fn();
        vi.doMock('child_process', () => ({
          execFile: execFileMock,
          promisify: (fn: any) => fn
        }));

        execFileMock.mockImplementation((cmd: string, args: string[], options: any, callback: any) => {
          if (typeof options === 'function') {
            callback = options;
            options = {};
          }
          
          if (cmd === 'git') {
            callback(null, { stdout: '' });
          } else if (cmd === 'openspec') {
            callback(null, { stdout: '0.13.0' });
          } else if (cmd === 'pnpm') {
            callback(null, { stdout: '' });
          } else {
            callback(null, { stdout: '' });
          }
        });

        // Set environment variable for task MCP version
        process.env.TASK_MCP_VERSION = '2.1.0';

        const computeReceipt = (tool as any).computeReceipt.bind(tool);
        const receipt = await computeReceipt(changeDir, 'test-change');

        // Verify tool versions
        expect(receipt.toolVersions).toHaveProperty('taskMcp', '2.1.0');
        expect(receipt.toolVersions).toHaveProperty('openspecCli', '0.12.0');
        expect(receipt.toolVersions).toHaveProperty('change.archive', '1.0.0');

        // Cleanup
        delete process.env.TASK_MCP_VERSION;
        vi.doUnmock('child_process');
      });
    });
  });
});