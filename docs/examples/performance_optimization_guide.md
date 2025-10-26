# Performance Optimization Guide

_Best practices for optimizing pagination and streaming performance in IDE integrations_

Last updated: 2025-10-24

## Table of Contents

1. [Performance Fundamentals](#performance-fundamentals)
2. [Pagination Optimization](#pagination-optimization)
3. [Streaming Optimization](#streaming-optimization)
4. [Memory Management](#memory-management)
5. [Network Optimization](#network-optimization)
6. [Monitoring & Profiling](#monitoring--profiling)
7. [Platform-Specific Optimizations](#platform-specific-optimizations)

---

## Performance Fundamentals

### Key Performance Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Pagination Load Time** | < 500ms | Time from request to first byte |
| **Streaming Throughput** | > 1MB/s | Bytes per second during streaming |
| **Memory Usage** | < 50MB | Peak memory per operation |
| **UI Responsiveness** | < 100ms | UI thread blocking time |
| **Cache Hit Rate** | > 80% | Cache effectiveness |

### Performance Budgets

```typescript
const PERFORMANCE_BUDGETS = {
  pagination: {
    maxLoadTime: 500,        // ms
    maxMemoryUsage: 10 * 1024 * 1024, // 10MB
    maxCacheSize: 100 * 1024 * 1024   // 100MB
  },
  streaming: {
    maxMemoryUsage: 50 * 1024 * 1024,  // 50MB
    minThroughput: 1024 * 1024,          // 1MB/s
    maxChunkTime: 2000,                   // 2s per chunk
    chunkSize: 64 * 1024                  // 64KB
  },
  ui: {
    maxBlockingTime: 100,       // ms
    maxUpdateTime: 16,          // 60fps
    maxProgressUpdateDelay: 200 // ms
  }
};
```

### Performance Monitoring Setup

```typescript
class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric[]>();
  private observers: PerformanceObserver[] = [];

  startMonitoring(): void {
    // Monitor pagination performance
    this.observeOperation('pagination', (metric) => {
      this.validatePaginationPerformance(metric);
    });

    // Monitor streaming performance
    this.observeOperation('streaming', (metric) => {
      this.validateStreamingPerformance(metric);
    });

    // Monitor memory usage
    this.observeMemory();
  }

  private validatePaginationPerformance(metric: PerformanceMetric): void {
    if (metric.duration > PERFORMANCE_BUDGETS.pagination.maxLoadTime) {
      console.warn(`Pagination slow: ${metric.duration}ms > ${PERFORMANCE_BUDGETS.pagination.maxLoadTime}ms`);
      this.suggestPaginationOptimizations(metric);
    }
  }

  private validateStreamingPerformance(metric: PerformanceMetric): void {
    if (metric.memoryUsage > PERFORMANCE_BUDGETS.streaming.maxMemoryUsage) {
      console.warn(`Streaming memory high: ${metric.memoryUsage} bytes`);
      this.suggestStreamingOptimizations(metric);
    }

    if (metric.throughput < PERFORMANCE_BUDGETS.streaming.minThroughput) {
      console.warn(`Streaming throughput low: ${metric.throughput} bytes/s`);
    }
  }
}
```

---

## Pagination Optimization

### 1. Intelligent Page Size Selection

```typescript
class PageSizeOptimizer {
  private performanceHistory = new Map<number, PagePerformance>();
  private readonly TEST_SIZES = [10, 20, 50, 100, 200];

  async findOptimalPageSize(context: string): Promise<number> {
    const contextKey = `${context}-${Date.now()}`;
    
    // Test different page sizes
    for (const size of this.TEST_SIZES) {
      const performance = await this.testPageSize(size);
      this.performanceHistory.set(size, performance);
      
      // Early termination if performance degrades significantly
      if (performance.averageTime > 2000) { // 2 seconds
        break;
      }
    }

    return this.selectOptimalSize();
  }

  private async testPageSize(pageSize: number): Promise<PagePerformance> {
    const times: number[] = [];
    
    // Test multiple times for accuracy
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await mcpResource(`changes://active?page=1&pageSize=${pageSize}`);
      times.push(performance.now() - start);
    }

    const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
    
    return {
      pageSize,
      averageTime,
      timePerItem: averageTime / pageSize,
      memoryUsage: await this.measureMemoryUsage(pageSize)
    };
  }

  private selectOptimalSize(): number {
    const performances = Array.from(this.performanceHistory.values());
    
    // Find best time per item
    const bestTimePerItem = Math.min(...performances.map(p => p.timePerItem));
    const candidates = performances.filter(p => p.timePerItem <= bestTimePerItem * 1.1);
    
    // Among candidates, prefer larger page sizes for efficiency
    return candidates.reduce((best, current) => 
      current.pageSize > best.pageSize ? current : best
    ).pageSize;
  }
}
```

### 2. Smart Caching Strategies

```typescript
class SmartPaginationCache {
  private cache = new Map<string, CacheEntry>();
  private accessPattern = new Map<string, AccessPattern>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async get(page: number, pageSize: number, context: string): Promise<any | null> {
    const key = this.buildKey(page, pageSize, context);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    // Update access pattern
    this.updateAccessPattern(context, page);
    
    // Promote frequently accessed items
    if (entry.accessCount > 5) {
      entry.ttl = this.CACHE_TTL * 2; // Extend TTL for popular items
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    return entry.data;
  }

  async set(page: number, pageSize: number, context: string, data: any): Promise<void> {
    const key = this.buildKey(page, pageSize, context);
    
    // Implement LRU eviction if cache is full
    if (this.cache.size >= 50) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
      ttl: this.CACHE_TTL,
      size: this.estimateSize(data)
    });

    // Prefetch based on access pattern
    this.schedulePrefetch(page, pageSize, context);
  }

  private schedulePrefetch(currentPage: number, pageSize: number, context: string): void {
    const pattern = this.accessPattern.get(context);
    if (!pattern) return;

    // Detect sequential access pattern
    const isSequential = pattern.recentPages.every((page, index) => 
      index === 0 || page === pattern.recentPages[index - 1] + 1
    );

    if (isSequential && pattern.recentPages.length >= 3) {
      // Prefetch next 2 pages
      for (let offset = 1; offset <= 2; offset++) {
        const nextPage = currentPage + offset;
        const prefetchKey = this.buildKey(nextPage, pageSize, context);
        
        if (!this.cache.has(prefetchKey)) {
          setTimeout(() => this.prefetchPage(nextPage, pageSize, context), offset * 100);
        }
      }
    }
  }

  private async prefetchPage(page: number, pageSize: number, context: string): Promise<void> {
    try {
      const uri = `changes://active?page=${page}&pageSize=${pageSize}`;
      const result = await mcpResource(uri);
      const data = JSON.parse(result);
      
      this.set(page, pageSize, context, data);
    } catch (error) {
      // Silent fail for prefetch
      console.debug(`Prefetch failed for page ${page}:`, error);
    }
  }
}
```

### 3. Virtual Scrolling Implementation

```typescript
class VirtualScrollingPagination {
  private itemHeight = 40; // pixels
  private visibleItems = 20;
  private bufferItems = 10;
  private totalItems = 0;
  private loadedPages = new Map<number, any[]>();

  async initialize(totalItems: number): Promise<void> {
    this.totalItems = totalItems;
    await this.loadInitialPages();
  }

  async getVisibleItems(scrollTop: number): Promise<any[]> {
    const startIndex = Math.floor(scrollTop / this.itemHeight);
    const endIndex = Math.min(startIndex + this.visibleItems, this.totalItems - 1);
    
    // Calculate page range needed
    const startPage = Math.floor(startIndex / 50) + 1;
    const endPage = Math.floor(endIndex / 50) + 1;
    
    // Load required pages
    await this.loadPageRange(startPage, endPage);
    
    // Extract visible items
    return this.extractItemsFromRange(startIndex, endIndex);
  }

  private async loadPageRange(startPage: number, endPage: number): Promise<void> {
    const loadPromises: Promise<void>[] = [];
    
    for (let page = startPage; page <= endPage; page++) {
      if (!this.loadedPages.has(page)) {
        loadPromises.push(this.loadPage(page));
      }
    }
    
    await Promise.all(loadPromises);
  }

  private async loadPage(page: number): Promise<void> {
    const uri = `changes://active?page=${page}&pageSize=50`;
    const result = await mcpResource(uri);
    const data = JSON.parse(result);
    
    this.loadedPages.set(page, data.changes);
    
    // Implement LRU for loaded pages
    if (this.loadedPages.size > 10) {
      const oldestPage = Math.min(...this.loadedPages.keys());
      this.loadedPages.delete(oldestPage);
    }
  }

  private extractItemsFromRange(startIndex: number, endIndex: number): any[] {
    const items: any[] = [];
    
    for (let i = startIndex; i <= endIndex; i++) {
      const page = Math.floor(i / 50) + 1;
      const indexInPage = i % 50;
      const pageData = this.loadedPages.get(page);
      
      if (pageData && pageData[indexInPage]) {
        items.push(pageData[indexInPage]);
      }
    }
    
    return items;
  }

  getTotalHeight(): number {
    return this.totalItems * this.itemHeight;
  }
}
```

---

## Streaming Optimization

### 1. Adaptive Chunking

```typescript
class AdaptiveChunking {
  private performanceMetrics = new Map<string, ChunkPerformance[]>();
  private readonly MIN_CHUNK_SIZE = 4 * 1024;    // 4KB
  private readonly MAX_CHUNK_SIZE = 1024 * 1024; // 1MB

  async getOptimalChunkSize(
    fileSize: number,
    networkSpeed: number,
    context: string
  ): Promise<number> {
    const contextKey = `${context}-${fileSize}`;
    const history = this.performanceMetrics.get(contextKey) || [];
    
    if (history.length >= 3) {
      // Use historical performance
      return this.calculateOptimalSizeFromHistory(history);
    }

    // Calculate based on network and file characteristics
    return this.calculateBaseChunkSize(fileSize, networkSpeed);
  }

  private calculateBaseChunkSize(fileSize: number, networkSpeed: number): number {
    // Base size on file size (larger files = larger chunks)
    let chunkSize = Math.min(fileSize / 100, this.MAX_CHUNK_SIZE);
    
    // Adjust for network speed
    const networkFactor = Math.min(networkSpeed / 1_000_000, 5); // Max 5x
    chunkSize *= networkFactor;
    
    // Ensure within bounds
    return Math.max(Math.min(chunkSize, this.MAX_CHUNK_SIZE), this.MIN_CHUNK_SIZE);
  }

  private calculateOptimalSizeFromHistory(history: ChunkPerformance[]): number {
    // Find chunk size with best throughput
    const bestPerformance = history.reduce((best, current) => 
      current.throughput > best.throughput ? current : best
    );

    // Apply learning factor (gradual optimization)
    const learningFactor = 0.1;
    const adjustment = 1 + (Math.random() - 0.5) * learningFactor;
    
    return Math.max(
      Math.min(bestPerformance.chunkSize * adjustment, this.MAX_CHUNK_SIZE),
      this.MIN_CHUNK_SIZE
    );
  }

  recordPerformance(
    chunkSize: number,
    duration: number,
    bytesTransferred: number,
    context: string
  ): void {
    const throughput = bytesTransferred / duration;
    const contextKey = `${context}-${bytesTransferred}`;
    
    const history = this.performanceMetrics.get(contextKey) || [];
    history.push({
      chunkSize,
      duration,
      throughput,
      timestamp: Date.now()
    });

    // Keep only recent performance data
    if (history.length > 10) {
      history.shift();
    }

    this.performanceMetrics.set(contextKey, history);
  }
}
```

### 2. Progressive Loading

```typescript
class ProgressiveStreaming {
  async streamWithProgressiveLoading(
    uri: string,
    onProgress?: (progress: StreamingProgress) => void,
    onPartialData?: (data: string) => void
  ): Promise<string> {
    const chunks: string[] = [];
    let totalBytes = 0;
    let receivedBytes = 0;

    // Get file metadata first
    const metadata = await this.getFileMetadata(uri);
    totalBytes = metadata.size;

    // Start streaming with progressive callbacks
    const progressCallback = (progress: StreamingProgress) => {
      receivedBytes = progress.bytesRead;
      
      // Provide progress updates
      if (onProgress) {
        onProgress(progress);
      }

      // Provide partial data for preview
      if (onPartialData && chunks.length > 0) {
        const partialContent = chunks.join('');
        onPartialData(partialContent);
      }
    };

    const chunkCallback = (chunk: string) => {
      chunks.push(chunk);
    };

    // Stream with both callbacks
    const result = await this.streamWithCallbacks(uri, progressCallback, chunkCallback);
    
    return result;
  }

  private async streamWithCallbacks(
    uri: string,
    onProgress: (progress: StreamingProgress) => void,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    // Implementation would depend on the MCP client capabilities
    // This is a conceptual example
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      let bytesRead = 0;
      let totalBytes = 0;

      // Simulate streaming with chunk callbacks
      const stream = mcpCreateStream(uri);
      
      stream.on('metadata', (metadata) => {
        totalBytes = metadata.size;
      });

      stream.on('chunk', (chunk) => {
        chunks.push(chunk);
        bytesRead += chunk.length;
        onChunk(chunk);

        const progress: StreamingProgress = {
          bytesRead,
          totalBytes,
          percentage: (bytesRead / totalBytes) * 100,
          chunkNumber: chunks.length,
          totalChunks: Math.ceil(totalBytes / (64 * 1024)),
          memoryUsage: this.estimateMemoryUsage(chunks)
        };

        onProgress(progress);
      });

      stream.on('end', () => {
        resolve(chunks.join(''));
      });

      stream.on('error', reject);
    });
  }

  private estimateMemoryUsage(chunks: string[]): number {
    return chunks.reduce((total, chunk) => total + chunk.length * 2, 0); // UTF-16
  }
}
```

### 3. Compression Integration

```typescript
class CompressedStreaming {
  async streamWithCompression(
    uri: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<string> {
    // Check if compression is beneficial
    const shouldCompress = await this.shouldUseCompression(uri);
    
    if (shouldCompress) {
      return this.streamCompressed(uri, onProgress);
    } else {
      return mcpResourceWithProgress(uri, onProgress);
    }
  }

  private async shouldUseCompression(uri: string): Promise<boolean> {
    try {
      // Check file type and size
      const metadata = await this.getFileMetadata(uri);
      
      // Compress text files larger than 1MB
      const isTextFile = this.isTextFile(uri);
      const isLargeFile = metadata.size > 1024 * 1024;
      
      return isTextFile && isLargeFile;
    } catch {
      return false;
    }
  }

  private async streamCompressed(
    uri: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<string> {
    const compressedUri = `${uri}&compression=gzip`;
    
    // Track compression ratio
    let compressedBytes = 0;
    let totalBytes = 0;

    const progressCallback = (progress: StreamingProgress) => {
      compressedBytes = progress.bytesRead;
      
      if (onProgress) {
        // Adjust progress for decompressed size
        const adjustedProgress = {
          ...progress,
          bytesRead: Math.round(compressedBytes * this.estimatedCompressionRatio),
          totalBytes: Math.round(progress.totalBytes * this.estimatedCompressionRatio)
        };
        onProgress(adjustedProgress);
      }
    };

    const compressedContent = await mcpResourceWithProgress(compressedUri, progressCallback);
    
    // Decompress on client side
    return await this.decompressContent(compressedContent);
  }

  private get estimatedCompressionRatio(): number {
    return 3.5; // Typical text compression ratio
  }

  private async decompressContent(compressedContent: string): Promise<string> {
    // Use browser's DecompressionStream or Node.js zlib
    if (typeof DecompressionStream !== 'undefined') {
      const stream = new DecompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      
      writer.write(new TextEncoder().encode(compressedContent));
      writer.close();
      
      const chunks: Uint8Array[] = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) chunks.push(value);
      }
      
      const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }
      
      return new TextDecoder().decode(decompressed);
    } else {
      // Node.js fallback
      const zlib = await import('zlib');
      return zlib.gunzipSync(Buffer.from(compressedContent)).toString();
    }
  }
}
```

---

## Memory Management

### 1. Memory Pool Implementation

```typescript
class MemoryPool {
  private pools: Map<number, Buffer[]> = new Map();
  private readonly POOL_SIZES = [1024, 4096, 16384, 65536]; // 1KB, 4KB, 16KB, 64KB
  private readonly MAX_POOL_SIZE = 50;

