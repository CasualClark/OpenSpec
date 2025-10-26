# Pagination & Streaming Guide

_Comprehensive guide for implementing efficient pagination and streaming in IDE integrations_

Last updated: 2025-10-24

## Table of Contents

1. [Quick Start](#quick-start)
2. [Pagination Deep Dive](#pagination-deep-dive)
3. [Streaming Deep Dive](#streaming-deep-dive)
4. [Performance Optimization](#performance-optimization)
5. [Troubleshooting](#troubleshooting)
6. [Advanced Patterns](#advanced-patterns)

---

## Quick Start

### Basic Pagination

```typescript
// Load first page with default settings
const result = await mcpResource('changes://active');
const data = JSON.parse(result);

// Load custom page size
const result = await mcpResource('changes://active?page=1&pageSize=20');
```

### Basic Streaming

```typescript
// Automatic streaming for files > 10MB
const result = await mcpResource('change://large-feature/proposal');

// With progress feedback
const result = await mcpResourceWithProgress(
  'change://large-feature/proposal',
  (progress) => {
    console.log(`${progress.percentage}% complete`);
  }
);
```

---

## Pagination Deep Dive

### URI Structure

```
changes://active?page={number}&pageSize={number}&nextPageToken={string}
```

**Parameters**:
- `page` (optional): Page number, default 1, minimum 1
- `pageSize` (optional): Items per page, default 50, range 1-1000
- `nextPageToken` (optional): Token for stable pagination navigation

### Response Format

```json
{
  "changes": [
    {
      "slug": "user-auth-feature",
      "title": "Add user authentication",
      "description": "Implement OAuth2 authentication flow",
      "path": "/project/openspec/changes/user-auth-feature",
      "created": "2025-10-24T10:00:00Z",
      "modified": "2025-10-24T15:30:00Z",
      "hasProposal": true,
      "hasLock": false,
      "lockInfo": null,
      "specCount": 3,
      "taskCount": 5,
      "deltaCount": 2,
      "status": "in-progress"
    }
  ],
  "total": 127,
  "hasNextPage": true,
  "nextPageToken": "a1b2c3d4e5f6g7h8",
  "generated": "2025-10-24T16:00:00Z"
}
```

### Stable Sorting Algorithm

Changes are sorted using a multi-level algorithm for consistency:

1. **Primary**: Modified date (newest first)
2. **Secondary**: Created date (newest first)  
3. **Tertiary**: Slug (alphabetical)

This ensures consistent ordering across pagination requests.

### nextPageToken Generation

Tokens are generated using content-based hashing:

```typescript
// Algorithm (simplified)
const lastItem = changes[endIndex - 1];
const content = `${lastItem.slug}|${lastItem.modified}|${lastItem.created}`;
const token = sha256(content).substring(0, 16);
```

**Benefits**:
- Stable across requests
- Resistant to modification attacks
- Compact (16 characters)
- URL-safe

### Pagination Implementation Examples

#### VS Code Extension

```typescript
class VSCodePaginationProvider {
  private currentPage = 1;
  private pageSize = 50;
  private nextPageToken: string | null = null;
  private totalItems = 0;

  async loadPage(page?: number, pageSize?: number) {
    this.currentPage = page || this.currentPage;
    this.pageSize = pageSize || this.pageSize;

    const uri = this.buildUri();
    const result = await vscode.workspace.fs.readFile(
      vscode.Uri.parse(`mcp://openspec/${uri}`)
    );
    
    const data = JSON.parse(result.toString());
    this.updateState(data);
    this.displayChanges(data.changes);
    
    return data;
  }

  private buildUri(): string {
    let uri = `changes://active?page=${this.currentPage}&pageSize=${this.pageSize}`;
    
    if (this.currentPage > 1 && this.nextPageToken) {
      uri += `&nextPageToken=${this.nextPageToken}`;
    }
    
    return uri;
  }

  private updateState(data: any) {
    this.totalItems = data.total;
    this.nextPageToken = data.nextPageToken;
  }

  async nextPage() {
    if (this.nextPageToken) {
      return this.loadPage(this.currentPage + 1);
    }
    throw new Error('No next page available');
  }

  async previousPage() {
    if (this.currentPage > 1) {
      return this.loadPage(this.currentPage - 1);
    }
    throw new Error('Already on first page');
  }

  getPaginationInfo() {
    const startItem = (this.currentPage - 1) * this.pageSize + 1;
    const endItem = Math.min(startItem + this.pageSize - 1, this.totalItems);
    
    return {
      currentPage: this.currentPage,
      pageSize: this.pageSize,
      totalItems: this.totalItems,
      startItem,
      endItem,
      hasNextPage: !!this.nextPageToken,
      hasPreviousPage: this.currentPage > 1
    };
  }
}
```

#### JetBrains Plugin

```kotlin
class JetBrainsPaginationProvider {
    private var currentPage = 1
    private var pageSize = 50
    private var nextPageToken: String? = null
    private var totalItems = 0

    suspend fun loadPage(page: Int = currentPage, size: Int = pageSize): PaginationResult {
        currentPage = page
        pageSize = size

        val uri = buildUri()
        val result = mcpClient.getResource(uri)
        val data = Json.decodeFromString<PaginationData>(result)
        
        updateState(data)
        return PaginationResult(data.changes, getPaginationInfo())
    }

    private fun buildUri(): String {
        var uri = "changes://active?page=$currentPage&pageSize=$pageSize"
        
        if (currentPage > 1 && nextPageToken != null) {
            uri += "&nextPageToken=$nextPageToken"
        }
        
        return uri
    }

    private fun updateState(data: PaginationData) {
        totalItems = data.total
        nextPageToken = data.nextPageToken
    }

    fun getPaginationInfo(): PaginationInfo {
        val startItem = (currentPage - 1) * pageSize + 1
        val endItem = minOf(startItem + pageSize - 1, totalItems)
        
        return PaginationInfo(
            currentPage = currentPage,
            pageSize = pageSize,
            totalItems = totalItems,
            startItem = startItem,
            endItem = endItem,
            hasNextPage = nextPageToken != null,
            hasPreviousPage = currentPage > 1
        )
    }
}
```

### Pagination Best Practices

#### 1. Page Size Selection

```typescript
function getOptimalPageSize(context: 'mobile' | 'desktop' | 'api'): number {
  switch (context) {
    case 'mobile': return 20;    // Limited screen space
    case 'desktop': return 50;    // Balance of speed/UX
    case 'api': return 100;       // Bulk operations
    default: return 50;
  }
}
```

#### 2. Caching Strategy

```typescript
class PaginationCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  async get(page: number, pageSize: number): Promise<any | null> {
    const key = `${page}-${pageSize}`;
    const entry = this.cache.get(key);
    
    if (entry && Date.now() - entry.timestamp < this.TTL) {
      return entry.data;
    }
    
    return null;
  }

  set(page: number, pageSize: number, data: any): void {
    const key = `${page}-${pageSize}`;
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (this.cache.size > 20) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }
}
```

#### 3. Error Handling

```typescript
async function safePaginate(page: number, pageSize: number): Promise<any> {
  try {
    // Validate parameters
    if (page < 1) throw new Error('Page must be >= 1');
    if (pageSize < 1 || pageSize > 1000) throw new Error('Page size must be 1-1000');
    
    const uri = `changes://active?page=${page}&pageSize=${pageSize}`;
    const result = await mcpResource(uri);
    return JSON.parse(result);
    
  } catch (error) {
    if (error.message.includes('INVALID_PAGE')) {
      throw new PaginationError('Invalid page number', 'INVALID_PAGE');
    } else if (error.message.includes('PAGE_SIZE_TOO_LARGE')) {
      throw new PaginationError('Page size exceeds maximum', 'PAGE_SIZE_TOO_LARGE');
    } else if (error.message.includes('INVALID_TOKEN')) {
      // Reset to first page on token error
      return safePaginate(1, pageSize);
    }
    throw error;
  }
}
```

---

## Streaming Deep Dive

### Streaming Configuration

```typescript
interface StreamingConfig {
  chunkSize?: number;           // Default: 64KB
  maxMemoryUsage?: number;      // Default: 50MB
  streamingThreshold?: number;  // Default: 10MB
  progressInterval?: number;      // Default: 5 chunks
}
```

### Streaming Decision Logic

```typescript
function shouldStream(fileSize: number, threshold: number): boolean {
  return fileSize > threshold;
}

// Example thresholds by context
const THRESHOLDS = {
  mobile: 5 * 1024 * 1024,      // 5MB
  desktop: 10 * 1024 * 1024,     // 10MB
  server: 50 * 1024 * 1024       // 50MB
};
```

### Progress Callback Interface

```typescript
interface StreamingProgress {
  bytesRead: number;        // Current bytes read
  totalBytes: number;        // Total file size
  percentage: number;       // 0-100
  chunkNumber: number;      // Current chunk
  totalChunks: number;      // Estimated total chunks
  memoryUsage: number;      // Current memory usage in bytes
}
```

### Streaming Implementation Examples

#### VS Code Progress Integration

```typescript
class VSCodeStreamingProvider {
  async streamWithProgress(uri: string): Promise<string> {
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Streaming file...',
      cancellable: true
    }, async (progress, token) => {
      const progressCallback = (streamProgress: StreamingProgress) => {
        if (token.isCancellationRequested) {
          throw new Error('Cancelled by user');
        }
        
        const increment = streamProgress.percentage / 100;
        progress.report({
          increment,
          message: `${streamProgress.percentage}% (${streamProgress.bytesRead}/${streamProgress.totalBytes} bytes)`
        });
      };
      
      return await mcpResourceWithProgress(uri, progressCallback);
    });
  }
}
```

#### JetBrains Progress Integration

```kotlin
class JetBrainsStreamingProvider {
  suspend fun streamWithProgress(uri: String): String {
    return withContext(Dispatchers.IO) {
      val progressIndicator = ProgressManager.getInstance().progressIndicator
      var lastReportedProgress = 0
      
      val progressCallback = { streamProgress: StreamingProgress ->
        val currentProgress = streamProgress.percentage.toInt()
        
        // Only report every 5% to avoid UI spam
        if (currentProgress - lastReportedProgress >= 5) {
          progressIndicator?.fraction = streamProgress.percentage / 100.0
          progressIndicator?.text2 = "${currentProgress}% (${streamProgress.bytesRead}/${streamProgress.totalBytes})"
          lastReportedProgress = currentProgress
        }
      }
      
      mcpClient.getResourceWithProgress(uri, progressCallback)
    }
  }
}
```

#### Memory Monitoring

```typescript
class StreamingMemoryMonitor {
  private readonly WARNING_THRESHOLD = 0.8; // 80%
  private readonly CRITICAL_THRESHOLD = 0.95; // 95%
  private maxMemory = 50 * 1024 * 1024; // 50MB

