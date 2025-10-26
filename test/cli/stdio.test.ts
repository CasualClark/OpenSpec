import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StdioCommand } from '../../src/commands/stdio.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('StdioCommand', () => {
  let stdioCommand: StdioCommand;
  let testDir: string;

  beforeEach(async () => {
    stdioCommand = new StdioCommand();
    testDir = path.join(process.cwd(), 'test-tmp-stdio');
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('status', () => {
    it('should report not running when no PID file exists', async () => {
      const pidFile = path.join(testDir, 'test.pid');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await stdioCommand.status(pidFile);
      
      expect(consoleSpy).toHaveBeenCalledWith('Server status: Not running');
      consoleSpy.mockRestore();
    });

    it('should report invalid PID file for malformed content', async () => {
      const pidFile = path.join(testDir, 'test.pid');
      await fs.writeFile(pidFile, 'invalid-pid', 'utf-8');
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await stdioCommand.status(pidFile);
      
      expect(consoleSpy).toHaveBeenCalledWith('Server status: Invalid PID file');
      consoleSpy.mockRestore();
    });
  });

  describe('stop', () => {
    it('should fail when no PID file exists', async () => {
      const pidFile = path.join(testDir, 'test.pid');
      
      // Mock process.exit to capture the call
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      
      await expect(stdioCommand.stop(pidFile)).rejects.toThrow('process.exit called');
      
      exitSpy.mockRestore();
    });
  });
});