  getBuffer(size: number): Buffer {
    const poolSize = this.findPoolSize(size);
    let pool = this.pools.get(poolSize);
    
    if (!pool) {
      pool = [];
      this.pools.set(poolSize, pool);
    }
    
    const buffer = pool.pop() || Buffer.allocUnsafe(poolSize);
    return buffer.slice(0, size); // Return exact size requested
  }

  releaseBuffer(buffer: Buffer): void {
    const poolSize = this.findPoolSize(buffer.length);
    let pool = this.pools.get(poolSize);
    
    if (!pool) {
      pool = [];
      this.pools.set(poolSize, pool);
    }
    
    if (pool.length < this.MAX_POOL_SIZE) {
      // Clear buffer for security
      buffer.fill(0);
      pool.push(buffer);
    }
  }

  private findPoolSize(requestedSize: number): number {
    return this.POOL_SIZES.find(size => size >= requestedSize) || 
           this.POOL_SIZES[this.POOL_SIZES.length - 1];
  }

  getPoolStats(): PoolStats {
    const stats: PoolStats = {};
    
    for (const [size, pool] of this.pools.entries()) {
      stats[size] = {
        available: pool.length,
        allocated: this.MAX_POOL_SIZE - pool.length,
        totalAllocated: this.MAX_POOL_SIZE
      };
    }
    
    return stats;
  }
}
```

### 2. Memory Usage Monitoring

```typescript
class MemoryMonitor {
  private memoryHistory: MemorySnapshot[] = [];
  private readonly MAX_HISTORY = 100;
  private readonly WARNING_THRESHOLD = 40 * 1024 * 1024; // 40MB
  private readonly CRITICAL_THRESHOLD = 45 * 1024 * 1024; // 45MB

