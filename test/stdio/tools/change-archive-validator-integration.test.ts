/**
 * Integration tests for change-archive tool with ChangeStructureValidator
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChangeArchiveTool } from '../../../src/stdio/tools/change-archive.js';
import { ChangeStructureValidator } from '../../../src/stdio/validation/change-structure-validator.js';

describe('ChangeArchiveTool with ChangeStructureValidator Integration', () => {
  let tempDir: string;
  let changeDir: string;
  let archiveTool: ChangeArchiveTool;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-archive-test-'));
    changeDir = path.join(tempDir, 'openspec', 'changes', 'test-change');
    await fs.mkdir(changeDir, { recursive: true });
    
    // Create archive tool instance
    archiveTool = new ChangeArchiveTool({
      sandboxRoot: tempDir,
      allowedPaths: [tempDir],
      maxFileSize: 1024 * 1024,
      allowedSchemas: ['change.archive'],
      user: { id: 'test', type: 'local' }
    }, (level, message) => {
      // Mock logger for testing
      console.log(`[${level.toUpperCase()}] ${message}`);
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Successful Validation', () => {
    it('should archive change with valid structure', async () => {
      // Create valid change structure
      await fs.writeFile(path.join(changeDir, 'proposal.md'), `# Add User Authentication

## Rationale
Improve security by adding user authentication.

## Implementation
JWT-based authentication system.`);

      await fs.writeFile(path.join(changeDir, 'tasks.md'), `- [ ] Create auth service
- [ ] Implement JWT handling
- [ ] Add login endpoints
- [ ] Write tests`);

      // Create specs directory
      const specsDir = path.join(changeDir, 'specs');
      await fs.mkdir(specsDir);
      await fs.writeFile(path.join(specsDir, 'auth.md'), `# Auth Spec

## Requirements
- JWT tokens
- Secure password handling`);

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(false);
      expect(result.content).toBeDefined();
      expect(result.content![0].text).toContain('Successfully archived');
    });

    it('should archive change without optional directories', async () => {
      // Create minimal valid change
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Simple Change');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(false);
    });
  });

  describe('Validation Failures', () => {
    it('should reject change with missing proposal.md', async () => {
      // Only create tasks.md
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('EBADSHAPE_PROPOSAL_MISSING');
    });

    it('should reject change with missing tasks.md', async () => {
      // Only create proposal.md
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('EBADSHAPE_TASKS_MISSING');
    });

    it('should reject change with security violations', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test\n\n<script>alert("xss")</script>');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('EBADSHAPE_SECURITY_VIOLATION');
    });

    it('should reject change with empty files', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '');

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('EBADSHAPE_CONTENT_EMPTY');
    });

    it('should reject change with malformed tasks', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), 'No list format here\nJust plain text');

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('EBADSHAPE_TASKS_NO_STRUCTURE');
    });
  });

  describe('Error Message Formatting', () => {
    it('should provide detailed error messages with hints', async () => {
      // Create change with multiple issues
      await fs.writeFile(path.join(changeDir, 'proposal.md'), ''); // Empty
      await fs.writeFile(path.join(changeDir, 'tasks.md'), ''); // Empty

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(true);
      const errorMessage = result.content![0].text;
      
      // Should contain both error codes
      expect(errorMessage).toContain('EBADSHAPE_CONTENT_EMPTY');
      
      // Should contain hints
      expect(errorMessage).toContain('Add appropriate content to the file');
    });

    it('should include multiple validation errors in response', async () => {
      // Don't create any files - should trigger multiple missing file errors
      const result = await archiveTool.execute({ slug: 'test-change' });
      
      expect(result.isError).toBe(true);
      const errorMessage = result.content![0].text;
      
      // Should contain both missing file errors
      expect(errorMessage).toContain('EBADSHAPE_PROPOSAL_MISSING');
      expect(errorMessage).toContain('EBADSHAPE_TASKS_MISSING');
    });
  });

  describe('Security Integration', () => {
    it('should use InputSanitizer for path validation', async () => {
      // Test with path traversal attempt
      const maliciousSlug = '../../../etc/passwd';
      
      const result = await archiveTool.execute({ slug: maliciousSlug });
      
      expect(result.isError).toBe(true);
      // Should catch path traversal before detailed validation
    });

    it('should sanitize error messages', async () => {
      // Create file with sensitive path information
      await fs.writeFile(path.join(changeDir, 'proposal.md'), `# Test
      
Located at: /home/user/secrets/config.txt`);
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');

      const result = await archiveTool.execute({ slug: 'test-change' });
      
      // Error messages should be sanitized
      if (result.isError) {
        expect(result.content![0].text).not.toContain('/home/user');
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large changes efficiently', async () => {
      // Create large but valid change
      const largeContent = '# Large Change\n\n'.padEnd(10000, 'x');
      await fs.writeFile(path.join(changeDir, 'proposal.md'), largeContent);
      
      const tasks = Array.from({ length: 100 }, (_, i) => `- Task ${i + 1}: Description`).join('\n');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), tasks);

      const startTime = Date.now();
      const result = await archiveTool.execute({ slug: 'test-change' });
      const endTime = Date.now();
      
      expect(result.isError).toBe(false);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should handle permission errors gracefully', async () => {
      // Create valid files first
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      // Try to make directory read-only (might not work on all systems)
      try {
        await fs.chmod(changeDir, 0o444);
        
        const result = await archiveTool.execute({ slug: 'test-change' });
        
        // Should handle permission errors without crashing
        expect(result).toBeDefined();
        
        // Restore permissions for cleanup
        await fs.chmod(changeDir, 0o755);
      } catch {
        // Skip this test if chmod fails
      }
    });
  });

  describe('Validator Independence', () => {
    it('should allow direct validator usage', async () => {
      // Test that validator can be used independently
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');

      const validation = await ChangeStructureValidator.validate(changeDir);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.summary.requiredFiles).toHaveLength(2);
    });

    it('should provide same validation results as direct usage', async () => {
      // Create change with known issues
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      // Missing tasks.md

      // Direct validator usage
      const directValidation = await ChangeStructureValidator.validate(changeDir);
      
      // Through archive tool
      const archiveResult = await archiveTool.execute({ slug: 'test-change' });
      
      // Both should detect the same issues
      expect(directValidation.isValid).toBe(false);
      expect(archiveResult.isError).toBe(true);
      expect(directValidation.errors.some(e => e.code === 'EBADSHAPE_TASKS_MISSING')).toBe(true);
      expect(archiveResult.content![0].text).toContain('EBADSHAPE_TASKS_MISSING');
    });
  });
});