  monitorMemory(progress: StreamingProgress): void {
    const memoryUsage = progress.memoryUsage;
    const usageRatio = memoryUsage / this.maxMemory;
    
    if (usageRatio > this.CRITICAL_THRESHOLD) {
      throw new Error(`Critical memory usage: ${Math.round(usageRatio * 100)}%`);
    } else if (usageRatio > this.WARNING_THRESHOLD) {
      console.warn(`High memory usage: ${Math.round(usageRatio * 100)}%`);
    }
  }

  getOptimalChunkSize(fileSize: number): number {
    // Smaller chunks for larger files to control memory
    if (fileSize > 100 * 1024 * 1024) return 32 * 1024; // 32KB
    if (fileSize > 50 * 1024 * 1024) return 48 * 1024;  // 48KB
    return 64 * 1024; // 64KB default
  }
}
```

### Streaming Best Practices

#### 1. Chunk Size Optimization

```typescript
function optimizeChunkSize(fileSize: number, networkSpeed: 'slow' | 'fast'): number {
  const baseChunkSize = 64 * 1024; // 64KB
  
  if (networkSpeed === 'slow') {
    // Smaller chunks for slow networks
    return Math.min(baseChunkSize / 2, 16 * 1024);
  }
  
  // Larger chunks for fast networks and large files
  if (fileSize > 100 * 1024 * 1024) {
    return baseChunkSize * 2; // 128KB
  }
  
  return baseChunkSize;
}
```

#### 2. Progress Reporting Strategy

```typescript
class ProgressReporter {
  private lastReport = 0;
  private readonly REPORT_INTERVAL = 100; // ms