  startMonitoring(intervalMs: number = 1000): void {
    setInterval(() => {
      this.recordSnapshot();
      this.checkThresholds();
    }, intervalMs);
  }

  private recordSnapshot(): void {
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
      rss: process.memoryUsage().rss
    };

    this.memoryHistory.push(snapshot);
    
    if (this.memoryHistory.length > this.MAX_HISTORY) {
      this.memoryHistory.shift();
    }
  }

  private checkThresholds(): void {
    const current = process.memoryUsage().heapUsed;
    
    if (current > this.CRITICAL_THRESHOLD) {
      this.handleCriticalMemory();
    } else if (current > this.WARNING_THRESHOLD) {
      this.handleWarningMemory();
    }
  }

  private handleCriticalMemory(): void {
    console.error('Critical memory usage detected');
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    // Clear caches
    this.clearCaches();
    
    // Notify components to reduce memory usage
    this.emit('critical-memory');
  }

  private handleWarningMemory(): void {
    console.warn('High memory usage detected');
    
    // Suggest garbage collection
    setTimeout(() => {
      if (global.gc) {
        global.gc();
      }
    }, 0);
    
    this.emit('warning-memory');
  }

  getMemoryTrend(): MemoryTrend {
    if (this.memoryHistory.length < 2) {
      return 'stable';
    }

    const recent = this.memoryHistory.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];
    
    const change = last.heapUsed - first.heapUsed;
    const changeRate = change / (last.timestamp - first.timestamp);
    
    if (changeRate > 1024 * 1024) { // > 1MB/s increase
      return 'increasing';
    } else if (changeRate < -1024 * 1024) { // < -1MB/s decrease
      return 'decreasing';
    } else {
      return 'stable';
    }
  }

  getMemoryReport(): MemoryReport {
    const current = process.memoryUsage();
    const trend = this.getMemoryTrend();
    
    return {
      current: {
        heapUsed: current.heapUsed,
        heapTotal: current.heapTotal,
        external: current.external,
        rss: current.rss
      },
      trend,
      history: this.memoryHistory.slice(-20), // Last 20 snapshots
      recommendations: this.generateRecommendations(current, trend)
    };
  }

  private generateRecommendations(current: NodeJS.MemoryUsage, trend: MemoryTrend): string[] {
    const recommendations: string[] = [];
    
    if (current.heapUsed > this.WARNING_THRESHOLD) {
      recommendations.push('Consider reducing page size or chunk size');
      recommendations.push('Clear unused caches');
    }
    
    if (trend === 'increasing') {
      recommendations.push('Memory usage is trending upward - investigate potential leaks');
      recommendations.push('Consider implementing more aggressive cache eviction');
    }
    
    const heapUtilization = current.heapUsed / current.heapTotal;
    if (heapUtilization > 0.9) {
      recommendations.push('Heap utilization is high - consider increasing heap size');
    }
    
    return recommendations;
  }
}
```

### 3. Cache Eviction Strategies

```typescript
class SmartCacheEviction {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
  private currentCacheSize = 0;

