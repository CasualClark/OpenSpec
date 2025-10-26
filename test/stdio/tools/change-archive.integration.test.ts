import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ChangeArchiveTool } from '../../../src/stdio/tools/change-archive.js';
import { createSecurityContext } from '../../../src/stdio/factory.js';

describe('ChangeArchiveTool Integration', () => {
  let tool: ChangeArchiveTool;
  let testDir: string;
  let security: any;

  beforeEach(async () => {
    testDir = path.join('/tmp', `openspec-integration-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize openspec structure
    const openspecDir = path.join(testDir, 'openspec');
    await fs.mkdir(openspecDir, { recursive: true });
    
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

  it('should handle already archived change correctly', async () => {
    // Create a change with a receipt (simulating already archived)
    const changeDir = path.join(testDir, 'openspec', 'changes', 'already-archived');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test Proposal');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '# Tasks');
    
    // Create receipt
    const receipt = {
      slug: 'already-archived',
      commits: [],
      filesTouched: [],
      tests: { added: 0, updated: 0, passed: true },
      archivedAt: new Date().toISOString(),
      toolVersions: { 'change.archive': '1.0.0' }
    };
    await fs.writeFile(
      path.join(changeDir, 'receipt.json'),
      JSON.stringify(receipt, null, 2)
    );
    
    const result = await tool.execute({ slug: 'already-archived' });
    
    expect(result).toBeDefined();
    expect(result.isError).toBeUndefined(); // Success results don't have isError set
    expect(result.isError !== true).toBe(true); // Make sure it's not an error
    expect(result.content[0].text).toContain('already archived');
    expect(result.content[0].text).toContain('Archived at:');
  });

  it('should follow Phase 1 pseudocode flow', async () => {
    // Create a complete change
    const changeDir = path.join(testDir, 'openspec', 'changes', 'phase1-test');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Phase 1 Test\n\n## Why\nTesting Phase 1 implementation\n\n## What Changes\nImplement change archive tool');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '# Tasks\n\n- [x] Implement tool\n- [x] Add tests');
    
    // Add a lock file
    const lockInfo = {
      owner: `pid-${process.pid}@localhost`,
      since: Date.now(),
      ttl: 3600
    };
    await fs.writeFile(
      path.join(changeDir, '.lock'),
      JSON.stringify(lockInfo, null, 2)
    );
    
    const result = await tool.execute({ slug: 'phase1-test' });
    
    expect(result).toBeDefined();
    expect(result.isError).toBeUndefined(); // Success results don't have isError set
    expect(result.isError !== true).toBe(true); // Make sure it's not an error
    expect(result.content[0].text).toContain('Successfully archived change');
    expect(result.content[0].text).toContain('API Version: 1.0');
    expect(result.content[0].text).toContain('Archived At:');
  });

  it('should handle missing openspec directory gracefully', async () => {
    const result = await tool.execute({ slug: 'no-openspec' });
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not exist');
  });
});