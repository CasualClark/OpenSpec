# Phase 3: Resources & IDE UX - Implementation Plan

**Status:** READY FOR EXECUTION  
**Duration:** 2-3 weeks  
**Priority:** HIGH  
**Dependencies:** Phase 2 (Receipts & Validation) ✅ COMPLETE

---

## 📋 Executive Summary

Phase 3 completes the core MCP user experience by implementing efficient pagination for change listings and memory-efficient streaming for large resources. This phase ensures the Task MCP server performs well with large repositories and provides a smooth IDE integration experience.

### Key Deliverables
1. **Paginated Change Listings** - `changes://active` with cursor-based pagination
2. **Streaming Resource Readers** - Memory-efficient handling of large files
3. **IDE Integration Guide** - Documentation for resource attachment patterns
4. **Performance Validation** - <500MB memory usage, <120ms pagination response

---

## 🎯 Goals & Success Criteria

### Primary Goals
- ✅ Implement stable, efficient pagination for change listings
- ✅ Eliminate memory bloat when reading large files
- ✅ Document IDE resource attachment patterns
- ✅ Validate performance under realistic workloads

### Success Metrics
| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Pagination Response Time | <120ms | Benchmark with 1000+ changes |
| Memory Usage (Streaming) | <500MB | Profile with 100MB+ files |
| Test Coverage | >90% | Jest/pytest coverage report |
| IDE Resource Attach | 100% success | Manual testing in Claude Desktop |

---

## 🏗️ Architecture Overview

### Current State (Phase 2)
```
Task MCP Server (stdio)
├── Tools
│   ├── change.open    ✅
│   └── change.archive ✅
└── Resources
    ├── changes://all/         ⚠️ No pagination
    ├── changes://active/      ⚠️ No pagination
    ├── change://[slug]        ✅
    └── change://[slug]/files  ⚠️ Memory inefficient
```

### Target State (Phase 3)
```
Task MCP Server (stdio)
├── Tools
│   ├── change.open    ✅
│   └── change.archive ✅
└── Resources
    ├── changes://active?page=1&pageSize=50  ✅ Paginated
    ├── changes://active?nextPageToken=...   ✅ Cursor-based
    ├── change://[slug]                      ✅
    ├── change://[slug]/proposal.md          ✅ Streaming
    ├── change://[slug]/tasks.md             ✅ Streaming
    └── change://[slug]/specs/*              ✅ Streaming
```

### Design Decisions

**Decision 1: Cursor-Based Pagination**
- **Choice:** Opaque token encoding `{page, timestamp, sort_key}`
- **Rationale:** Stable pagination even with concurrent changes
- **Alternative Rejected:** Offset-based (unstable with concurrent writes)

**Decision 2: Streaming Implementation**
- **Choice:** Node.js streams with 64KB chunks
- **Rationale:** Native platform support, memory-efficient
- **Alternative Rejected:** Read-all-then-send (memory bloat)

**Decision 3: Sort Strategy**
- **Choice:** mtime descending with slug tiebreaker
- **Rationale:** Most recent changes first, deterministic ordering
- **Alternative Rejected:** Alphabetical (poor UX)

---

## 💻 Pseudocode

### 1. Pagination Engine