  shouldReport(progress: StreamingProgress): boolean {
    const now = Date.now();
    const timeSinceLastReport = now - this.lastReport;
    
    // Report based on time or significant progress
    const significantProgress = progress.percentage - this.lastReport > 5;
    
    if (timeSinceLastReport > this.REPORT_INTERVAL || significantProgress) {
      this.lastReport = now;
      return true;
    }
    
    return false;
  }
}
```

#### 3. Error Recovery

```typescript
class ResilientStreamer {
  async streamWithRetry(
    uri: string, 
    maxRetries: number = 3,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<string> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await mcpResourceWithProgress(uri, onProgress);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await this.sleep(delay);
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  private isRetryableError(error: Error): boolean {
    return error.message.includes('STREAMING_ERROR') ||
           error.message.includes('NETWORK_ERROR') ||
           error.message.includes('TIMEOUT');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Performance Optimization

### Pagination Performance

#### 1. Prefetching Strategy

```typescript
class PaginationPrefetcher {
  private prefetchQueue = new Map<number, Promise<any>>();
  private readonly PREFETCH_DISTANCE = 2;

  async getPage(page: number, pageSize: number): Promise<any> {
    // Trigger prefetch for nearby pages
    this.prefetchNearbyPages(page, pageSize);
    
    // Return current page
    return this.loadPage(page, pageSize);
  }

  private prefetchNearbyPages(currentPage: number, pageSize: number): void {
    for (let offset = 1; offset <= this.PREFETCH_DISTANCE; offset++) {
      const nextPage = currentPage + offset;
      
      if (!this.prefetchQueue.has(nextPage)) {
        const prefetchPromise = this.loadPage(nextPage, pageSize)
          .catch(() => null); // Ignore prefetch errors
        this.prefetchQueue.set(nextPage, prefetchPromise);
      }
    }
  }

  private async loadPage(page: number, pageSize: number): Promise<any> {
    const cached = this.prefetchQueue.get(page);
    if (cached) {
      this.prefetchQueue.delete(page);
      return cached;
    }

    // Load normally
    const uri = `changes://active?page=${page}&pageSize=${pageSize}`;
    const result = await mcpResource(uri);
    return JSON.parse(result);
  }
}
```

#### 2. Virtual Scrolling

```typescript
class VirtualScrollingPagination {
  private visibleRange = { start: 0, end: 49 };
  private pageSize = 50;
  private cache = new Map<number, any[]>();

