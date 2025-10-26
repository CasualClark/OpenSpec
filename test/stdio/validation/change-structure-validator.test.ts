/**
 * Tests for ChangeStructureValidator
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  ChangeStructureValidator, 
  ChangeStructureErrorCode,
  ChangeStructureValidationOptions,
  ChangeStructureValidationError
} from '../../../src/stdio/validation/change-structure-validator.js';

describe('ChangeStructureValidator', () => {
  let tempDir: string;
  let changeDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-test-'));
    changeDir = path.join(tempDir, 'test-change');
    await fs.mkdir(changeDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Validation', () => {
    it('should pass validation for complete valid change', async () => {
      // Create required files
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test Change\n\nThis is a test proposal with rationale.');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1: Implement feature\n- Task 2: Write tests');
      
      // Create optional specs directory
      const specsDir = path.join(changeDir, 'specs');
      await fs.mkdir(specsDir);
      await fs.writeFile(path.join(specsDir, 'spec.md'), '# Specification\n\nDetails here.');

      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.requiredFiles).toEqual(['proposal.md', 'tasks.md']);
      expect(result.summary.optionalFiles).toContain('specs');
    });

    it('should fail when required files are missing', async () => {
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      
      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toContain(ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_MISSING);
      expect(errorCodes).toContain(ChangeStructureErrorCode.EBADSHAPE_TASKS_MISSING);
    });

    it('should fail when change directory does not exist', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');
      const result = await ChangeStructureValidator.validate(nonExistentDir);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ChangeStructureErrorCode.EBADSHAPE_DIRECTORY_INVALID);
    });
  });

  describe('Security Validation', () => {
    it('should detect path traversal attempts', async () => {
      const maliciousPath = '../../../etc/passwd';
      const result = await ChangeStructureValidator.validate(maliciousPath);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_PATH_TRAVERSAL)).toBe(true);
    });

    it('should detect XSS content in files', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test\n\n<script>alert("xss")</script>');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_SECURITY_VIOLATION)).toBe(true);
    });

    it('should detect binary content', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test\n\nValid content');
      // Create a file with binary content
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      await fs.writeFile(path.join(changeDir, 'tasks.md'), binaryContent);
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_SECURITY_VIOLATION)).toBe(true);
    });

    it('should detect oversized files', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      
      // Create a large file
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      await fs.writeFile(path.join(changeDir, 'tasks.md'), largeContent);
      
      const result = await ChangeStructureValidator.validate(changeDir, { maxFileSize: 1024 * 1024 });
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_SIZE_EXCEEDED)).toBe(true);
    });
  });

  describe('Content Validation', () => {
    it('should detect empty files', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '   \n  \n');
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_CONTENT_EMPTY)).toBe(true);
    });

    it('should validate proposal structure', async () => {
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      // Proposal without title
      await fs.writeFile(path.join(changeDir, 'proposal.md'), 'This is a proposal without title');
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(true); // Still valid, but with warning
      expect(result.warnings.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_INVALID)).toBe(true);
    });

    it('should validate tasks structure', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      
      // Tasks without proper list format
      await fs.writeFile(path.join(changeDir, 'tasks.md'), 'Task 1\nTask 2\nNo list format');
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_TASKS_NO_STRUCTURE)).toBe(true);
    });

    it('should accept various task list formats', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      
      const tasksContent = `- Task 1 with dash\n* Task 2 with asterisk\n+ Task 3 with plus\n1. Task 4 numbered`;
      await fs.writeFile(path.join(changeDir, 'tasks.md'), tasksContent);
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Optional Directories', () => {
    it('should not require optional directories', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(true);
      expect(result.summary.optionalFiles).toHaveLength(0);
    });

    it('should validate specs directory when present', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      // Create specs directory with invalid content
      const specsDir = path.join(changeDir, 'specs');
      await fs.mkdir(specsDir);
      await fs.writeFile(path.join(specsDir, 'bad.md'), '<script>alert("xss")</script>');
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_SECURITY_VIOLATION)).toBe(true);
    });

    it('should warn about empty specs directory', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      await fs.mkdir(path.join(changeDir, 'specs'));
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_SPECS_INVALID)).toBe(true);
    });

    it('should skip optional validation when disabled', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      // Create specs directory with invalid content
      const specsDir = path.join(changeDir, 'specs');
      await fs.mkdir(specsDir);
      await fs.writeFile(path.join(specsDir, 'bad.md'), '<script>alert("xss")</script>');
      
      const result = await ChangeStructureValidator.validate(changeDir, { validateOptional: false });
      
      expect(result.isValid).toBe(true); // Should pass because optional validation is disabled
    });
  });

  describe('Delta Validation', () => {
    it('should validate valid delta files', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      const validDelta = { version: '1.0', changes: ['file1', 'file2'] };
      await fs.writeFile(path.join(changeDir, 'delta.json'), JSON.stringify(validDelta));
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid JSON in delta files', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      await fs.writeFile(path.join(changeDir, 'delta.json'), '{ invalid json }');
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_DELTA_INVALID)).toBe(true);
    });
  });

  describe('Custom Validation Rules', () => {
    it('should apply custom validation rules', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      const customRule = (content: string, filePath: string): ChangeStructureValidationError[] => {
        if (content.includes('forbidden')) {
          return [{
            code: ChangeStructureErrorCode.EBADSHAPE_CONTENT_EMPTY, // Reuse existing code
            message: 'Content contains forbidden word',
            path: filePath,
            hint: 'Remove forbidden word',
            severity: 'high'
          }];
        }
        return [];
      };
      
      // Add forbidden word to proposal
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test with forbidden content');
      
      const result = await ChangeStructureValidator.validate(changeDir, { customRules: [customRule] });
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('forbidden'))).toBe(true);
    });
  });

  describe('Security Options', () => {
    it('should skip security checks when disabled', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test\n\n<script>alert("xss")</script>');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      const result = await ChangeStructureValidator.validate(changeDir, { securityChecks: false });
      
      expect(result.isValid).toBe(true); // Should pass because security checks are disabled
    });
  });

  describe('Error Handling', () => {
    it('should handle permission errors gracefully', async () => {
      // Create files first
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      // Make directory read-only (this might not work on all systems)
      try {
        await fs.chmod(changeDir, 0o444);
      } catch {
        // Skip this test if chmod fails
        return;
      }
      
      const result = await ChangeStructureValidator.validate(changeDir);
      
      // Should handle permission errors without crashing
      expect(result).toBeDefined();
      
      // Restore permissions for cleanup
      await fs.chmod(changeDir, 0o755);
    });

    it('should provide meaningful error hints', () => {
      const hint = ChangeStructureValidator.getErrorHint(ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_MISSING);
      expect(hint).toBe('Create proposal.md with change description and rationale');
      
      const securityHint = ChangeStructureValidator.getErrorHint(ChangeStructureErrorCode.EBADSHAPE_SECURITY_VIOLATION);
      expect(securityHint).toBe('Remove or sanitize security-sensitive content');
    });
  });

  describe('Integration with change-archive tool', () => {
    it('should work with typical change-archive scenarios', async () => {
      // Create a realistic change structure
      await fs.writeFile(path.join(changeDir, 'proposal.md'), `# Feature: Add User Authentication

## Rationale
This change adds user authentication to improve security.

## Implementation
Add JWT-based authentication with proper security measures.`);

      await fs.writeFile(path.join(changeDir, 'tasks.md'), `- [ ] Create authentication service
- [ ] Implement JWT token generation
- [ ] Add login/logout endpoints
- [ ] Write comprehensive tests
- [ ] Update documentation`);

      // Create specs directory
      const specsDir = path.join(changeDir, 'specs');
      await fs.mkdir(specsDir);
      await fs.writeFile(path.join(specsDir, 'auth-spec.md'), `# Authentication Specification

## Requirements
- JWT-based authentication
- Secure password handling
- Token expiration handling`);

      const result = await ChangeStructureValidator.validate(changeDir, { context: 'tool' });
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.requiredFiles).toHaveLength(2);
      expect(result.summary.optionalFiles).toContain('specs');
    });

    it('should catch common archive preparation issues', async () => {
      // Create incomplete change structure
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Incomplete');
      // Missing tasks.md
      
      const result = await ChangeStructureValidator.validate(changeDir, { context: 'tool' });
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ChangeStructureErrorCode.EBADSHAPE_TASKS_MISSING)).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of files efficiently', async () => {
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- Task 1');
      
      // Create many files in specs directory
      const specsDir = path.join(changeDir, 'specs');
      await fs.mkdir(specsDir);
      
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(path.join(specsDir, `spec${i}.md`), `# Spec ${i}\n\nContent for specification ${i}.`);
      }
      
      const startTime = Date.now();
      const result = await ChangeStructureValidator.validate(changeDir);
      const endTime = Date.now();
      
      expect(result.isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});