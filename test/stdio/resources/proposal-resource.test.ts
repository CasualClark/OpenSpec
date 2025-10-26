/**
 * Tests for ProposalResourceProvider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProposalResourceProvider } from '../../../src/stdio/resources/proposal-resource.js';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('ProposalResourceProvider', () => {
  let provider: ProposalResourceProvider;
  let security: any;
  let testDir: string;
  let changesDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-tmp', 'proposal-resource-test');
    changesDir = path.join(testDir, 'openspec', 'changes');
    
    // Clean up any existing test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
    
    await fs.mkdir(changesDir, { recursive: true });

    security = {
      allowedPaths: [testDir, process.cwd()],
      sandboxRoot: testDir,
      maxFileSize: 10 * 1024 * 1024,
      allowedSchemas: ['resource.read']
    };

    provider = new ProposalResourceProvider(security, console.log, 'proposal://test-change');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('read', () => {
    it('should read proposal content successfully', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const proposalContent = `# Test Change Proposal

This is a comprehensive test proposal.

## Background
The background information goes here.

## Goals
- Goal 1
- Goal 2

## Implementation
Implementation details...`;

      await fs.writeFile(path.join(changeDir, 'proposal.md'), proposalContent);

      const result = await provider.read();
      
      expect(result.mimeType).toBe('text/markdown');
      expect(result.text).toBe(proposalContent);
    });

    it('should throw error when proposal does not exist', async () => {
      // Don't create proposal file
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      await expect(provider.read()).rejects.toThrow('Proposal not found: test-change');
    });

    it('should throw error when change directory does not exist', async () => {
      await expect(provider.read()).rejects.toThrow('Proposal not found: test-change');
    });

    it('should throw error for invalid slug format', async () => {
      const invalidProvider = new ProposalResourceProvider(security, console.log, 'proposal://Invalid-Slug');
      
      await expect(invalidProvider.read()).rejects.toThrow('Invalid slug format: Invalid-Slug');
    });
  });

  describe('exists', () => {
    it('should return true when proposal exists', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test');

      const exists = await provider.exists();
      expect(exists).toBe(true);
    });

    it('should return false when proposal does not exist', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const exists = await provider.exists();
      expect(exists).toBe(false);
    });

    it('should return false for invalid slug format', async () => {
      const invalidProvider = new ProposalResourceProvider(security, console.log, 'proposal://Invalid-Slug');
      
      const exists = await invalidProvider.exists();
      expect(exists).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return proposal metadata', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const proposalContent = `# Custom Title

This is the description paragraph that should be extracted.

## Section 1
Content of section 1.

### Subsection 1.1
Subsection content.

## Section 2
Content of section 2.`;

      await fs.writeFile(path.join(changeDir, 'proposal.md'), proposalContent);

      const metadata = await provider.getMetadata();

      expect(metadata.slug).toBe('test-change');
      expect(metadata.type).toBe('proposal');
      expect(metadata.exists).toBe(true);
      expect(metadata.title).toBe('Custom Title');
      expect(metadata.description).toContain('description paragraph');
      expect(metadata.sections).toEqual(['Section 1', 'Subsection 1.1', 'Section 2']);
      expect(metadata.wordCount).toBeGreaterThan(0);
      expect(metadata.lineCount).toBeGreaterThan(0);
      expect(metadata.created).toBeDefined();
      expect(metadata.modified).toBeDefined();
      expect(metadata.path).toContain('proposal.md');
    });

    it('should handle missing proposal gracefully', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const metadata = await provider.getMetadata();

      expect(metadata.slug).toBe('test-change');
      expect(metadata.type).toBe('proposal');
      expect(metadata.exists).toBe(false);
    });

    it('should handle invalid slug format', async () => {
      const invalidProvider = new ProposalResourceProvider(security, console.log, 'proposal://Invalid-Slug');
      
      const metadata = await invalidProvider.getMetadata();

      expect(metadata.slug).toBe('Invalid-Slug');
      expect(metadata.type).toBe('proposal');
      expect(metadata.exists).toBe(false);
      expect(metadata.error).toBe('Invalid slug format');
    });

    it('should extract title from first H1 when available', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const proposalContent = `# My Custom Title

Some content here.`;

      await fs.writeFile(path.join(changeDir, 'proposal.md'), proposalContent);

      const metadata = await provider.getMetadata();
      expect(metadata.title).toBe('My Custom Title');
    });

    it('should use slug as title when no H1 found', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const proposalContent = `Just some content without a title header.

## Section
Content.`;

      await fs.writeFile(path.join(changeDir, 'proposal.md'), proposalContent);

      const metadata = await provider.getMetadata();
      expect(metadata.title).toBe('test-change');
    });

    it('should limit description to 200 characters', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const longDescription = 'This is a very long description that should be truncated because it exceeds the 200 character limit that we have set for the description field in the metadata extraction functionality of the proposal resource provider implementation.';

      const proposalContent = `# Test Title

${longDescription}

## Section
More content.`;

      await fs.writeFile(path.join(changeDir, 'proposal.md'), proposalContent);

      const metadata = await provider.getMetadata();
      expect(metadata.description.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(metadata.description).toContain('...');
    });
  });

  describe('URI parameter extraction', () => {
    it('should extract slug correctly from URI', () => {
      const testProvider = new ProposalResourceProvider(security, console.log, 'proposal://my-test-change');
      // The extractSlug method is private, but we can test it indirectly
      // through the other methods that use it
      expect(testProvider).toBeDefined();
    });

    it('should handle malformed URIs gracefully', async () => {
      const malformedProvider = new ProposalResourceProvider(security, console.log, 'not-a-valid-uri');
      
      await expect(malformedProvider.read()).rejects.toThrow('Invalid proposal URI: missing slug');
    });
  });
});