  set(key: string, value: any, ttl: number = 300000): void { // 5 minutes default
    const size = this.estimateSize(value);
    
    // Check if eviction is needed
    while (this.currentCacheSize + size > this.MAX_CACHE_SIZE) {
      this.evictItem();
    }

    // Remove existing entry if present
    this.delete(key);
    
    // Add new entry
    const entry: CacheEntry = {
      value,
      timestamp: Date.now(),
      ttl,
      size,
      accessCount: 1,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
    this.accessOrder.push(key);
    this.currentCacheSize += size;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      return null;
    }

    // Update access information
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    // Move to end of access order (LRU)
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }

    return entry.value;
  }

  private evictItem(): void {
    if (this.accessOrder.length === 0) return;

    // Use weighted scoring for eviction
    const candidates = this.accessOrder.map(key => ({
      key,
      score: this.calculateEvictionScore(this.cache.get(key)!)
    }));

    // Sort by score (lower score = better eviction candidate)
    candidates.sort((a, b) => a.score - b.score);
    
    // Evict the best candidate
    const evictKey = candidates[0].key;
    this.delete(evictKey);
  }

  private calculateEvictionScore(entry: CacheEntry): number {
    const now = Date.now();
    const age = now - entry.timestamp;
    const timeSinceAccess = now - entry.lastAccessed;
    
    // Lower score is better for eviction
    // Consider: age, access frequency, recent access, size
    const accessFrequency = entry.accessCount / (age / 1000); // accesses per second
    const recencyFactor = timeSinceAccess / age; // 0 = recently accessed, 1 = long ago
    const sizeFactor = entry.size / (1024 * 1024); // size in MB
    
    return (1 / accessFrequency) * recencyFactor * sizeFactor;
  }

  private delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentCacheSize -= entry.size;
      this.cache.delete(key);
      
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
  }

  private estimateSize(value: any): number {
    // Rough estimation - in practice, use a more sophisticated method
    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    } else if (typeof value === 'object') {
      return JSON.stringify(value).length * 2;
    } else {
      return 8; // Basic types
    }
  }
}
```

---

## Network Optimization

### 1. Request Batching

```typescript
class RequestBatcher {
  private batchQueue: BatchRequest[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 50; // ms
  private readonly MAX_BATCH_SIZE = 10;

  async batchRequest(request: BatchRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const batchRequest: BatchRequest = {
        ...request,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.batchQueue.push(batchRequest);
      
      // Trigger batch processing
      this.scheduleBatchProcessing();
    });
  }