```typescript
// Core pagination types
interface PageRequest {
  page?: number;           // 1-indexed page number
  pageSize?: number;       // Items per page (default: 50, max: 100)
  nextPageToken?: string;  // Opaque continuation token
}

interface PageResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  nextPageToken?: string;
  previousPageToken?: string;
  hasMore: boolean;
}

interface PageToken {
  page: number;
  timestamp: string;  // ISO8601
  sortKey: string;    // Last item's sort key
}

// Pagination implementation
class PaginationEngine {
  /**
   * Generate stable pagination for change listings
   * 
   * Algorithm:
   * 1. Scan openspec/changes directory
   * 2. Stat each change directory for mtime
   * 3. Sort by (mtime DESC, slug ASC) for stability
   * 4. Apply cursor-based slicing
   * 5. Generate next/previous tokens
   */
  async paginate(
    rootPath: string,
    request: PageRequest
  ): Promise<PageResponse<ChangeListItem>> {
    
    // Decode token or use page number
    const cursor = request.nextPageToken 
      ? this.decodeToken(request.nextPageToken)
      : { page: request.page || 1, timestamp: null, sortKey: null };
    
    const pageSize = Math.min(request.pageSize || 50, 100);
    
    // Scan and collect all changes with metadata
    const changesPath = path.join(rootPath, 'openspec/changes');
    const slugs = await fs.readdir(changesPath);
    
    const changes: ChangeWithMetadata[] = [];
    for (const slug of slugs) {
      const changePath = path.join(changesPath, slug);
      const stats = await fs.stat(changePath);
      
      // Skip if not a directory
      if (!stats.isDirectory()) continue;
      
      // Skip if locked (optional filter)
      const isLocked = await this.isLocked(changePath);
      
      changes.push({
        slug,
        mtime: stats.mtime,
        sortKey: `${stats.mtime.toISOString()}_${slug}`,
        isLocked,
        path: changePath
      });
    }
    
    // Stable sort: mtime DESC, then slug ASC
    changes.sort((a, b) => {
      if (a.mtime.getTime() !== b.mtime.getTime()) {
        return b.mtime.getTime() - a.mtime.getTime(); // DESC
      }
      return a.slug.localeCompare(b.slug); // ASC tiebreaker
    });
    
    // Apply cursor filtering if timestamp provided
    let filteredChanges = changes;
    if (cursor.timestamp && cursor.sortKey) {
      const cursorIndex = changes.findIndex(c => c.sortKey === cursor.sortKey);
      if (cursorIndex >= 0) {
        filteredChanges = changes.slice(cursorIndex + 1);
      }
    }
    
    // Calculate pagination slice
    const totalItems = filteredChanges.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (cursor.page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    const pageItems = filteredChanges.slice(startIndex, endIndex);
    
    // Generate tokens
    const hasMore = endIndex < totalItems;
    const hasPrevious = cursor.page > 1;
    
    const nextToken = hasMore ? this.encodeToken({
      page: cursor.page + 1,
      timestamp: new Date().toISOString(),
      sortKey: pageItems[pageItems.length - 1].sortKey
    }) : undefined;
    
    const previousToken = hasPrevious ? this.encodeToken({
      page: cursor.page - 1,
      timestamp: new Date().toISOString(),
      sortKey: pageItems[0].sortKey
    }) : undefined;
    
    // Transform to list items
    const items = await Promise.all(
      pageItems.map(c => this.toListItem(c))
    );
    
    return {
      items,
      page: cursor.page,
      pageSize,
      totalItems,
      totalPages,
      nextPageToken: nextToken,
      previousPageToken: previousToken,
      hasMore
    };
  }
  
  /**
   * Encode pagination token
   * Format: base64url(JSON({page, timestamp, sortKey}))
   */
  private encodeToken(token: PageToken): string {
    const json = JSON.stringify(token);
    return Buffer.from(json).toString('base64url');
  }
  
  /**
   * Decode pagination token
   * Returns null if invalid
   */
  private decodeToken(token: string): PageToken | null {
    try {
      const json = Buffer.from(token, 'base64url').toString('utf8');
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Check if change is locked
   */
  private async isLocked(changePath: string): Promise<boolean> {
    const lockPath = path.join(changePath, '.lock');
    try {
      const lockData = await fs.readFile(lockPath, 'utf8');
      const lock = JSON.parse(lockData);
      return Date.now() < new Date(lock.since).getTime() + lock.ttl * 1000;
    } catch {
      return false;
    }
  }
  
  /**
   * Transform change metadata to list item
   */
  private async toListItem(
    change: ChangeWithMetadata
  ): Promise<ChangeListItem> {
    // Read proposal title (first line after # heading)
    const proposalPath = path.join(change.path, 'proposal.md');
    let title = change.slug;
    try {
      const content = await fs.readFile(proposalPath, 'utf8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) title = titleMatch[1];
    } catch {
      // Use slug as fallback
    }
    
    return {
      slug: change.slug,
      title,
      mtime: change.mtime.toISOString(),
      isLocked: change.isLocked,
      uri: `change://${change.slug}`
    };
  }
}
```

### 2. Streaming Resource Reader

```typescript
// Streaming resource types
interface StreamOptions {
  chunkSize?: number;      // Default: 64KB
  encoding?: BufferEncoding; // Default: 'utf8'
  maxSize?: number;        // Fail-fast if file exceeds
}

