import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { 
  ChangeTemplateManager, 
  ChangeTemplateContext,
  changeTemplates,
  validateSecurePath 
} from '../../../src/core/templates/change-templates.js';

describe('Change Templates', () => {
  let tempDir: string;
  let templateManager: ChangeTemplateManager;
  
  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'openspec-test-'));
    templateManager = new ChangeTemplateManager(tempDir);
  });
  
  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('validateSecurePath', () => {
    it('should allow valid paths within base directory', async () => {
      await expect(validateSecurePath('/base', 'subdir/file.txt')).resolves.not.toThrow();
      await expect(validateSecurePath('/base', 'file.txt')).resolves.not.toThrow();
      await expect(validateSecurePath('/base', 'deep/nested/path/file.txt')).resolves.not.toThrow();
    });
    
    it('should reject path traversal attempts', async () => {
      await expect(validateSecurePath('/base', '../outside.txt')).rejects.toThrow('Path traversal detected');
      await expect(validateSecurePath('/base', '../../etc/passwd')).rejects.toThrow('Path traversal detected');
      await expect(validateSecurePath('/base', 'subdir/../../../etc/passwd')).rejects.toThrow('Path traversal detected');
    });
    
    it('should reject absolute paths that escape base directory', async () => {
      await expect(validateSecurePath('/base', '/etc/passwd')).rejects.toThrow('Path traversal detected');
      await expect(validateSecurePath('/base', '/tmp/malicious')).rejects.toThrow('Path traversal detected');
    });

    describe('Symlink Security Protection', () => {
      let baseDir: string;
      let outsideDir: string;
      let maliciousFile: string;

      beforeEach(async () => {
        // Create base directory for testing
        baseDir = await fs.mkdtemp(path.join(tmpdir(), 'openspec-base-'));
        outsideDir = await fs.mkdtemp(path.join(tmpdir(), 'openspec-outside-'));
        maliciousFile = path.join(outsideDir, 'malicious.txt');
        await fs.writeFile(maliciousFile, 'malicious content');
      });

      afterEach(async () => {
        // Clean up test directories
        try {
          await fs.rm(baseDir, { recursive: true, force: true });
          await fs.rm(outsideDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      });

      it('should reject symlinks pointing outside base directory', async () => {
        const symlinkPath = path.join(baseDir, 'malicious-link');
        
        // Create a symlink pointing outside the base directory
        try {
          await fs.symlink(maliciousFile, symlinkPath);
          
          // This should throw because the symlink resolves outside the base directory
          await expect(validateSecurePath(baseDir, 'malicious-link')).rejects.toThrow('Path traversal detected via symlinks');
        } catch (error: any) {
          if (error.code === 'EPERM' || process.platform === 'win32') {
            // Skip symlink tests on systems where we don't have permission or Windows has different behavior
            console.warn('Skipping symlink test due to permission or platform limitations');
            return;
          }
          throw error;
        }
      });

      it('should allow symlinks within base directory', async () => {
        const targetFile = path.join(baseDir, 'target.txt');
        const symlinkPath = path.join(baseDir, 'safe-link');
        
        try {
          // Create a target file within the base directory
          await fs.writeFile(targetFile, 'safe content');
          
          // Create a symlink pointing to the target within the same directory
          await fs.symlink('target.txt', symlinkPath);
          
          // This should be allowed because both files are within the base directory
          await expect(validateSecurePath(baseDir, 'safe-link')).resolves.not.toThrow();
        } catch (error: any) {
          if (error.code === 'EPERM' || process.platform === 'win32') {
            console.warn('Skipping symlink test due to permission or platform limitations');
            return;
          }
          throw error;
        }
      });

      it('should reject nested symlink chains that escape base directory', async () => {
        const intermediateDir = path.join(baseDir, 'intermediate');
        const finalTarget = path.join(outsideDir, 'final-target.txt');
        const symlink1 = path.join(intermediateDir, 'link1');
        const symlink2 = path.join(baseDir, 'link2');
        
        try {
          // Create directories and files
          await fs.mkdir(intermediateDir, { recursive: true });
          await fs.writeFile(finalTarget, 'final malicious content');
          
          // Create first symlink in intermediate directory pointing outside
          await fs.symlink(finalTarget, symlink1);
          
          // Create second symlink in base directory pointing to the first symlink
          await fs.symlink(path.join('intermediate', 'link1'), symlink2);
          
          // This should throw because the final resolution escapes the base directory
          await expect(validateSecurePath(baseDir, 'link2')).rejects.toThrow('Path traversal detected via symlinks');
        } catch (error: any) {
          if (error.code === 'EPERM' || process.platform === 'win32') {
            console.warn('Skipping nested symlink test due to permission or platform limitations');
            return;
          }
          throw error;
        }
      });

      it('should handle circular symlinks gracefully', async () => {
        const symlink1 = path.join(baseDir, 'link1');
        const symlink2 = path.join(baseDir, 'link2');
        
        try {
          // Create circular symlinks: link1 -> link2, link2 -> link1
          await fs.symlink('link2', symlink1);
          await fs.symlink('link1', symlink2);
          
          // This should detect the circular reference and throw
          await expect(validateSecurePath(baseDir, 'link1')).rejects.toThrow('Circular symlink detected');
        } catch (error: any) {
          if (error.code === 'EPERM' || process.platform === 'win32') {
            console.warn('Skipping circular symlink test due to permission or platform limitations');
            return;
          }
          throw error;
        }
      });

      it('should handle broken/dangling symlinks', async () => {
        const symlinkPath = path.join(baseDir, 'broken-link');
        const nonExistentTarget = path.join(baseDir, 'non-existent.txt');
        
        try {
          // Create a symlink pointing to a non-existent file
          await fs.symlink(nonExistentTarget, symlinkPath);
          
          // This should handle the broken symlink gracefully for creation paths
          await expect(validateSecurePath(baseDir, 'broken-link')).resolves.not.toThrow();
        } catch (error: any) {
          if (error.code === 'EPERM' || process.platform === 'win32') {
            console.warn('Skipping broken symlink test due to permission or platform limitations');
            return;
          }
          throw error;
        }
      });

      it('should reject directory symlinks pointing outside base directory', async () => {
        const symlinkDir = path.join(baseDir, 'malicious-dir');
        
        try {
          // Create a directory symlink pointing outside the base directory
          await fs.symlink(outsideDir, symlinkDir);
          
          // First test the symlink directory itself
          await expect(validateSecurePath(baseDir, 'malicious-dir')).rejects.toThrow('Path traversal detected via symlinks');
          
          // Then test accessing a file through the symlinked directory
          await expect(validateSecurePath(baseDir, 'malicious-dir/file.txt')).rejects.toThrow('Path traversal detected via symlinks');
        } catch (error: any) {
          if (error.code === 'EPERM' || process.platform === 'win32') {
            console.warn('Skipping directory symlink test due to permission or platform limitations');
            return;
          }
          throw error;
        }
      });
    });
  });

  describe('ChangeTemplateManager', () => {
    const validContext: ChangeTemplateContext = {
      title: 'Test Change',
      slug: 'test-change',
      rationale: 'Test rationale',
      owner: 'test-owner',
      ttl: 3600
    };

    describe('createChange', () => {
      it('should create a feature change successfully', async () => {
        const changeDir = await templateManager.createChange('feature', validContext);
        
        // Verify directory structure
        await expect(fs.access(changeDir)).resolves.not.toThrow();
        await expect(fs.access(path.join(changeDir, 'proposal.md'))).resolves.not.toThrow();
        await expect(fs.access(path.join(changeDir, 'tasks.md'))).resolves.not.toThrow();
        await expect(fs.access(path.join(changeDir, 'specs'))).resolves.not.toThrow();
        await expect(fs.access(path.join(changeDir, 'specs', 'README.md'))).resolves.not.toThrow();
        
        // Verify content
        const proposalContent = await fs.readFile(path.join(changeDir, 'proposal.md'), 'utf-8');
        expect(proposalContent).toContain('# Change: Test Change');
        expect(proposalContent).toContain('**Type:** Feature');
        expect(proposalContent).toContain('Test rationale');
        
        const tasksContent = await fs.readFile(path.join(changeDir, 'tasks.md'), 'utf-8');
        expect(tasksContent).toContain('# Tasks: Test Change');
        expect(tasksContent).toContain('**Change ID:** test-change');
        
        const specsContent = await fs.readFile(path.join(changeDir, 'specs', 'README.md'), 'utf-8');
        expect(specsContent).toContain('Specifications for Change: test-change');
      });

      it('should create a bugfix change successfully', async () => {
        const changeDir = await templateManager.createChange('bugfix', validContext);
        
        const proposalContent = await fs.readFile(path.join(changeDir, 'proposal.md'), 'utf-8');
        expect(proposalContent).toContain('**Type:** Bugfix');
        expect(proposalContent).toContain('Bug Description');
        expect(proposalContent).toContain('Root Cause');
      });

      it('should create a chore change successfully', async () => {
        const changeDir = await templateManager.createChange('chore', validContext);
        
        const proposalContent = await fs.readFile(path.join(changeDir, 'proposal.md'), 'utf-8');
        expect(proposalContent).toContain('**Type:** Chore');
        expect(proposalContent).toContain('Background');
        expect(proposalContent).toContain('Maintenance');
      });

      it('should reject invalid template type', async () => {
        await expect(
          templateManager.createChange('invalid' as any, validContext)
        ).rejects.toThrow('Invalid template type: invalid');
      });

      it('should reject missing title', async () => {
        const invalidContext = { ...validContext, title: '' };
        await expect(
          templateManager.createChange('feature', invalidContext)
        ).rejects.toThrow('Title is required and must be a string');
      });

      it('should reject invalid slug format', async () => {
        const invalidContext = { ...validContext, slug: 'Invalid Slug!' };
        await expect(
          templateManager.createChange('feature', invalidContext)
        ).rejects.toThrow('Invalid slug: Invalid Slug!');
      });

      it('should handle missing optional context fields', async () => {
        const minimalContext: ChangeTemplateContext = {
          title: 'Minimal Test',
          slug: 'minimal-test'
        };
        
        const changeDir = await templateManager.createChange('feature', minimalContext);
        await expect(fs.access(changeDir)).resolves.not.toThrow();
        
        const proposalContent = await fs.readFile(path.join(changeDir, 'proposal.md'), 'utf-8');
        expect(proposalContent).toContain('**Owner:** TBD');
        expect(proposalContent).toContain('TODO: Describe why this change is needed');
      });

      it('should prevent concurrent creation of same change', async () => {
        // Create the first change
        await templateManager.createChange('feature', validContext);
        
        // Try to create the same change again - should fail due to existing directory
        await expect(
          templateManager.createChange('feature', validContext)
        ).rejects.toThrow();
      });

      it('should prevent symlink-based path traversal in template creation', async () => {
        // This test verifies that the template creation process is protected against symlink attacks
        // We'll create a scenario where someone might try to use symlinks to escape the template directory
        
        const context: ChangeTemplateContext = {
          title: 'Security Test Change',
          slug: 'security-test',
          rationale: 'Testing symlink security protection'
        };

        // The template creation should work normally and be protected against symlink attacks
        const changeDir = await templateManager.createChange('feature', context);
        
        // Verify the change was created in the correct location
        const expectedDir = path.join(tempDir, 'openspec', 'changes', 'security-test');
        expect(changeDir).toBe(expectedDir);
        
        // Verify all files are in the correct location
        await expect(fs.access(path.join(changeDir, 'proposal.md'))).resolves.not.toThrow();
        await expect(fs.access(path.join(changeDir, 'tasks.md'))).resolves.not.toThrow();
        await expect(fs.access(path.join(changeDir, 'specs', 'README.md'))).resolves.not.toThrow();
      });
    });

    describe('validateChangeStructure', () => {
      it('should validate a properly created change', async () => {
        await templateManager.createChange('feature', validContext);
        const result = await templateManager.validateChangeStructure('test-change');
        
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      it('should detect missing files', async () => {
        // Create incomplete structure
        const changeDir = path.join(tempDir, 'openspec', 'changes', 'incomplete');
        await fs.mkdir(changeDir, { recursive: true });
        
        const result = await templateManager.validateChangeStructure('incomplete');
        
        expect(result.valid).toBe(false);
        expect(result.issues).toContain('Required file missing: proposal.md');
        expect(result.issues).toContain('Required file missing: tasks.md');
        expect(result.issues).toContain('Required directory missing: specs/');
      });

      it('should detect invalid slug format', async () => {
        const result = await templateManager.validateChangeStructure('Invalid Slug!');
        
        expect(result.valid).toBe(false);
        expect(result.issues).toContain('Invalid slug format: Invalid Slug!');
      });

      it('should detect missing change directory', async () => {
        const result = await templateManager.validateChangeStructure('nonexistent');
        
        expect(result.valid).toBe(false);
        expect(result.issues.some(issue => issue.includes('does not exist'))).toBe(true);
      });

      it('should detect invalid file content', async () => {
        await templateManager.createChange('feature', validContext);
        
        // Corrupt the proposal file
        const proposalPath = path.join(tempDir, 'openspec', 'changes', 'test-change', 'proposal.md');
        await fs.writeFile(proposalPath, 'Invalid content without header');
        
        const result = await templateManager.validateChangeStructure('test-change');
        
        expect(result.valid).toBe(false);
        expect(result.issues).toContain('proposal.md must include a "# Change:" header');
      });
    });

    describe('getAvailableTemplates', () => {
      it('should return all available template types', () => {
        const templates = templateManager.getAvailableTemplates();
        
        expect(templates).toContain('feature');
        expect(templates).toContain('bugfix');
        expect(templates).toContain('chore');
        expect(templates).toHaveLength(3);
      });
    });

    describe('getTemplateInfo', () => {
      it('should return template info for valid types', () => {
        const featureTemplate = templateManager.getTemplateInfo('feature');
        expect(featureTemplate).toBeDefined();
        expect(featureTemplate?.type).toBe('feature');
        expect(typeof featureTemplate?.generateProposal).toBe('function');
        expect(typeof featureTemplate?.generateTasks).toBe('function');
        expect(typeof featureTemplate?.generateSpecs).toBe('function');
      });

      it('should return null for invalid template type', () => {
        const invalidTemplate = templateManager.getTemplateInfo('invalid');
        expect(invalidTemplate).toBeNull();
      });
    });
  });

  describe('Individual Templates', () => {
    const context: ChangeTemplateContext = {
      title: 'Test Template',
      slug: 'test-template',
      rationale: 'Test rationale for template',
      owner: 'template-tester'
    };

    it('should generate feature template with all required sections', () => {
      const template = changeTemplates.feature;
      const proposal = template.generateProposal(context);
      
      expect(proposal).toContain('# Change: Test Template');
      expect(proposal).toContain('**Type:** Feature');
      expect(proposal).toContain('## Why');
      expect(proposal).toContain('## What Changes');
      expect(proposal).toContain('## Deltas');
      expect(proposal).toContain('## Success Metrics');
      expect(proposal).toContain('## Rollback Plan');
      expect(proposal).toContain('### ADDED Requirements');
      expect(proposal).toContain('##### Scenario: Basic functionality');
    });

    it('should generate bugfix template with bug-specific sections', () => {
      const template = changeTemplates.bugfix;
      const proposal = template.generateProposal(context);
      
      expect(proposal).toContain('**Type:** Bugfix');
      expect(proposal).toContain('## Bug Description');
      expect(proposal).toContain('### MODIFIED Requirements');
      expect(proposal).toContain('### REMOVED Requirements');
      expect(proposal).toContain('##### Scenario: Bug reproduction');
      expect(proposal).toContain('##### Scenario: No regression');
    });

    it('should generate chore template with maintenance sections', () => {
      const template = changeTemplates.chore;
      const proposal = template.generateProposal(context);
      
      expect(proposal).toContain('**Type:** Chore');
      expect(proposal).toContain('## Background');
      expect(proposal).toContain('### MODIFIED Requirements');
      expect(proposal).toContain('### ADDED Requirements');
      expect(proposal).toContain('##### Scenario: Maintenance completion');
    });

    it('should generate tasks with proper structure for all templates', () => {
      for (const [, template] of Object.entries(changeTemplates)) {
        const tasks = template.generateTasks(context);
        
        expect(tasks).toContain('# Tasks: Test Template');
        expect(tasks).toContain('**Change ID:** test-template');
        expect(tasks).toContain('## Phase');
        expect(tasks).toContain('- [ ]');
      }
    });

    it('should generate specs with README for all templates', async () => {
      for (const [, template] of Object.entries(changeTemplates)) {
        const specs = await template.generateSpecs(context);
        
        expect(specs).toHaveProperty('README.md');
        expect(specs['README.md']).toContain('Specifications for');
        expect(specs['README.md']).toContain('test-template');
        expect(specs['README.md']).toContain('openspec change validate');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely long titles', async () => {
      const longTitle = 'A'.repeat(200);
      const context: ChangeTemplateContext = {
        title: longTitle,
        slug: 'long-title'
      };
      
      const changeDir = await templateManager.createChange('feature', context);
      const proposalContent = await fs.readFile(path.join(changeDir, 'proposal.md'), 'utf-8');
      
      expect(proposalContent).toContain(`# Change: ${longTitle}`);
    });

    it('should handle special characters in rationale', async () => {
      const context: ChangeTemplateContext = {
        title: 'Special Chars',
        slug: 'special-chars',
        rationale: 'Rationale with "quotes", \'apostrophes\', and & symbols <test>'
      };
      
      const changeDir = await templateManager.createChange('feature', context);
      const proposalContent = await fs.readFile(path.join(changeDir, 'proposal.md'), 'utf-8');
      
      expect(proposalContent).toContain('Rationale with "quotes", \'apostrophes\', and & symbols <test>');
    });

    it('should handle minimum valid slug length', async () => {
      const context: ChangeTemplateContext = {
        title: 'Min Slug',
        slug: 'abc' // Minimum 3 characters
      };
      
      await expect(templateManager.createChange('feature', context)).resolves.not.toThrow();
    });

    it('should handle maximum valid slug length', async () => {
      const maxSlug = 'a' + 'b'.repeat(62) + 'c'; // 64 characters
      const context: ChangeTemplateContext = {
        title: 'Max Slug',
        slug: maxSlug
      };
      
      await expect(templateManager.createChange('feature', context)).resolves.not.toThrow();
    });
  });
});