  private scheduleBatchProcessing(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);

    // Process immediately if batch is full
    if (this.batchQueue.length >= this.MAX_BATCH_SIZE) {
      this.processBatch();
    }
  }

  private async processBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, this.MAX_BATCH_SIZE);
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      // Group requests by type
      const groupedRequests = this.groupRequestsByType(batch);
      
      // Execute grouped requests
      const results = await this.executeBatchedRequests(groupedRequests);
      
      // Resolve individual promises
      this.resolveBatch(batch, results);
      
    } catch (error) {
      // Reject all requests in batch
      batch.forEach(request => {
        request.reject(error);
      });
    }
  }

  private groupRequestsByType(requests: BatchRequest[]): Map<string, BatchRequest[]> {
    const groups = new Map<string, BatchRequest[]>();
    
    for (const request of requests) {
      const type = this.getRequestType(request);
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(request);
    }
    
    return groups;
  }

  private async executeBatchedRequests(groups: Map<string, BatchRequest[]>): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();
    
    for (const [type, requests] of groups) {
      if (type === 'pagination') {
        const batchResults = await this.executeBatchedPagination(requests);
        results.set(type, batchResults);
      } else if (type === 'streaming') {
        const batchResults = await this.executeBatchedStreaming(requests);
        results.set(type, batchResults);
      }
    }
    
    return results;
  }

  private async executeBatchedPagination(requests: BatchRequest[]): Promise<any[]> {
    // Combine pagination requests where possible
    const optimizedRequests = this.optimizePaginationRequests(requests);
    
    const results = await Promise.all(
      optimizedRequests.map(async (req) => {
        const uri = `changes://active?page=${req.page}&pageSize=${req.pageSize}`;
        return mcpResource(uri);
      })
    );
    
    return results;
  }

  private optimizePaginationRequests(requests: BatchRequest[]): BatchRequest[] {
    // Find requests that can be combined
    const optimized: BatchRequest[] = [];
    const processed = new Set<BatchRequest>();
    
    for (const request of requests) {
      if (processed.has(request)) continue;
      
      // Look for adjacent page requests
      const adjacent = requests.filter(r => 
        !processed.has(r) &&
        r.pageSize === request.pageSize &&
        Math.abs(r.page - request.page) <= 2
      );
      
      if (adjacent.length > 1) {
        // Combine into a single larger request
        const minPage = Math.min(...adjacent.map(r => r.page));
        const maxPage = Math.max(...adjacent.map(r => r.page));
        const combinedPageSize = (maxPage - minPage + 1) * request.pageSize;
        
        optimized.push({
          ...request,
          page: minPage,
          pageSize: combinedPageSize,
          isCombined: true,
          originalRequests: adjacent
        });
        
        adjacent.forEach(r => processed.add(r));
      } else {
        optimized.push(request);
        processed.add(request);
      }
    }
    
    return optimized;
  }
}
```

### 2. Connection Pooling

```typescript
class ConnectionPool {
  private connections: Map<string, PooledConnection[]> = new Map();
  private readonly MAX_CONNECTIONS_PER_HOST = 5;
  private readonly CONNECTION_TIMEOUT = 30000; // 30 seconds
  private readonly IDLE_TIMEOUT = 60000; // 1 minute