/**
 * Memory-efficient streaming reader for large files
 * 
 * Strategy:
 * 1. Use Node.js ReadableStream
 * 2. Process in 64KB chunks
 * 3. Apply backpressure if consumer is slow
 * 4. Abort on size limit exceeded
 */
class StreamingResourceReader {
  private readonly DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  
  /**
   * Stream file contents to MCP client
   * Returns async generator for MCP streaming protocol
   */
  async *streamFile(
    filePath: string,
    options: StreamOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const chunkSize = options.chunkSize || this.DEFAULT_CHUNK_SIZE;
    const encoding = options.encoding || 'utf8';
    const maxSize = options.maxSize || this.MAX_FILE_SIZE;
    
    // Validate file exists and is within size limit
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }
    if (stats.size > maxSize) {
      throw new Error(
        `File too large: ${stats.size} bytes (max: ${maxSize})`
      );
    }
    
    // Create read stream
    const stream = fs.createReadStream(filePath, {
      encoding,
      highWaterMark: chunkSize
    });
    
    try {
      let bytesRead = 0;
      
      for await (const chunk of stream) {
        bytesRead += Buffer.byteLength(chunk, encoding);
        
        // Safety check (should not happen with stat check above)
        if (bytesRead > maxSize) {
          stream.destroy();
          throw new Error('File size limit exceeded during read');
        }
        
        yield chunk as string;
      }
    } catch (error) {
      stream.destroy();
      throw error;
    }
  }
  
  /**
   * Read file with automatic streaming decision
   * Small files (<1MB): read entire content
   * Large files (>=1MB): use streaming
   */
  async readResource(
    filePath: string,
    options: StreamOptions = {}
  ): Promise<string | AsyncGenerator<string>> {
    const stats = await fs.stat(filePath);
    const threshold = 1024 * 1024; // 1MB
    
    if (stats.size < threshold) {
      // Small file: read directly
      return fs.readFile(filePath, options.encoding || 'utf8');
    } else {
      // Large file: use streaming
      return this.streamFile(filePath, options);
    }
  }
}
```

### 3. Resource Provider Integration

```typescript
/**
 * Enhanced resource provider with pagination and streaming
 */
class TaskMCPResourceProvider {
  private paginationEngine: PaginationEngine;
  private streamingReader: StreamingResourceReader;
  
  constructor(private repoRoot: string) {
    this.paginationEngine = new PaginationEngine();
    this.streamingReader = new StreamingResourceReader();
  }
  
  /**
   * Handle resource read requests
   */
  async readResource(uri: string): Promise<ResourceResponse> {
    const parsed = this.parseURI(uri);
    
    switch (parsed.type) {
      case 'changes-active':
        return this.handleChangesActive(parsed.query);
      
      case 'change-file':
        return this.handleChangeFile(parsed.slug, parsed.filePath);
      
      case 'change-metadata':
        return this.handleChangeMetadata(parsed.slug);
      
      default:
        throw new Error(`Unknown resource type: ${parsed.type}`);
    }
  }
  
  /**
   * Handle changes://active with pagination
   */
  private async handleChangesActive(
    query: URLSearchParams
  ): Promise<ResourceResponse> {
    const pageRequest: PageRequest = {
      page: parseInt(query.get('page') || '1'),
      pageSize: parseInt(query.get('pageSize') || '50'),
      nextPageToken: query.get('nextPageToken') || undefined
    };
    
    const result = await this.paginationEngine.paginate(
      this.repoRoot,
      pageRequest
    );
    
    return {
      uri: 'changes://active',
      mimeType: 'application/json',
      contents: JSON.stringify(result, null, 2)
    };
  }
  