  async getVisibleItems(scrollTop: number, itemHeight: number): Promise<any[]> {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(startIndex + this.pageSize, startIndex + 100);
    
    this.visibleRange = { start: startIndex, end: endIndex };
    
    // Load pages that contain visible items
    const startPage = Math.floor(startIndex / this.pageSize) + 1;
    const endPage = Math.floor(endIndex / this.pageSize) + 1;
    
    for (let page = startPage; page <= endPage; page++) {
      if (!this.cache.has(page)) {
        const data = await this.loadPage(page);
        this.cache.set(page, data.changes);
      }
    }
    
    return this.extractVisibleItems();
  }

  private extractVisibleItems(): any[] {
    const result: any[] = [];
    
    for (let i = this.visibleRange.start; i <= this.visibleRange.end; i++) {
      const page = Math.floor(i / this.pageSize) + 1;
      const indexInPage = i % this.pageSize;
      const pageData = this.cache.get(page);
      
      if (pageData && pageData[indexInPage]) {
        result.push(pageData[indexInPage]);
      }
    }
    
    return result;
  }
}
```

### Streaming Performance

#### 1. Adaptive Chunking

```typescript
class AdaptiveChunker {
  private performanceHistory: number[] = [];
  private readonly HISTORY_SIZE = 10;

  getOptimalChunkSize(
    fileSize: number, 
    networkSpeed: number, 
    memoryLimit: number
  ): number {
    // Base chunk size on file size
    let chunkSize = Math.min(fileSize / 100, 1024 * 1024); // Max 1MB
    
    // Adjust for network speed
    const networkFactor = Math.min(networkSpeed / 1_000_000, 10); // Max 10x
    chunkSize *= networkFactor;
    
    // Adjust for memory constraints
    const memoryFactor = memoryLimit / (50 * 1024 * 1024); // Relative to 50MB
    chunkSize *= memoryFactor;
    
    // Adjust based on historical performance
    if (this.performanceHistory.length >= this.HISTORY_SIZE) {
      const avgPerformance = this.performanceHistory.reduce((a, b) => a + b) / this.performanceHistory.length;
      const performanceFactor = avgPerformance / 1000; // Target 1s per chunk
      chunkSize *= performanceFactor;
    }
    
    return Math.max(Math.min(chunkSize, 1024 * 1024), 1024); // 1KB - 1MB
  }

  recordPerformance(duration: number): void {
    this.performanceHistory.push(duration);
    if (this.performanceHistory.length > this.HISTORY_SIZE) {
      this.performanceHistory.shift();
    }
  }
}
```

#### 2. Compression for Streaming

```typescript
class CompressedStreamer {
  async streamWithCompression(
    uri: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<string> {
    // Check if compression is supported
    const supportsCompression = await this.checkCompressionSupport();
    
    if (supportsCompression) {
      return this.streamCompressed(uri, onProgress);
    } else {
      return mcpResourceWithProgress(uri, onProgress);
    }
  }

  private async streamCompressed(
    uri: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<string> {
    const compressedUri = `${uri}&compression=gzip`;
    const result = await mcpResourceWithProgress(compressedUri, onProgress);
    
    // Decompress on client side
    return this.decompress(result);
  }

  private async checkCompressionSupport(): Promise<boolean> {
    try {
      const result = await mcpResource('changes://active?compression=test');
      return result.includes('compression-supported');
    } catch {
      return false;
    }
  }
}
```

### Memory Management

#### 1. Memory Pool

```typescript
class MemoryPool {
  private pools: Map<number, Buffer[]> = new Map();
  private readonly POOL_SIZES = [1024, 4096, 16384, 65536]; // 1KB, 4KB, 16KB, 64KB

  getBuffer(size: number): Buffer {
    const poolSize = this.findPoolSize(size);
    let pool = this.pools.get(poolSize);
    
    if (!pool) {
      pool = [];
      this.pools.set(poolSize, pool);
    }
    
    return pool.pop() || Buffer.allocUnsafe(poolSize);
  }

  releaseBuffer(buffer: Buffer): void {
    const poolSize = this.findPoolSize(buffer.length);
    let pool = this.pools.get(poolSize);
    
    if (!pool) {
      pool = [];
      this.pools.set(poolSize, pool);
    }
    
    if (pool.length < 10) { // Limit pool size
      pool.push(buffer);
    }
  }

  private findPoolSize(requestedSize: number): number {
    return this.POOL_SIZES.find(size => size >= requestedSize) || this.POOL_SIZES[this.POOL_SIZES.length - 1];
  }
}
```

#### 2. Garbage Collection Hints

```typescript
class MemoryManager {
  private memoryUsage = 0;
  private readonly WARNING_THRESHOLD = 40 * 1024 * 1024; // 40MB
  private readonly CRITICAL_THRESHOLD = 45 * 1024 * 1024; // 45MB

  trackMemoryUsage(delta: number): void {
    this.memoryUsage += delta;
    
    if (this.memoryUsage > this.CRITICAL_THRESHOLD) {
      this.forceGarbageCollection();
    } else if (this.memoryUsage > this.WARNING_THRESHOLD) {
      this.suggestGarbageCollection();
    }
  }

  private forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
    }
    this.memoryUsage = 0; // Reset tracking
  }