  async getConnection(host: string): Promise<PooledConnection> {
    const pool = this.connections.get(host) || [];
    const connections = this.connections.get(host)!;
    
    // Find available connection
    const availableConnection = connections.find(conn => 
      conn.isAvailable && !conn.isExpired()
    );
    
    if (availableConnection) {
      availableConnection.isAvailable = false;
      availableConnection.lastUsed = Date.now();
      return availableConnection;
    }
    
    // Create new connection if under limit
    if (connections.length < this.MAX_CONNECTIONS_PER_HOST) {
      const newConnection = await this.createConnection(host);
      connections.push(newConnection);
      this.connections.set(host, connections);
      return newConnection;
    }
    
    // Wait for available connection
    return this.waitForAvailableConnection(host);
  }

  releaseConnection(connection: PooledConnection): void {
    connection.isAvailable = true;
    connection.lastUsed = Date.now();
  }

  private async createConnection(host: string): Promise<PooledConnection> {
    // Implementation depends on the MCP client
    const connection = await mcpCreateConnection(host);
    
    return {
      connection,
      host,
      created: Date.now(),
      lastUsed: Date.now(),
      isAvailable: false,
      isExpired: () => Date.now() - this.created > this.CONNECTION_TIMEOUT,
      close: () => connection.close()
    };
  }

  private async waitForAvailableConnection(host: string): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const connections = this.connections.get(host) || [];
        const available = connections.find(conn => conn.isAvailable && !conn.isExpired());
        
        if (available) {
          clearInterval(checkInterval);
          available.isAvailable = false;
          available.lastUsed = Date.now();
          resolve(available);
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Connection pool timeout'));
      }, 5000);
    });
  }

  cleanup(): void {
    for (const [host, connections] of this.connections) {
      const activeConnections = connections.filter(conn => 
        !conn.isExpired() && (Date.now() - conn.lastUsed) < this.IDLE_TIMEOUT
      );
      
      // Close expired connections
      connections.forEach(conn => {
        if (conn.isExpired() || (Date.now() - conn.lastUsed) >= this.IDLE_TIMEOUT) {
          conn.close();
        }
      });
      
      if (activeConnections.length > 0) {
        this.connections.set(host, activeConnections);
      } else {
        this.connections.delete(host);
      }
    }
  }
}
```

### 3. Request Deduplication

```typescript
class RequestDeduplicator {
  private pendingRequests = new Map<string, Promise<any>>();
  private readonly REQUEST_TTL = 5000; // 5 seconds

  async deduplicateRequest<T>(
    key: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    // Check if request is already pending
    const existingRequest = this.pendingRequests.get(key);
    if (existingRequest) {
      return existingRequest as Promise<T>;
    }

    // Create new request
    const requestPromise = requestFn();
    
    // Store in pending requests
    this.pendingRequests.set(key, requestPromise);
    
    // Clean up after request completes
    requestPromise
      .finally(() => {
        // Remove after a short delay to handle rapid subsequent requests
        setTimeout(() => {
          this.pendingRequests.delete(key);
        }, 100);
      });

    // Auto-cleanup old requests
    setTimeout(() => {
      this.pendingRequests.delete(key);
    }, this.REQUEST_TTL);

    return requestPromise;
  }

  // Generate cache key for pagination requests
  generatePaginationKey(page: number, pageSize: number, filters?: any): string {
    const filterStr = filters ? JSON.stringify(filters) : '';
    return `pagination:${page}:${pageSize}:${filterStr}`;
  }

  // Generate cache key for streaming requests
  generateStreamingKey(uri: string, range?: { start: number, end: number }): string {
    const rangeStr = range ? `${range.start}-${range.end}` : 'full';
    return `streaming:${uri}:${rangeStr}`;
  }

  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }

  clearPendingRequests(): void {
    this.pendingRequests.clear();
  }
}
```

---

## Monitoring & Profiling

### 1. Performance Profiler

```typescript
class PerformanceProfiler {
  private profiles = new Map<string, ProfileData>();
  private observers: PerformanceObserver[] = [];

  startProfiling(operation: string): void {
    const profile: ProfileData = {
      operation,
      startTime: performance.now(),
      startMemory: process.memoryUsage().heapUsed,
      measurements: [],
      markers: []
    };

    this.profiles.set(operation, profile);

    // Set up performance observers
    this.setupObservers(operation);
  }