  /**
   * Handle change://[slug]/[file] with streaming
   */
  private async handleChangeFile(
    slug: string,
    filePath: string
  ): Promise<ResourceResponse> {
    const fullPath = path.join(
      this.repoRoot,
      'openspec/changes',
      slug,
      filePath
    );
    
    // Security: validate path is within change directory
    const canonicalPath = await fs.realpath(fullPath);
    const changeRoot = await fs.realpath(
      path.join(this.repoRoot, 'openspec/changes', slug)
    );
    
    if (!canonicalPath.startsWith(changeRoot)) {
      throw new Error('Path traversal attempt blocked');
    }
    
    // Use streaming reader
    const contents = await this.streamingReader.readResource(fullPath);
    
    // Determine MIME type
    const mimeType = this.getMimeType(filePath);
    
    if (typeof contents === 'string') {
      // Small file: return directly
      return {
        uri: `change://${slug}/${filePath}`,
        mimeType,
        contents
      };
    } else {
      // Large file: return streaming generator
      return {
        uri: `change://${slug}/${filePath}`,
        mimeType,
        contents: contents // AsyncGenerator
      };
    }
  }
  
  /**
   * Parse resource URI
   */
  private parseURI(uri: string): ParsedURI {
    const url = new URL(uri);
    
    if (uri.startsWith('changes://active')) {
      return {
        type: 'changes-active',
        query: url.searchParams
      };
    }
    
    if (uri.startsWith('change://')) {
      const parts = url.pathname.split('/').filter(Boolean);
      return {
        type: 'change-file',
        slug: parts[0],
        filePath: parts.slice(1).join('/')
      };
    }
    
    throw new Error(`Invalid URI format: ${uri}`);
  }
  