  private suggestGarbageCollection(): void {
    // Schedule GC for next event loop cycle
    setTimeout(() => {
      if (global.gc) {
        global.gc();
      }
    }, 0);
  }

  reset(): void {
    this.memoryUsage = 0;
  }
}
```

---

## Troubleshooting

### Common Pagination Issues

#### 1. Invalid Page Parameters

**Error**: `INVALID_PAGE: Page number must be greater than 0`

**Causes**:
- Page parameter is 0 or negative
- Page parameter is not a number

**Solutions**:
```typescript
function validatePageParams(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('Page must be a positive integer');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('Page size must be between 1 and 1000');
  }
}
```

#### 2. nextPageToken Issues

**Error**: `INVALID_TOKEN: nextPageToken is invalid or expired`

**Causes**:
- Using expired token after changes were modified
- Token was corrupted or modified
- Using token from different page size

**Solutions**:
```typescript
class TokenManager {
  async handleTokenError(): Promise<any> {
    // Reset to first page with current page size
    console.warn('Token invalid, resetting to first page');
    return this.loadPage(1, this.pageSize);
  }

  validateToken(token: string, context: string): boolean {
    // Basic validation
    if (!token || token.length !== 16) return false;
    if (!/^[a-f0-9]{16}$/.test(token)) return false;
    
    // Context validation (optional)
    return this.isValidContext(token, context);
  }
}
```

#### 3. Performance Issues

**Symptom**: Slow pagination loading

**Diagnosis**:
```typescript
async function diagnosePaginationPerformance() {
  const start = Date.now();
  const result = await mcpResource('changes://active?page=1&pageSize=50');
  const loadTime = Date.now() - start;
  
  console.log(`Pagination load time: ${loadTime}ms`);
  
  if (loadTime > 5000) {
    console.warn('Slow pagination detected. Possible causes:');
    console.warn('- Large number of changes');
    console.warn('- Slow disk I/O');
    console.warn('- Network latency');
    console.warn('- Server overload');
  }
  
  return { loadTime, result };
}
```

### Common Streaming Issues

#### 1. Memory Limit Exceeded

**Error**: `MEMORY_LIMIT_EXCEEDED: Memory usage exceeded 50MB`

**Causes**:
- File too large for current configuration
- Memory leak in streaming implementation
- Multiple concurrent streaming operations

**Solutions**:
```typescript
class StreamingTroubleshooter {
  async handleMemoryLimit(uri: string): Promise<string> {
    // Try with smaller chunks
    const config = {
      chunkSize: 16 * 1024, // 16KB instead of 64KB
      maxMemoryUsage: 25 * 1024 * 1024 // 25MB instead of 50MB
    };
    
    return await mcpResourceWithConfig(uri, config);
  }

  async diagnoseMemoryUsage(): Promise<void> {
    const stats = process.memoryUsage();
    console.log('Memory usage:');
    console.log(`RSS: ${Math.round(stats.rss / 1024 / 1024)}MB`);
    console.log(`Heap Used: ${Math.round(stats.heapUsed / 1024 / 1024)}MB`);
    console.log(`Heap Total: ${Math.round(stats.heapTotal / 1024 / 1024)}MB`);
  }
}
```

#### 2. Streaming Interruptions

**Error**: `STREAMING_ERROR: Connection interrupted during streaming`

**Causes**:
- Network connectivity issues
- Server process termination
- Timeout during long streaming operations

**Solutions**:
```typescript
class ResilientStreaming {
  async streamWithRetry(
    uri: string,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.attemptStream(uri);
      } catch (error) {
        if (this.isRetryableError(error) && attempt < maxRetries) {
          console.warn(`Streaming attempt ${attempt} failed, retrying...`);
          await this.sleep(retryDelay * attempt); // Exponential backoff
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('All streaming attempts failed');
  }

  private isRetryableError(error: Error): boolean {
    return error.message.includes('STREAMING_ERROR') ||
           error.message.includes('TIMEOUT') ||
           error.message.includes('NETWORK_ERROR');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### 3. Progress Reporting Issues

**Symptom**: Progress not updating or incorrect values

**Diagnosis**:
```typescript
class ProgressDebugger {
  async debugStreamingProgress(uri: string): Promise<void> {
    const progressEvents: StreamingProgress[] = [];
    
    const debugCallback = (progress: StreamingProgress) => {
      progressEvents.push({...progress});
      
      console.log('Progress event:', {
        percentage: progress.percentage,
        bytesRead: progress.bytesRead,
        totalBytes: progress.totalBytes,
        chunkNumber: progress.chunkNumber,
        memoryUsage: progress.memoryUsage
      });
    };
    
    try {
      await mcpResourceWithProgress(uri, debugCallback);
      this.analyzeProgressEvents(progressEvents);
    } catch (error) {
      console.error('Streaming failed during debug:', error);
    }
  }

  private analyzeProgressEvents(events: StreamingProgress[]): void {
    if (events.length === 0) {
      console.error('No progress events received');
      return;
    }
    
    // Check for monotonic progress
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      
      if (curr.bytesRead < prev.bytesRead) {
        console.error('Non-monotonic progress detected');
      }
      
      if (curr.percentage < prev.percentage) {
        console.error('Percentage decreased');
      }
    }
    
    // Check final progress
    const final = events[events.length - 1];
    if (final.percentage !== 100) {
      console.error('Final progress is not 100%');
    }
  }
}
```

### Performance Debugging Tools

#### 1. Pagination Profiler

```typescript
class PaginationProfiler {
  async profilePagination(pageSizes: number[]): Promise<ProfilingResult> {
    const results: any[] = [];
    
    for (const pageSize of pageSizes) {
      const start = Date.now();
      const memoryBefore = process.memoryUsage().heapUsed;
      
      const result = await mcpResource(`changes://active?page=1&pageSize=${pageSize}`);
      const loadTime = Date.now() - start;
      const memoryAfter = process.memoryUsage().heapUsed;
      
      const data = JSON.parse(result);
      
      results.push({
        pageSize,
        loadTime,
        memoryUsed: memoryAfter - memoryBefore,
        itemCount: data.changes.length,
        timePerItem: loadTime / data.changes.length
      });
    }
    
    return this.analyzeResults(results);
  }