  endProfiling(operation: string): ProfileResult {
    const profile = this.profiles.get(operation);
    if (!profile) {
      throw new Error(`No active profile for operation: ${operation}`);
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const result: ProfileResult = {
      operation,
      duration: endTime - profile.startTime,
      memoryDelta: endMemory - profile.startMemory,
      measurements: profile.measurements,
      markers: profile.markers,
      recommendations: this.generateRecommendations(profile, endTime - profile.startTime)
    };

    this.profiles.delete(operation);
    this.cleanupObservers();

    return result;
  }

  addMeasurement(operation: string, name: string, value: number): void {
    const profile = this.profiles.get(operation);
    if (profile) {
      profile.measurements.push({
        name,
        value,
        timestamp: performance.now() - profile.startTime
      });
    }
  }

  addMarker(operation: string, name: string): void {
    const profile = this.profiles.get(operation);
    if (profile) {
      profile.markers.push({
        name,
        timestamp: performance.now() - profile.startTime
      });
    }
  }

  private generateRecommendations(profile: ProfileData, duration: number): string[] {
    const recommendations: string[] = [];
    
    // Duration-based recommendations
    if (duration > 1000) {
      recommendations.push('Consider implementing caching for slow operations');
    }
    
    if (duration > 5000) {
      recommendations.push('Operation is very slow - investigate for potential optimizations');
    }
    
    // Memory-based recommendations
    const memoryMeasurements = profile.measurements.filter(m => m.name.includes('memory'));
    if (memoryMeasurements.length > 0) {
      const maxMemory = Math.max(...memoryMeasurements.map(m => m.value));
      if (maxMemory > 50 * 1024 * 1024) { // 50MB
        recommendations.push('High memory usage detected - consider reducing chunk size');
      }
    }
    
    // Network-based recommendations
    const networkMeasurements = profile.measurements.filter(m => m.name.includes('network'));
    if (networkMeasurements.length > 0) {
      const avgNetworkTime = networkMeasurements.reduce((sum, m) => sum + m.value, 0) / networkMeasurements.length;
      if (avgNetworkTime > 2000) { // 2 seconds
        recommendations.push('Slow network performance - check connection and consider request batching');
      }
    }
    
    return recommendations;
  }

  getProfileSummary(): ProfileSummary {
    const summaries: ProfileSummary = {
      totalOperations: 0,
      averageDuration: 0,
      slowOperations: [],
      memoryIntensiveOperations: [],
      recentProfiles: []
    };

    // Implementation would aggregate historical profile data
    return summaries;
  }
}
```

### 2. Real-time Performance Dashboard

```typescript
class PerformanceDashboard {
  private metrics = new Map<string, MetricValue[]>();
  private alerts: PerformanceAlert[] = [];
  private readonly MAX_HISTORY = 100;

  startRealTimeMonitoring(): void {
    setInterval(() => {
      this.collectMetrics();
      this.checkAlerts();
      this.updateDashboard();
    }, 1000); // Update every second
  }

  private collectMetrics(): void {
    // Collect system metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.recordMetric('memory.heapUsed', memoryUsage.heapUsed);
    this.recordMetric('memory.heapTotal', memoryUsage.heapTotal);
    this.recordMetric('memory.external', memoryUsage.external);
    this.recordMetric('cpu.user', cpuUsage.user);
    this.recordMetric('cpu.system', cpuUsage.system);
    
    // Collect application metrics
    this.recordMetric('pagination.activeRequests', this.getActivePaginationRequests());
    this.recordMetric('streaming.activeStreams', this.getActiveStreamingCount());
    this.recordMetric('cache.hitRate', this.getCacheHitRate());
  }

  private checkAlerts(): void {
    const currentMemory = this.getLatestMetric('memory.heapUsed');
    if (currentMemory && currentMemory.value > 45 * 1024 * 1024) { // 45MB
      this.triggerAlert({
        type: 'memory',
        severity: 'warning',
        message: `High memory usage: ${Math.round(currentMemory.value / 1024 / 1024)}MB`,
        timestamp: Date.now()
      });
    }

    const currentCacheHitRate = this.getLatestMetric('cache.hitRate');
    if (currentCacheHitRate && currentCacheHitRate.value < 0.7) { // < 70%
      this.triggerAlert({
        type: 'cache',
        severity: 'warning',
        message: `Low cache hit rate: ${Math.round(currentCacheHitRate.value * 100)}%`,
        timestamp: Date.now()
      });
    }
  }

  private triggerAlert(alert: PerformanceAlert): void {
    // Avoid duplicate alerts
    const isDuplicate = this.alerts.some(existing => 
      existing.type === alert.type && 
      existing.message === alert.message &&
      (Date.now() - existing.timestamp) < 30000 // 30 seconds
    );

    if (!isDuplicate) {
      this.alerts.push(alert);
      this.notifyAlert(alert);
    }

    // Clean old alerts
    this.alerts = this.alerts.filter(a => Date.now() - a.timestamp < 300000); // 5 minutes
  }

  private notifyAlert(alert: PerformanceAlert): void {
    // Send to monitoring system, log, or UI
    console.warn(`Performance Alert [${alert.severity}]: ${alert.message}`);
    
    // Could also send to external monitoring
    if (alert.severity === 'critical') {
      this.sendCriticalNotification(alert);
    }
  }

  getDashboardData(): DashboardData {
    return {
      metrics: this.getLatestMetrics(),
      alerts: this.alerts.slice(-10), // Last 10 alerts
      trends: this.calculateTrends(),
      recommendations: this.generateRealTimeRecommendations()
    };
  }