  /**
   * Determine MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
```

---

## 📦 Task Breakdown by Agent

### 🎼 Orchestrator Tasks

**TASK-ORCH-1: Phase Initialization**
- [ ] Review Phase 2 completion checklist
- [ ] Validate dependencies are met
- [ ] Create Phase 3 tracking board
- [ ] Assign initial tasks to agents
- **Duration:** 2 hours
- **Deliverable:** Task board with assignments

**TASK-ORCH-2: Daily Coordination**
- [ ] Daily standup with active agents
- [ ] Unblock dependencies
- [ ] Adjust task priorities based on progress
- [ ] Track metrics dashboard
- **Duration:** 30 min/day throughout phase
- **Deliverable:** Daily status updates

**TASK-ORCH-3: Integration Validation**
- [ ] Coordinate integration testing across agents
- [ ] Validate all components work together
- [ ] Sign off on phase completion
- **Duration:** 4 hours
- **Deliverable:** Integration validation report

---

### 🏛️ Architect Tasks

**TASK-ARCH-1: Pagination Strategy Design**
- [ ] Review cursor-based vs offset-based pagination
- [ ] Design token encoding scheme
- [ ] Define stability guarantees during concurrent access
- [ ] Document edge cases (empty list, single page, etc.)
- **Duration:** 4 hours
- **Deliverable:** Architecture decision record (ADR)

**TASK-ARCH-2: Streaming Architecture**
- [ ] Design chunk size strategy (64KB default)
- [ ] Define memory thresholds for streaming (1MB trigger)
- [ ] Plan backpressure handling
- [ ] Design error recovery for interrupted streams
- **Duration:** 3 hours
- **Deliverable:** Streaming architecture document

**TASK-ARCH-3: Performance Model**
- [ ] Define performance targets for each operation
- [ ] Design benchmarking strategy
- [ ] Identify bottlenecks and mitigation strategies
- [ ] Create performance regression tests
- **Duration:** 3 hours
- **Deliverable:** Performance requirements doc

---

### ⚙️ Engineer Tasks

**TASK-ENG-1: Pagination Engine Implementation**
- [ ] Implement `PaginationEngine` class
- [ ] Implement token encoding/decoding
- [ ] Implement stable sorting algorithm
- [ ] Add error handling for invalid tokens
- [ ] Write unit tests (>90% coverage)
- **Duration:** 8 hours
- **Deliverable:** `pagination_engine.py` or `.ts` with tests

**TASK-ENG-2: Streaming Reader Implementation**
- [ ] Implement `StreamingResourceReader` class
- [ ] Implement chunked reading with 64KB chunks
- [ ] Add size limit validation
- [ ] Implement encoding detection
- [ ] Write unit tests with mock files
- **Duration:** 6 hours
- **Deliverable:** `streaming_reader.py` or `.ts` with tests

**TASK-ENG-3: Resource Provider Updates**
- [ ] Integrate pagination engine into resource provider
- [ ] Integrate streaming reader into resource provider
- [ ] Update URI parsing logic
- [ ] Add query parameter validation
- [ ] Write integration tests
- **Duration:** 8 hours
- **Deliverable:** Updated resource provider with tests

**TASK-ENG-4: Performance Optimization**
- [ ] Profile pagination with 1000+ changes
- [ ] Profile streaming with 100MB+ files
- [ ] Optimize hot paths
- [ ] Implement caching where appropriate
- [ ] Benchmark against targets
- **Duration:** 6 hours
- **Deliverable:** Performance optimization report

---

### 🔍 Reviewer Tasks

**TASK-REV-1: Code Review - Pagination**
- [ ] Review pagination engine implementation
- [ ] Verify token security (no data leakage)
- [ ] Check for edge cases (empty lists, invalid tokens)
- [ ] Validate test coverage
- [ ] Approve or request changes
- **Duration:** 3 hours
- **Deliverable:** Code review report

**TASK-REV-2: Code Review - Streaming**
- [ ] Review streaming reader implementation
- [ ] Check for memory leaks
- [ ] Verify resource cleanup (stream closure)
- [ ] Validate backpressure handling
- [ ] Approve or request changes
- **Duration:** 3 hours
- **Deliverable:** Code review report

**TASK-REV-3: Security Audit**
- [ ] Audit path traversal protection
- [ ] Verify token encoding is secure
- [ ] Check for DoS vulnerabilities (large page sizes)
- [ ] Validate input sanitization
- [ ] Document security findings
- **Duration:** 4 hours
- **Deliverable:** Security audit report

**TASK-REV-4: Performance Review**
- [ ] Review benchmark results
- [ ] Validate against targets (<120ms pagination, <500MB streaming)
- [ ] Identify regression risks
- [ ] Approve performance characteristics
- **Duration:** 2 hours
- **Deliverable:** Performance sign-off

---

### 🧪 Reviewer Tasks (Testing Focus)

**TASK-REV-TEST-1: Test Plan Review**
- [ ] Review unit test coverage
- [ ] Verify integration test scenarios
- [ ] Check for negative test cases
- [ ] Validate performance tests
- **Duration:** 2 hours
- **Deliverable:** Test plan approval

**TASK-REV-TEST-2: Test Execution**
- [ ] Execute full test suite
- [ ] Verify all tests pass
- [ ] Check for flaky tests
- [ ] Document test results
- **Duration:** 3 hours
- **Deliverable:** Test execution report

---

### 📚 Knowledge Tasks

**TASK-KNOW-1: IDE Integration Guide**
- [ ] Research MCP resource attachment patterns
- [ ] Document Claude Desktop integration
- [ ] Create step-by-step setup guide
- [ ] Add troubleshooting section
- [ ] Include screenshots/examples
- **Duration:** 6 hours
- **Deliverable:** `docs/ide-integration.md`

**TASK-KNOW-2: API Documentation**
- [ ] Document pagination query parameters
- [ ] Document token format and behavior
- [ ] Document streaming resource URIs
- [ ] Add code examples for each endpoint
- [ ] Create API reference
- **Duration:** 5 hours
- **Deliverable:** `docs/api-reference.md`

**TASK-KNOW-3: Performance Tuning Guide**
- [ ] Document performance characteristics
- [ ] Provide tuning recommendations
- [ ] Explain when to use streaming vs direct read
- [ ] Add monitoring recommendations
- **Duration:** 3 hours
- **Deliverable:** `docs/performance-tuning.md`

**TASK-KNOW-4: Migration Guide**
- [ ] Document changes from Phase 2
- [ ] Provide migration steps for existing clients
- [ ] Highlight breaking changes
- [ ] Add migration examples
- **Duration:** 3 hours
- **Deliverable:** `docs/migration-phase2-to-phase3.md`

---

### 🏗️ Builder Tasks

**TASK-BUILD-1: Resource URI Schema**
- [ ] Implement URI parsing utilities
- [ ] Add query parameter parsing
- [ ] Implement URI validation
- [ ] Write tests for URI edge cases
- **Duration:** 4 hours
- **Deliverable:** URI utilities with tests

**TASK-BUILD-2: Pagination Response Formatter**
- [ ] Implement response formatting
- [ ] Add metadata (totalPages, hasMore, etc.)
- [ ] Implement JSON serialization
- [ ] Add response validation
- **Duration:** 3 hours
- **Deliverable:** Response formatter with tests

**TASK-BUILD-3: Demo Client**
- [ ] Build simple CLI client for testing
- [ ] Implement pagination navigation
- [ ] Demonstrate streaming resources
- [ ] Add performance timing
- **Duration:** 5 hours
- **Deliverable:** Demo client script

---

### 🔧 DevOps Tasks

**TASK-DEVOPS-1: Test Environment Setup**
- [ ] Create test repository with 1000+ changes
- [ ] Generate large test files (10MB, 50MB, 100MB)
- [ ] Set up performance monitoring
- [ ] Configure CI/CD for Phase 3 tests
- **Duration:** 4 hours
- **Deliverable:** Test environment ready

**TASK-DEVOPS-2: Benchmark Suite**
- [ ] Create benchmark scripts
- [ ] Implement pagination benchmarks
- [ ] Implement streaming benchmarks
- [ ] Set up continuous benchmarking
- **Duration:** 5 hours
- **Deliverable:** Automated benchmark suite

**TASK-DEVOPS-3: Deployment Package**
- [ ] Update build scripts
- [ ] Version bump for Phase 3
- [ ] Create deployment checklist
- [ ] Test deployment process
- **Duration:** 3 hours
- **Deliverable:** Deployment package ready

---

### 🧑‍💻 Generalist Tasks

**TASK-GEN-1: Quick Fixes**
- [ ] Fix any small bugs during development
- [ ] Handle ad-hoc debugging requests
- [ ] Triage unclear issues
- [ ] Provide quick answers to questions
- **Duration:** On-demand throughout phase
- **Deliverable:** Bug fixes and answers

**TASK-GEN-2: Documentation Polish**
- [ ] Proofread all documentation
- [ ] Fix typos and formatting
- [ ] Validate code examples work
- [ ] Ensure consistency across docs
- **Duration:** 3 hours
- **Deliverable:** Polished documentation

---

## 🧪 Testing Strategy

### Unit Tests (Engineer)

```typescript
describe('PaginationEngine', () => {
  test('returns first page with default size', async () => {
    const result = await engine.paginate(testRepoRoot, { page: 1 });
    expect(result.items).toHaveLength(50);
    expect(result.page).toBe(1);
    expect(result.nextPageToken).toBeDefined();
  });
  
  test('handles custom page size', async () => {
    const result = await engine.paginate(testRepoRoot, { 
      page: 1, 
      pageSize: 10 
    });
    expect(result.items).toHaveLength(10);
  });
  
  test('respects maximum page size', async () => {
    const result = await engine.paginate(testRepoRoot, { 
      page: 1, 
      pageSize: 200 // Should be clamped to 100
    });
    expect(result.items.length).toBeLessThanOrEqual(100);
  });
  
  test('returns empty array for page beyond end', async () => {
    const result = await engine.paginate(testRepoRoot, { 
      page: 9999 
    });
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });
  
  test('maintains stable sort across pages', async () => {
    const page1 = await engine.paginate(testRepoRoot, { page: 1 });
    const page2 = await engine.paginate(testRepoRoot, { 
      nextPageToken: page1.nextPageToken 
    });
    
    // Last item of page 1 should be before first item of page 2
    const lastPage1 = page1.items[page1.items.length - 1];
    const firstPage2 = page2.items[0];
    expect(lastPage1.sortKey < firstPage2.sortKey).toBe(true);
  });
  
  test('decodes token correctly', () => {
    const token = engine.encodeToken({
      page: 2,
      timestamp: '2025-10-24T12:00:00Z',
      sortKey: 'key123'
    });
    
    const decoded = engine.decodeToken(token);
    expect(decoded?.page).toBe(2);
    expect(decoded?.sortKey).toBe('key123');
  });
  
  test('handles invalid token gracefully', () => {
    const decoded = engine.decodeToken('invalid-token');
    expect(decoded).toBeNull();
  });
});

describe('StreamingResourceReader', () => {
  test('streams large file in chunks', async () => {
    const chunks: string[] = [];
    const generator = reader.streamFile(largeFilePath);
    
    for await (const chunk of generator) {
      chunks.push(chunk);
    }
    
    expect(chunks.length).toBeGreaterThan(1);
    const total = chunks.join('');
    expect(total.length).toBe(largeFileSize);
  });
  
  test('reads small file directly', async () => {
    const content = await reader.readResource(smallFilePath);
    expect(typeof content).toBe('string');
  });
  
  test('enforces size limit', async () => {
    await expect(
      reader.streamFile(hugeFilePath, { maxSize: 10 * 1024 * 1024 })
    ).rejects.toThrow('File too large');
  });
  
  test('handles non-existent file', async () => {
    await expect(
      reader.streamFile('/nonexistent')
    ).rejects.toThrow();
  });
  
  test('cleans up stream on error', async () => {
    const generator = reader.streamFile(validFilePath);
    const iterator = generator[Symbol.asyncIterator]();
    
    await iterator.next();
    await iterator.throw(new Error('Simulated error'));
    
    // Stream should be destroyed (implementation-specific test)
  });
});
```

### Integration Tests (Builder + Engineer)

```typescript
describe('Resource Provider Integration', () => {
  test('paginated listing works end-to-end', async () => {
    const response = await provider.readResource(
      'changes://active?page=1&pageSize=10'
    );
    
    const data = JSON.parse(response.contents);
    expect(data.items).toHaveLength(10);
    expect(data.nextPageToken).toBeDefined();
  });
  
  test('can navigate through all pages', async () => {
    const allItems: ChangeListItem[] = [];
    let nextToken: string | undefined;
    
    do {
      const uri = nextToken
        ? `changes://active?nextPageToken=${nextToken}`
        : 'changes://active?page=1&pageSize=50';
      
      const response = await provider.readResource(uri);
      const data = JSON.parse(response.contents);
      
      allItems.push(...data.items);
      nextToken = data.nextPageToken;
    } while (nextToken);
    
    expect(allItems.length).toBeGreaterThan(0);
    // Verify no duplicates
    const slugs = allItems.map(i => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  
  test('streams large file correctly', async () => {
    const response = await provider.readResource(
      'change://test-change/large-file.md'
    );
    
    if (typeof response.contents === 'string') {
      fail('Should use streaming for large file');
    }
    
    const chunks: string[] = [];
    for await (const chunk of response.contents) {
      chunks.push(chunk);
    }
    
    expect(chunks.length).toBeGreaterThan(1);
  });
  
  test('blocks path traversal', async () => {
    await expect(
      provider.readResource('change://test/../../../etc/passwd')
    ).rejects.toThrow('Path traversal');
  });
});
```

### Performance Tests (DevOps + Reviewer)

```typescript
describe('Performance Benchmarks', () => {
  test('pagination response time < 120ms', async () => {
    const start = Date.now();
    await provider.readResource('changes://active?page=1&pageSize=50');
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(120);
  });
  
  test('memory usage for 100MB file < 500MB', async () => {
    const memBefore = process.memoryUsage().heapUsed;
    
    const generator = reader.streamFile(file100MB);
    for await (const chunk of generator) {
      // Consume chunks
    }
    
    const memAfter = process.memoryUsage().heapUsed;
    const memDelta = (memAfter - memBefore) / (1024 * 1024);
    
    expect(memDelta).toBeLessThan(500);
  });
  
  test('handles 1000+ changes efficiently', async () => {
    // Create 1000 test changes
    await createTestChanges(1000);
    
    const start = Date.now();
    const response = await provider.readResource(
      'changes://active?page=1&pageSize=100'
    );
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(200); // Allow 200ms for large set
  });
});
```

---

## 📊 Success Validation

### Validation Checklist

**Functional Validation**
- [ ] Pagination returns correct number of items
- [ ] Next/previous tokens work correctly
- [ ] Streaming handles files >100MB without memory bloat
- [ ] Path traversal protection works
- [ ] Invalid tokens handled gracefully

**Performance Validation**
- [ ] Pagination response time <120ms (1000+ changes)
- [ ] Streaming memory usage <500MB (100MB+ files)
- [ ] No memory leaks in long-running tests
- [ ] Benchmark suite passes all targets

**Security Validation**
- [ ] Path traversal protection tested
- [ ] Token tampering detection works
- [ ] DoS protection (page size limits) enforced
- [ ] Security audit passed

**IDE Integration Validation**
- [ ] Resources attach in Claude Desktop
- [ ] Pagination works in IDE UI
- [ ] Streaming resources display correctly
- [ ] Performance acceptable in IDE

### Acceptance Criteria

✅ **Phase 3 Complete When:**
1. All unit tests pass (>90% coverage)
2. All integration tests pass
3. Performance benchmarks meet targets
4. Security audit passed
5. IDE integration validated
6. Documentation complete and reviewed
7. All agent tasks marked complete

---

## 📅 Timeline & Milestones

### Week 1: Core Implementation
- **Days 1-2:** Architect designs, Engineer implements pagination
- **Days 3-4:** Engineer implements streaming, Builder creates utilities
- **Day 5:** Integration and initial testing

### Week 2: Testing & Optimization
- **Days 6-7:** Reviewer conducts security and performance review
- **Days 8-9:** Engineer optimizes based on feedback
- **Day 10:** DevOps sets up benchmark suite

### Week 3: Documentation & Polish
- **Days 11-12:** Knowledge creates documentation
- **Days 13-14:** Final validation and IDE testing
- **Day 15:** Phase 3 completion sign-off

---

## 🚀 Deployment Plan

### Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Performance validated
- [ ] Security approved
- [ ] IDE integration tested

### Deployment Steps
1. **Version Bump:** Update to v0.3.0
2. **Release Notes:** Document Phase 3 changes
3. **Deployment:** Update MCP server binary
4. **Validation:** Run smoke tests in production
5. **Monitoring:** Watch metrics for 24 hours

### Rollback Plan
- If pagination fails: Fallback to simple listing (no pagination)
- If streaming fails: Fallback to direct read with size limit warning
- Full rollback: Revert to Phase 2 version

---

## 📈 Metrics Dashboard

Track these metrics throughout Phase 3:

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Test Coverage | >90% | TBD | 🟡 In Progress |
| Pagination Response Time | <120ms | TBD | 🟡 In Progress |
| Streaming Memory Usage | <500MB | TBD | 🟡 In Progress |
| Security Issues | 0 | TBD | 🟡 In Progress |
| Documentation Coverage | 100% | TBD | 🟡 In Progress |

---

## 🎓 Learning Resources

For agents new to these concepts:

- **Cursor-Based Pagination:** [Cursor-based pagination guide](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/)
- **Node.js Streams:** [Node.js Stream API docs](https://nodejs.org/api/stream.html)
- **MCP Resources:** [Model Context Protocol - Resources](https://modelcontextprotocol.io/docs/concepts/resources)

---

## ✅ Phase 3 Completion Criteria

Phase 3 is **COMPLETE** when:

1. ✅ All agent tasks marked complete
2. ✅ Test suite passes (100% pass rate, >90% coverage)
3. ✅ Performance benchmarks met
4. ✅ Security audit passed
5. ✅ IDE integration validated
6. ✅ Documentation complete and reviewed
7. ✅ Orchestrator signs off on completion

---

**Ready to begin? Assign tasks and start execution! 🚀**

*Document Version: 1.0*  
*Last Updated: 2025-10-24*  
*Next Review: End of Week 1*