  private analyzeResults(results: any[]): ProfilingResult {
    const optimal = results.reduce((best, current) => 
      current.timePerItem < best.timePerItem ? current : best
    );
    
    return {
      optimal,
      recommendations: this.generateRecommendations(results),
      fullResults: results
    };
  }

  private generateRecommendations(results: any[]): string[] {
    const recommendations: string[] = [];
    
    // Find best performance
    const bestPerformance = Math.min(...results.map(r => r.timePerItem));
    const bestPageSize = results.find(r => r.timePerItem === bestPerformance).pageSize;
    
    recommendations.push(`Optimal page size: ${bestPageSize} items`);
    
    // Memory efficiency
    const memoryPerItem = results.map(r => r.memoryUsed / r.itemCount);
    const avgMemoryPerItem = memoryPerItem.reduce((a, b) => a + b) / memoryPerItem.length;
    
    if (avgMemoryPerItem > 1024 * 1024) { // 1MB per item
      recommendations.push('Consider reducing page size for memory efficiency');
    }
    
    return recommendations;
  }
}
```

#### 2. Streaming Profiler

```typescript
class StreamingProfiler {
  async profileStreaming(fileUris: string[]): Promise<StreamingProfilingResult> {
    const results: any[] = [];
    
    for (const uri of fileUris) {
      const result = await this.profileSingleStream(uri);
      results.push(result);
    }
    
    return this.analyzeStreamingResults(results);
  }

  private async profileSingleStream(uri: string): Promise<any> {
    const progressEvents: StreamingProgress[] = [];
    const start = Date.now();
    const memoryBefore = process.memoryUsage().heapUsed;
    
    const progressCallback = (progress: StreamingProgress) => {
      progressEvents.push({...progress});
    };
    
    try {
      const content = await mcpResourceWithProgress(uri, progressCallback);
      const totalTime = Date.now() - start;
      const memoryAfter = process.memoryUsage().heapUsed;
      
      return {
        uri,
        success: true,
        totalTime,
        memoryUsed: memoryAfter - memoryBefore,
        contentSize: content.length,
        progressEvents: progressEvents.length,
        averageChunkTime: this.calculateAverageChunkTime(progressEvents),
        memoryEfficiency: content.length / (memoryAfter - memoryBefore)
      };
    } catch (error) {
      return {
        uri,
        success: false,
        error: error.message,
        progressEvents: progressEvents.length
      };
    }
  }

  private calculateAverageChunkTime(events: StreamingProgress[]): number {
    if (events.length < 2) return 0;
    
    const totalTime = events[events.length - 1].chunkNumber * 100; // Estimated
    return totalTime / events.length;
  }

  private analyzeStreamingResults(results: any[]): StreamingProfilingResult {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const avgThroughput = successful.reduce((sum, r) => 
      sum + (r.contentSize / r.totalTime * 1000), 0
    ) / successful.length;
    
    const avgMemoryEfficiency = successful.reduce((sum, r) => 
      sum + r.memoryEfficiency, 0
    ) / successful.length;
    
    return {
      successRate: successful.length / results.length,
      averageThroughput: avgThroughput,
      averageMemoryEfficiency: avgMemoryEfficiency,
      recommendations: this.generateStreamingRecommendations(successful),
      failures: failed.map(r => ({ uri: r.uri, error: r.error }))
    };
  }