  private calculateTrends(): MetricTrend[] {
    const trends: MetricTrend[] = [];
    
    for (const [metric, values] of this.metrics) {
      if (values.length < 2) continue;
      
      const recent = values.slice(-10); // Last 10 data points
      const older = values.slice(-20, -10); // Previous 10 data points
      
      if (recent.length >= 5 && older.length >= 5) {
        const recentAvg = recent.reduce((sum, v) => sum + v.value, 0) / recent.length;
        const olderAvg = older.reduce((sum, v) => sum + v.value, 0) / older.length;
        
        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        trends.push({
          metric,
          trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
          changePercent: change
        });
      }
    }
    
    return trends;
  }

  private generateRealTimeRecommendations(): string[] {
    const recommendations: string[] = [];
    const latestMetrics = this.getLatestMetrics();
    
    const memoryUsage = latestMetrics.get('memory.heapUsed');
    if (memoryUsage && memoryUsage.value > 40 * 1024 * 1024) {
      recommendations.push('Consider reducing cache sizes or page sizes to lower memory usage');
    }
    
    const cacheHitRate = latestMetrics.get('cache.hitRate');
    if (cacheHitRate && cacheHitRate.value < 0.8) {
      recommendations.push('Cache hit rate is low - review caching strategy');
    }
    
    const activeRequests = latestMetrics.get('pagination.activeRequests');
    if (activeRequests && activeRequests.value > 10) {
      recommendations.push('High number of concurrent requests - consider request batching');
    }
    
    return recommendations;
  }

  private recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push({
      value,
      timestamp: Date.now()
    });
    
    // Keep only recent values
    if (values.length > this.MAX_HISTORY) {
      values.shift();
    }
  }

  private getLatestMetric(name: string): MetricValue | undefined {
    const values = this.metrics.get(name);
    return values && values.length > 0 ? values[values.length - 1] : undefined;
  }

  private getLatestMetrics(): Map<string, MetricValue> {
    const latest = new Map<string, MetricValue>();
    
    for (const [name, values] of this.metrics) {
      if (values.length > 0) {
        latest.set(name, values[values.length - 1]);
      }
    }
    
    return latest;
  }
}
```

---

## Platform-Specific Optimizations

### VS Code Optimizations

```typescript
class VSCodePerformanceOptimizer {
  private disposables: vscode.Disposable[] = [];

  optimizeForVSCode(): void {
    this.setupFileWatcherOptimizations();
    this.setupProgressReporting();
    this.setupMemoryManagement();
  }

  private setupFileWatcherOptimizations(): void {
    // Debounce file system events
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/openspec/changes/**',
      this.debounceFileChange.bind(this),
      this.debounceFileChange.bind(this),
      this.debounceFileDelete.bind(this)
    );

    this.disposables.push(fileWatcher);
  }

  private debounceFileChange = debounce((uri: vscode.Uri) => {
    // Handle file change with debouncing
    this.handleFileChange(uri);
  }, 500);

  private setupProgressReporting(): void {
    // Use VS Code's progress API for better UX
    vscode.commands.registerCommand('openspec.paginateWithProgress', async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Loading changes...',
        cancellable: true
      }, async (progress, token) => {
        return this.loadChangesWithProgress(progress, token);
      });
    });
  }

  private setupMemoryManagement(): void {
    // Monitor VS Code memory usage
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      
      if (memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
        vscode.window.showWarningMessage(
          'High memory usage detected. Consider restarting VS Code.',
          'Restart'
        ).then(selection => {
          if (selection === 'Restart') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
      }
    }, 30000); // Check every 30 seconds
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
```

### JetBrains Optimizations

```kotlin
class JetBrainsPerformanceOptimizer {
    private val memoryMonitor = MemoryMonitor()
    private val connectionPool = ConnectionPool()

    fun optimizeForJetBrains() {
        setupEdtOptimizations()
        setupMemoryOptimizations()
        setupConnectionOptimizations()
    }

    private fun setupEdtOptimizations() {
        // Ensure UI operations run on EDT
        ApplicationManager.getApplication().invokeLater {
            // UI updates here
        }
        
        // Use background threads for heavy operations
        ProgressManager.getInstance().run(object : Task.Backgroundable {
            override fun run(indicator: ProgressIndicator) {
                // Heavy operations here
            }
            
            override fun onSuccess() {
                // Update UI on EDT
                ApplicationManager.getApplication().invokeLater {
                    // UI updates
                }
            }
        })
    }

    private fun setupMemoryOptimizations() {
        // Monitor memory usage
        memoryMonitor.startMonitoring()
        
        memoryMonitor.onMemoryWarning { memoryUsage ->
            // Suggest garbage collection
            System.gc()
            
            // Notify user
            Notifications.Bus.notify(
                Notification(
                    "OpenSpec Memory Warning",
                    "High memory usage detected. Consider reducing cache sizes.",
                    NotificationType.WARNING
                )
            )
        }
    }

    private fun setupConnectionOptimizations() {
        // Use connection pooling for MCP requests
        connectionPool.setMaxConnectionsPerHost(3)
        connectionPool.setConnectionTimeout(30000)
    }
}
```

---

*This guide provides comprehensive performance optimization strategies for pagination and streaming in IDE integrations. For implementation details, see the main IDE Integration Guide.*