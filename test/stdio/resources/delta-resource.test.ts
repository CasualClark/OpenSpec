/**
 * Tests for DeltaResourceProvider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeltaResourceProvider } from '../../../src/stdio/resources/delta-resource.js';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('DeltaResourceProvider', () => {
  let provider: DeltaResourceProvider;
  let security: any;
  let testDir: string;
  let changesDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-tmp', 'delta-resource-test');
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
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('read - all deltas', () => {
    beforeEach(() => {
      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change');
    });

    it('should return empty list when no deltas directory exists', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.deltas).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.slug).toBe('test-change');
    });

    it('should list all deltas for a change', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      // Create test deltas
      const gitDiff = `diff --git a/src/file1.ts b/src/file1.ts
index 1234567..abcdefg 100644
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,3 +1,4 @@
 export function test() {
+  console.log('added');
   return true;
 }
@@ -5,6 +6,7 @@ export function test() {
 export function oldFunc() {
-  return false;
+  return true;
 }
`;

      const unifiedDiff = `--- a/src/file2.ts
+++ b/src/file2.ts
@@ -1,5 +1,5 @@
 interface Test {
-  oldProp: string;
+  newProp: string;
   value: number;
 }
`;

      await fs.writeFile(path.join(deltasDir, 'delta-1.diff'), gitDiff);
      await fs.writeFile(path.join(deltasDir, 'delta-2.diff'), unifiedDiff);

      // Create a non-diff file that should be ignored
      await fs.writeFile(path.join(deltasDir, 'readme.txt'), 'This should be ignored');

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.deltas).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.slug).toBe('test-change');

      // Check delta 1 (git diff)
      const delta1 = data.deltas.find((d: any) => d.metadata.deltaId === 'delta-1');
      expect(delta1.metadata.type).toBe('git');
      expect(delta1.metadata.additions).toBe(2);
      expect(delta1.metadata.deletions).toBe(2);
      expect(delta1.metadata.files).toEqual(['src/file1.ts']);
      expect(delta1.metadata.lines).toBeGreaterThan(0);

      // Check delta 2 (unified diff)
      const delta2 = data.deltas.find((d: any) => d.metadata.deltaId === 'delta-2');
      expect(delta2.metadata.type).toBe('unified');
      expect(delta2.metadata.additions).toBe(1);
      expect(delta2.metadata.deletions).toBe(1);
      expect(delta2.metadata.files).toEqual(['src/file2.ts']);
    });

    it('should handle delta files with different formats', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      // Context diff format
      const contextDiff = `*** src/file3.ts	2023-01-01 10:00:00
--- src/file3.ts	2023-01-01 11:00:00
***************
*** 1,5 ****
  const old = 'value';
- const removed = true;
  const keep = 'stay';
--- 1,5 ----
  const old = 'value';
+ const added = true;
  const keep = 'stay';
`;

      await fs.writeFile(path.join(deltasDir, 'context-delta.diff'), contextDiff);

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      const contextDelta = data.deltas.find((d: any) => d.metadata.deltaId === 'context-delta');
      expect(contextDelta.metadata.type).toBe('context');
    });

    it('should handle unknown delta formats', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      // Unknown format
      const unknownDiff = `This is not a standard diff format
Just some plain text
With no diff markers`;

      await fs.writeFile(path.join(deltasDir, 'unknown.diff'), unknownDiff);

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      const unknownDelta = data.deltas.find((d: any) => d.metadata.deltaId === 'unknown');
      expect(unknownDelta.metadata.type).toBe('unknown');
    });
  });

  describe('read - specific delta', () => {
    beforeEach(() => {
      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change/delta-1');
    });

    it('should read specific delta content with metadata', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      const deltaContent = `diff --git a/src/test.ts b/src/test.ts
index abc123..def456 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
 export class Test {
+  newMethod(): void {
     constructor() {
       this.value = 0;
     }
@@ -5,7 +6,8 @@ export class Test {
-  oldMethod(): string {
-    return 'old';
+  newMethod(): void {
+    console.log('new method');
   }
 }
`;

      await fs.writeFile(path.join(deltasDir, 'delta-1.diff'), deltaContent);

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.deltaId).toBe('delta-1');
      expect(data.slug).toBe('test-change');
      expect(data.content).toBe(deltaContent);
      expect(data.metadata.type).toBe('git');
      expect(data.metadata.additions).toBe(4);
      expect(data.metadata.deletions).toBe(3);
      expect(data.metadata.files).toEqual(['src/test.ts']);
      expect(data.metadata.created).toBeDefined();
      expect(data.metadata.modified).toBeDefined();
      expect(data.metadata.size).toBeGreaterThan(0);
      expect(data.metadata.lines).toBeGreaterThan(0);
    });

    it('should throw error when specific delta does not exist', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      await expect(provider.read()).rejects.toThrow('Delta not found: delta-1 in change test-change');
    });
  });

  describe('exists', () => {
    it('should return true when deltas directory exists', async () => {
      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change');
      
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      const exists = await provider.exists();
      expect(exists).toBe(true);
    });

    it('should return false when deltas directory does not exist', async () => {
      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change');
      
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const exists = await provider.exists();
      expect(exists).toBe(false);
    });

    it('should return true when specific delta exists', async () => {
      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change/delta-1');
      
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      await fs.writeFile(path.join(deltasDir, 'delta-1.diff'), 'test diff content');

      const exists = await provider.exists();
      expect(exists).toBe(true);
    });

    it('should return false for invalid slug format', async () => {
      const invalidProvider = new DeltaResourceProvider(security, console.log, 'delta://Invalid-Slug');
      
      const exists = await invalidProvider.exists();
      expect(exists).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for deltas collection', async () => {
      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change');
      
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      // Create some deltas
      await fs.writeFile(path.join(deltasDir, 'delta-1.diff'), 'diff content 1');
      await fs.writeFile(path.join(deltasDir, 'delta-2.diff'), 'diff content 2');

      const metadata = await provider.getMetadata();

      expect(metadata.slug).toBe('test-change');
      expect(metadata.type).toBe('deltas-collection');
      expect(metadata.exists).toBe(true);
      expect(metadata.deltaCount).toBe(2);
      expect(metadata.path).toContain('deltas');
    });

    it('should return metadata for specific delta', async () => {
      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change/delta-1');
      
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      const deltaContent = `diff --git a/test.js b/test.js
--- a/test.js
+++ b/test.js
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
-const z = 3;
`;

      await fs.writeFile(path.join(deltasDir, 'delta-1.diff'), deltaContent);

      const metadata = await provider.getMetadata();

      expect(metadata.slug).toBe('test-change');
      expect(metadata.deltaId).toBe('delta-1');
      expect(metadata.type).toBe('delta');
      expect(metadata.exists).toBe(true);
      expect(metadata.deltaType).toBe('git');
      expect(metadata.additions).toBe(1);
      expect(metadata.deletions).toBe(1);
      expect(metadata.files).toEqual(['test.js']);
      expect(metadata.created).toBeDefined();
      expect(metadata.modified).toBeDefined();
    });

    it('should handle missing deltas directory', async () => {
      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change');
      
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const metadata = await provider.getMetadata();

      expect(metadata.slug).toBe('test-change');
      expect(metadata.type).toBe('deltas-collection');
      expect(metadata.exists).toBe(false);
    });

    it('should handle invalid slug format', async () => {
      const invalidProvider = new DeltaResourceProvider(security, console.log, 'delta://Invalid-Slug');
      
      const metadata = await invalidProvider.getMetadata();

      expect(metadata.slug).toBe('Invalid-Slug');
      expect(metadata.type).toBe('deltas');
      expect(metadata.exists).toBe(false);
      expect(metadata.error).toBe('Invalid slug format');
    });
  });

  describe('file extraction', () => {
    it('should extract files from git diff format', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      const gitDiff = `diff --git a/src/file1.ts b/src/file1.ts
diff --git a/lib/file2.js b/lib/file2.js
index abc123..def456 100644
--- a/lib/file2.js
+++ b/lib/file2.js
`;

      await fs.writeFile(path.join(deltasDir, 'multi-file.diff'), gitDiff);

      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change/multi-file');
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.metadata.files).toEqual(['src/file1.ts', 'lib/file2.js']);
    });

    it('should extract files from unified diff format', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const deltasDir = path.join(changeDir, 'deltas');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(deltasDir, { recursive: true });

      const unifiedDiff = `--- a/src/component.tsx
+++ b/src/component.tsx
--- a/styles/main.css
+++ b/styles/main.css
`;

      await fs.writeFile(path.join(deltasDir, 'unified.diff'), unifiedDiff);

      provider = new DeltaResourceProvider(security, console.log, 'delta://test-change/unified');
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.metadata.files).toEqual(['src/component.tsx', 'styles/main.css']);
    });
  });

  describe('URI parameter extraction', () => {
    it('should extract slug and deltaId correctly', async () => {
      // Test collection URI
      const collectionProvider = new DeltaResourceProvider(security, console.log, 'delta://my-change');
      
      const changeDir = path.join(changesDir, 'my-change');
      await fs.mkdir(changeDir, { recursive: true });

      const exists = await collectionProvider.exists();
      expect(exists).toBe(false); // No deltas directory yet

      // Test specific delta URI
      const deltaProvider = new DeltaResourceProvider(security, console.log, 'delta://my-change/specific-delta');
      
      const exists2 = await deltaProvider.exists();
      expect(exists2).toBe(false); // No deltas directory yet
    });

    it('should handle malformed URIs gracefully', async () => {
      const malformedProvider = new DeltaResourceProvider(security, console.log, 'not-a-valid-uri');
      
      await expect(malformedProvider.read()).rejects.toThrow('Invalid delta URI: missing slug');
    });
  });
});