  private generateStreamingRecommendations(results: any[]): string[] {
    const recommendations: string[] = [];
    
    const avgMemoryEfficiency = results.reduce((sum, r) => 
      sum + r.memoryEfficiency, 0
    ) / results.length;
    
    if (avgMemoryEfficiency < 10) {
      recommendations.push('Memory efficiency is low. Consider reducing chunk size');
    }
    
    const avgThroughput = results.reduce((sum, r) => 
      sum + (r.contentSize / r.totalTime * 1000), 0
    ) / results.length;
    
    if (avgThroughput < 1024 * 1024) { // 1MB/s
      recommendations.push('Throughput is low. Check network and disk performance');
    }
    
    return recommendations;
  }
}
```

---

## Advanced Patterns

### 1. Intelligent Prefetching

```typescript
class IntelligentPrefetcher {
  private accessPattern = new Map<string, AccessPattern>();
  private prefetchQueue: Promise<any>[] = [];

  async getPage(page: number, pageSize: number, context: string): Promise<any> {
    // Record access pattern
    this.recordAccess(page, context);
    
    // Trigger intelligent prefetch
    this.intelligentPrefetch(page, pageSize, context);
    
    // Return current page
    return this.loadPage(page, pageSize);
  }

  private recordAccess(page: number, context: string): void {
    const pattern = this.accessPattern.get(context) || {
      sequentialAccess: 0,
      randomAccess: 0,
      lastPages: [],
      averageJump: 0
    };
    
    if (pattern.lastPages.length > 0) {
      const lastPage = pattern.lastPages[pattern.lastPages.length - 1];
      const jump = Math.abs(page - lastPage);
      
      if (jump === 1) {
        pattern.sequentialAccess++;
      } else {
        pattern.randomAccess++;
        pattern.averageJump = (pattern.averageJump + jump) / 2;
      }
    }
    
    pattern.lastPages.push(page);
    if (pattern.lastPages.length > 10) {
      pattern.lastPages.shift();
    }
    
    this.accessPattern.set(context, pattern);
  }

  private intelligentPrefetch(currentPage: number, pageSize: number, context: string): void {
    const pattern = this.accessPattern.get(context);
    if (!pattern) return;
    
    const sequentialRatio = pattern.sequentialAccess / (pattern.sequentialAccess + pattern.randomAccess);
    
    if (sequentialRatio > 0.8) {
      // Sequential access pattern - prefetch next pages
      this.prefetchSequential(currentPage, pageSize);
    } else {
      // Random access pattern - prefetch based on history
      this.prefetchBasedOnHistory(currentPage, pageSize, pattern);
    }
  }

  private prefetchSequential(currentPage: number, pageSize: number): void {
    for (let offset = 1; offset <= 3; offset++) {
      const nextPage = currentPage + offset;
      if (!this.isPrefetching(nextPage)) {
        this.prefetchQueue.push(this.loadPage(nextPage, pageSize));
      }
    }
  }

  private prefetchBasedOnHistory(currentPage: number, pageSize: number, pattern: AccessPattern): void {
    // Find frequently accessed pages from history
    const pageFrequency = new Map<number, number>();
    
    for (const page of pattern.lastPages) {
      pageFrequency.set(page, (pageFrequency.get(page) || 0) + 1);
    }
    
    // Sort by frequency and prefetch top 2
    const sortedPages = Array.from(pageFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(entry => entry[0]);
    
    for (const page of sortedPages) {
      if (page !== currentPage && !this.isPrefetching(page)) {
        this.prefetchQueue.push(this.loadPage(page, pageSize));
      }
    }
  }

  private isPrefetching(page: number): boolean {
    return this.prefetchQueue.some(p => p.page === page);
  }
}
```

### 2. Adaptive Streaming

```typescript
class AdaptiveStreaming {
  private performanceMetrics = new Map<string, PerformanceMetrics>();
  private adaptationHistory: AdaptationRecord[] = [];

  async streamWithAdaptation(
    uri: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<string> {
    const context = this.getContext(uri);
    const config = this.getOptimalConfig(context);
    
    const startTime = Date.now();
    const progressEvents: StreamingProgress[] = [];
    
    const adaptiveCallback = (progress: StreamingProgress) => {
      progressEvents.push({...progress});
      
      // Check if adaptation is needed
      if (this.shouldAdapt(progress, progressEvents)) {
        this.adaptStreaming(progress, config);
      }
      
      if (onProgress) {
        onProgress(progress);
      }
    };
    
    try {
      const result = await mcpResourceWithConfig(uri, config, adaptiveCallback);
      
      // Record performance
      this.recordPerformance(context, {
        duration: Date.now() - startTime,
        success: true,
        config,
        progressEvents
      });
      
      return result;
    } catch (error) {
      // Record failure
      this.recordPerformance(context, {
        duration: Date.now() - startTime,
        success: false,
        error: error.message,
        config
      });
      
      throw error;
    }
  }

  private shouldAdapt(progress: StreamingProgress, events: StreamingProgress[]): boolean {
    // Adapt if memory usage is high
    if (progress.memoryUsage > 40 * 1024 * 1024) { // 40MB
      return true;
    }
    
    // Adapt if progress is too slow
    if (events.length > 10) {
      const recentEvents = events.slice(-10);
      const avgTimePerChunk = this.calculateAverageTimePerChunk(recentEvents);
      
      if (avgTimePerChunk > 2000) { // 2 seconds per chunk
        return true;
      }
    }
    
    return false;
  }

  private adaptStreaming(progress: StreamingProgress, config: StreamingConfig): void {
    if (progress.memoryUsage > 40 * 1024 * 1024) {
      // Reduce chunk size for memory efficiency
      config.chunkSize = Math.max(config.chunkSize / 2, 4096);
      console.log(`Adapted: Reduced chunk size to ${config.chunkSize} bytes`);
    }
    
    // Could also adjust other parameters based on conditions
  }

  private getOptimalConfig(context: string): StreamingConfig {
    const metrics = this.performanceMetrics.get(context);
    
    if (!metrics) {
      // Default configuration
      return {
        chunkSize: 64 * 1024,
        maxMemoryUsage: 50 * 1024 * 1024,
        streamingThreshold: 10 * 1024 * 1024
      };
    }
    
    // Adapt based on historical performance
    return {
      chunkSize: this.getOptimalChunkSize(metrics),
      maxMemoryUsage: this.getOptimalMemoryLimit(metrics),
      streamingThreshold: this.getOptimalThreshold(metrics)
    };
  }

  private getOptimalChunkSize(metrics: PerformanceMetrics): number {
    if (metrics.averageMemoryUsage > 40 * 1024 * 1024) {
      return 32 * 1024; // Reduce for memory efficiency
    }
    
    if (metrics.averageThroughput < 1024 * 1024) { // 1MB/s
      return 128 * 1024; // Increase for throughput
    }
    
    return 64 * 1024; // Default
  }

  private recordPerformance(context: string, performance: PerformanceRecord): void {
    const metrics = this.performanceMetrics.get(context) || {
      totalRequests: 0,
      successfulRequests: 0,
      averageThroughput: 0,
      averageMemoryUsage: 0,
      averageDuration: 0
    };
    
    metrics.totalRequests++;
    
    if (performance.success) {
      metrics.successfulRequests++;
      metrics.averageThroughput = this.updateAverage(
        metrics.averageThroughput,
        performance.throughput,
        metrics.successfulRequests
      );
      metrics.averageMemoryUsage = this.updateAverage(
        metrics.averageMemoryUsage,
        performance.memoryUsage,
        metrics.successfulRequests
      );
      metrics.averageDuration = this.updateAverage(
        metrics.averageDuration,
        performance.duration,
        metrics.successfulRequests
      );
    }
    
    this.performanceMetrics.set(context, metrics);
  }

  private updateAverage(current: number, newValue: number, count: number): number {
    return ((current * (count - 1)) + newValue) / count;
  }
}
```

### 3. Hybrid Pagination-Streaming

```typescript
class HybridPaginationStreaming {
  async getChangesWithHybridApproach(
    page: number,
    pageSize: number,
    includeLargeFiles: boolean = true
  ): Promise<HybridResult> {
    // First, get paginated list of changes
    const listUri = `changes://active?page=${page}&pageSize=${pageSize}`;
    const listResult = await mcpResource(listUri);
    const changesData = JSON.parse(listResult);
    
    // For each change, determine if streaming is needed
    const enhancedChanges = await Promise.all(
      changesData.changes.map(async (change: any) => {
        if (!includeLargeFiles) {
          return change;
        }
        
        // Check file sizes to determine streaming need
        const proposalSize = await this.getFileSize(change.slug, 'proposal');
        const tasksSize = await this.getFileSize(change.slug, 'tasks');
        
        const needsStreaming = proposalSize > 10 * 1024 * 1024 || 
                            tasksSize > 10 * 1024 * 1024;
        
        return {
          ...change,
          fileSizes: { proposal: proposalSize, tasks: tasksSize },
          needsStreaming,
          streamingAvailable: true
        };
      })
    );
    
    return {
      changes: enhancedChanges,
      pagination: {
        page: changesData.page || page,
        pageSize,
        total: changesData.total,
        hasNextPage: changesData.hasNextPage,
        nextPageToken: changesData.nextPageToken
      },
      streamingInfo: {
        threshold: 10 * 1024 * 1024,
        supportedFormats: ['proposal', 'tasks', 'specs']
      }
    };
  }

  async streamChangeFile(
    slug: string,
    filename: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<string> {
    const uri = `change://${slug}/${filename}`;
    
    // Check if streaming is beneficial
    const fileSize = await this.getFileSize(slug, filename);
    
    if (fileSize > 10 * 1024 * 1024) {
      // Use streaming for large files
      return await mcpResourceWithProgress(uri, onProgress);
    } else {
      // Use regular access for small files
      return await mcpResource(uri);
    }
  }

  private async getFileSize(slug: string, filename: string): Promise<number> {
    try {
      const uri = `change://${slug}/${filename}`;
      const metadata = await mcpResource(`${uri}?metadata=true`);
      const data = JSON.parse(metadata);
      return data.size || 0;
    } catch {
      return 0;
    }
  }
}
```

---

*This guide provides comprehensive patterns for implementing efficient pagination and streaming in IDE integrations. For specific platform details, see the main IDE Integration Guide.*