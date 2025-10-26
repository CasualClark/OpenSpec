# Pagination & Streaming Troubleshooting Guide

_Comprehensive troubleshooting for pagination and streaming issues in IDE integrations_

Last updated: 2025-10-24

## Table of Contents

1. [Quick Diagnosis](#quick-diagnosis)
2. [Pagination Issues](#pagination-issues)
3. [Streaming Issues](#streaming-issues)
4. [Performance Issues](#performance-issues)
5. [Network Issues](#network-issues)
6. [Memory Issues](#memory-issues)
7. [Platform-Specific Issues](#platform-specific-issues)
8. [Debug Tools](#debug-tools)

---

## Quick Diagnosis

### Self-Diagnosis Checklist

```typescript
async function quickDiagnosis(): Promise<DiagnosisResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Test basic connectivity
  try {
    await mcpResource('changes://active?page=1&pageSize=1');
  } catch (error) {
    issues.push(`Basic connectivity failed: ${error.message}`);
    recommendations.push('Check MCP server is running and accessible');
  }
  
  // Test pagination
  try {
    const result = await mcpResource('changes://active?page=1&pageSize=10');
    const data = JSON.parse(result);
    
    if (!data.changes || !Array.isArray(data.changes)) {
      issues.push('Invalid pagination response format');
      recommendations.push('Check Task MCP server version (requires v2.1.0+)');
    }
  } catch (error) {
    issues.push(`Pagination test failed: ${error.message}`);
    recommendations.push('Verify pagination parameters are valid');
  }
  
  // Test streaming
  try {
    const result = await mcpResource('change://test/proposal');
    // Success indicates streaming is working
  } catch (error) {
    if (error.message.includes('STREAMING_ERROR')) {
      issues.push(`Streaming test failed: ${error.message}`);
      recommendations.push('Check streaming configuration and memory limits');
    }
  }
  
  // Check memory usage
  const memoryUsage = process.memoryUsage();
  if (memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
    issues.push(`High memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    recommendations.push('Reduce cache sizes or restart IDE');
  }
  
  return {
    issues,
    recommendations,
    severity: issues.length > 2 ? 'high' : issues.length > 0 ? 'medium' : 'low'
  };
}
```

### Common Symptoms and Causes

| Symptom | Common Causes | Quick Fix |
|---------|----------------|------------|
| **Pagination loads slowly** | Large page size, slow disk, network latency | Reduce page size to 20-50 |
| **Empty pagination results** | Invalid parameters, no changes, permission errors | Check page ≥ 1, verify directory exists |
| **Streaming fails on large files** | Memory limits, timeout, file corruption | Increase memory limit, check file integrity |
| **Progress not updating** | Callback not called, UI thread blocked | Use async operations, check callback registration |
| **High memory usage** | Large caches, memory leaks, big chunks | Clear caches, reduce chunk size |
| **Connection timeouts** | Network issues, server overload, firewall | Check network, retry with backoff |

---

## Pagination Issues

### 1. Invalid Page Parameters

**Error Messages**:
```
INVALID_PAGE: Page number must be greater than 0
PAGE_SIZE_TOO_LARGE: Page size cannot exceed 1000
INVALID_PAGE_SIZE: Page size must be at least 1
```

**Diagnosis**:
```typescript
function diagnosePaginationParameters(page: number, pageSize: number): Diagnosis {
  const issues: string[] = [];
  
  if (page < 1) {
    issues.push(`Page ${page} is invalid. Must be >= 1`);
  }
  
  if (pageSize < 1) {
    issues.push(`Page size ${pageSize} is invalid. Must be >= 1`);
  }
  
  if (pageSize > 1000) {
    issues.push(`Page size ${pageSize} exceeds maximum of 1000`);
  }
  
  if (!Number.isInteger(page) || !Number.isInteger(pageSize)) {
    issues.push('Page and pageSize must be integers');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    recommendations: issues.length > 0 ? [
      'Use page >= 1',
      'Use pageSize between 1 and 1000',
      'Ensure parameters are integers'
    ] : []
  };
}
```

**Solutions**:
```typescript
// Parameter validation before request
function validateAndFixPagination(page?: number, pageSize?: number): PaginationParams {
  const fixed = {
    page: Math.max(1, Math.floor(page || 1)),
    pageSize: Math.min(1000, Math.max(1, Math.floor(pageSize || 50)))
  };
  
  console.log(`Pagination parameters fixed:`, fixed);
  return fixed;
}

// Usage
const params = validateAndFixPagination(userInput.page, userInput.pageSize);
const uri = `changes://active?page=${params.page}&pageSize=${params.pageSize}`;
```

### 2. nextPageToken Issues

**Error Messages**:
```
INVALID_TOKEN: nextPageToken is invalid or expired
TOKEN_MISSING: nextPageToken required for page > 1
```

**Diagnosis**:
```typescript
function diagnoseTokenIssues(response: any, requestedPage: number): TokenDiagnosis {
  const issues: string[] = [];
  
  if (requestedPage > 1 && !response.nextPageToken && response.hasNextPage) {
    issues.push('Expected nextPageToken for page > 1 but none provided');
  }
  
  if (response.nextPageToken && typeof response.nextPageToken !== 'string') {
    issues.push('nextPageToken must be a string');
  }
  
  if (response.nextPageToken && response.nextPageToken.length !== 16) {
    issues.push('nextPageToken should be 16 characters long');
  }
  
  if (response.nextPageToken && !/^[a-f0-9]{16}$/.test(response.nextPageToken)) {
    issues.push('nextPageToken contains invalid characters (should be hex)');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    token: response.nextPageToken
  };
}
```

**Solutions**:
```typescript
class TokenManager {
  private tokenCache = new Map<string, TokenInfo>();
  
  async getPageWithToken(page: number, pageSize: number): Promise<any> {
    const cacheKey = `${page}-${pageSize}`;
    
    // Check if we have a valid token
    const tokenInfo = this.tokenCache.get(cacheKey);
    if (tokenInfo && this.isTokenValid(tokenInfo)) {
      return this.makeRequest(page, pageSize, tokenInfo.token);
    }
    
    // Make request and cache token
    const response = await this.makeRequest(page, pageSize);
    
    if (response.nextPageToken) {
      this.tokenCache.set(cacheKey, {
        token: response.nextPageToken,
        timestamp: Date.now(),
        page,
        pageSize
      });
    }
    
    return response;
  }
  
  private isTokenValid(tokenInfo: TokenInfo): boolean {
    // Tokens are valid for 5 minutes
    const age = Date.now() - tokenInfo.timestamp;
    return age < 5 * 60 * 1000;
  }
  
  private async makeRequest(page: number, pageSize: number, token?: string): Promise<any> {
    let uri = `changes://active?page=${page}&pageSize=${pageSize}`;
    
    if (token && page > 1) {
      uri += `&nextPageToken=${token}`;
    }
    
    const result = await mcpResource(uri);
    return JSON.parse(result);
  }
  
  // Reset tokens on error
  resetTokens(): void {
    this.tokenCache.clear();
  }
}
```

### 3. Empty or Incomplete Results

**Symptoms**:
- Empty changes array
- Fewer items than expected
- Missing pages

**Diagnosis**:
```typescript
async function diagnoseEmptyResults(): Promise<ResultDiagnosis> {
  const issues: string[] = [];
  
  try {
    // Test with known good parameters
    const result = await mcpResource('changes://active?page=1&pageSize=10');
    const data = JSON.parse(result);
    
    if (!data.changes) {
      issues.push('Response missing changes field');
    } else if (data.changes.length === 0) {
      // Check if there are actually no changes
      const exists = await this.checkChangesDirectoryExists();
      if (exists) {
        issues.push('No changes found but directory exists');
      } else {
        issues.push('Changes directory does not exist');
      }
    } else if (data.changes.length < 10 && data.total > 10) {
      issues.push('Fewer items returned than requested');
    }
    
  } catch (error) {
    issues.push(`Request failed: ${error.message}`);
  }
  
  return {
    valid: issues.length === 0,
    issues,
    recommendations: this.generateRecommendations(issues)
  };
}
```

**Solutions**:
```typescript
class PaginationDebugger {
  async debugPaginationIssues(): Promise<DebugInfo> {
    const debugInfo: DebugInfo = {
      serverInfo: await this.getServerInfo(),
      directoryInfo: await this.getDirectoryInfo(),
      testResults: []
    };
    
    // Test different page sizes
    for (const pageSize of [1, 10, 50, 100]) {
      try {
        const result = await mcpResource(`changes://active?page=1&pageSize=${pageSize}`);
        const data = JSON.parse(result);
        
        debugInfo.testResults.push({
          pageSize,
          success: true,
          itemCount: data.changes?.length || 0,
          total: data.total,
          hasNext: data.hasNextPage,
          token: data.nextPageToken
        });
      } catch (error) {
        debugInfo.testResults.push({
          pageSize,
          success: false,
          error: error.message
        });
      }
    }
    
    return debugInfo;
  }
  
  private async getServerInfo(): Promise<any> {
    try {
      const result = await mcpResource('changes://active?info=true');
      return JSON.parse(result);
    } catch {
      return { error: 'Server info unavailable' };
    }
  }
  
  private async getDirectoryInfo(): Promise<any> {
    try {
      const result = await mcpResource('changes://active?directory=true');
      return JSON.parse(result);
    } catch {
      return { error: 'Directory info unavailable' };
    }
  }
}
```

---

## Streaming Issues

### 1. Memory Limit Exceeded

**Error Messages**:
```
MEMORY_LIMIT_EXCEEDED: Memory usage exceeded 50MB
STREAMING_ERROR: Memory allocation failed during streaming
```

**Diagnosis**:
```typescript
function diagnoseMemoryIssues(): Promise<MemoryDiagnosis> {
  const diagnosis: MemoryDiagnosis = {
    currentUsage: process.memoryUsage(),
    limits: { streaming: 50 * 1024 * 1024, pagination: 10 * 1024 * 1024 },
    issues: [],
    recommendations: []
  };
  
  const { heapUsed, heapTotal } = diagnosis.currentUsage;
  
  if (heapUsed > diagnosis.limits.streaming) {
    diagnosis.issues.push(`Streaming memory limit exceeded: ${Math.round(heapUsed / 1024 / 1024)}MB`);
    diagnosis.recommendations.push('Reduce streaming chunk size');
    diagnosis.recommendations.push('Close unused applications');
  }
  
  const heapUtilization = heapUsed / heapTotal;
  if (heapUtilization > 0.9) {
    diagnosis.issues.push(`Heap utilization high: ${Math.round(heapUtilization * 100)}%`);
    diagnosis.recommendations.push('Increase heap size or reduce memory usage');
  }
  
  return diagnosis;
}
```

**Solutions**:
```typescript
class MemoryOptimizer {
  private readonly SAFETY_MARGIN = 0.8; // Use 80% of limit
  
  getOptimalStreamingConfig(fileSize: number): StreamingConfig {
    const availableMemory = this.getAvailableMemory();
    const safeMemoryLimit = availableMemory * this.SAFETY_MARGIN;
    
    // Calculate optimal chunk size
    let chunkSize = 64 * 1024; // Default 64KB
    
    if (fileSize > 100 * 1024 * 1024) { // > 100MB
      chunkSize = 32 * 1024; // 32KB for very large files
    } else if (fileSize > 10 * 1024 * 1024) { // > 10MB
      chunkSize = 48 * 1024; // 48KB for large files
    }
    
    // Ensure chunk size fits in memory limit
    const maxChunkSize = Math.floor(safeMemoryLimit / 10); // 10 chunks in memory
    chunkSize = Math.min(chunkSize, maxChunkSize);
    
    return {
      chunkSize,
      maxMemoryUsage: safeMemoryLimit,
      streamingThreshold: Math.min(10 * 1024 * 1024, safeMemoryLimit / 2)
    };
  }
  
  private getAvailableMemory(): number {
    const usage = process.memoryUsage();
    const systemMemory = require('os').totalmem();
    const freeMemory = systemMemory - usage.rss;
    
    return Math.min(freeMemory, 50 * 1024 * 1024); // Cap at 50MB
  }
  
  async forceGarbageCollection(): Promise<void> {
    if (global.gc) {
      global.gc();
      // Wait for GC to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  clearCaches(): void {
    // Clear application caches
    if (typeof global !== 'undefined' && global.cache) {
      global.cache.clear();
    }
    
    // Force clear V8 optimizations
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
    }
  }
}
```

### 2. Streaming Interruptions

**Error Messages**:
```
STREAMING_ERROR: Connection interrupted during streaming
TIMEOUT: Streaming operation timed out
NETWORK_ERROR: Network connectivity lost
```

**Diagnosis**:
```typescript
class StreamingDiagnostics {
  async diagnoseStreamingInterruptions(uri: string): Promise<InterruptionDiagnosis> {
    const diagnosis: InterruptionDiagnosis = {
      networkConnectivity: await this.testNetworkConnectivity(),
      serverHealth: await this.testServerHealth(),
      fileAccessibility: await this.testFileAccessibility(uri),
      issues: [],
      recommendations: []
    };
    
    // Test network connectivity
    if (!diagnosis.networkConnectivity.connected) {
      diagnosis.issues.push('Network connectivity issues detected');
      diagnosis.recommendations.push('Check network connection');
    }
    
    // Test server health
    if (!diagnosis.serverHealth.healthy) {
      diagnosis.issues.push(`Server health issues: ${diagnosis.serverHealth.status}`);
      diagnosis.recommendations.push('Check Task MCP server status');
    }
    
    // Test file accessibility
    if (!diagnosis.fileAccessibility.accessible) {
      diagnosis.issues.push(`File access issues: ${diagnosis.fileAccessibility.error}`);
      diagnosis.recommendations.push('Check file permissions and existence');
    }
    
    return diagnosis;
  }
  
  private async testNetworkConnectivity(): Promise<NetworkInfo> {
    try {
      const start = Date.now();
      await mcpResource('changes://active?page=1&pageSize=1');
      const latency = Date.now() - start;
      
      return {
        connected: true,
        latency,
        stable: latency < 5000 // < 5 seconds is stable
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
  
  private async testServerHealth(): Promise<ServerHealth> {
    try {
      const result = await mcpResource('changes://active?health=true');
      const health = JSON.parse(result);
      
      return {
        healthy: health.status === 'healthy',
        status: health.status,
        uptime: health.uptime,
        memory: health.memory
      };
    } catch {
      return {
        healthy: false,
        status: 'unknown',
        error: 'Health check failed'
      };
    }
  }
  
  private async testFileAccessibility(uri: string): Promise<FileAccessInfo> {
    try {
      // Test metadata access
      const metadata = await mcpResource(`${uri}?metadata=true`);
      const data = JSON.parse(metadata);
      
      return {
        accessible: true,
        size: data.size,
        permissions: data.permissions,
        exists: true
      };
    } catch (error) {
      return {
        accessible: false,
        error: error.message,
        exists: !error.message.includes('ENOENT')
      };
    }
  }
}
```

**Solutions**:
```typescript
class ResilientStreaming {
  async streamWithRetry(
    uri: string,
    options: StreamingOptions = {}
  ): Promise<string> {
    const config = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2,
      ...options
    };
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await this.attemptStream(uri, attempt, config);
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryableError(error) || attempt === config.maxRetries) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay
        );
        
        console.warn(`Streaming attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }
  
  private async attemptStream(uri: string, attempt: number, config: StreamingOptions): Promise<string> {
    const progressCallback = (progress: StreamingProgress) => {
      // Log progress for debugging
      console.debug(`Attempt ${attempt} progress: ${progress.percentage}%`);
      
      // Call user's progress callback if provided
      if (config.onProgress) {
        config.onProgress(progress);
      }
    };
    
    // Add attempt-specific headers if supported
    const headers = {
      'X-Attempt': attempt.toString(),
      'X-Max-Retries': config.maxRetries.toString()
    };
    
    return await mcpResourceWithProgress(uri, progressCallback, headers);
  }
  
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'STREAMING_ERROR',
      'NETWORK_ERROR',
      'TIMEOUT',
      'CONNECTION_RESET',
      'ECONNRESET',
      'ETIMEDOUT'
    ];
    
    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3. Progress Reporting Issues

**Symptoms**:
- Progress callbacks not called
- Progress percentage stuck at 0% or 100%
- Progress jumps erratically

**Diagnosis**:
```typescript
class ProgressDiagnostics {
  async diagnoseProgressIssues(uri: string): Promise<ProgressDiagnosis> {
    const diagnosis: ProgressDiagnosis = {
      events: [],
      issues: [],
      recommendations: []
    };
    
    const progressCallback = (progress: StreamingProgress) => {
      diagnosis.events.push({
        timestamp: Date.now(),
        ...progress
      });
    };
    
    try {
      await mcpResourceWithProgress(uri, progressCallback);
      this.analyzeProgressEvents(diagnosis);
    } catch (error) {
      diagnosis.issues.push(`Streaming failed: ${error.message}`);
    }
    
    return diagnosis;
  }
  
  private analyzeProgressEvents(diagnosis: ProgressDiagnosis): void {
    const events = diagnosis.events;
    
    if (events.length === 0) {
      diagnosis.issues.push('No progress events received');
      diagnosis.recommendations.push('Check progress callback registration');
      return;
    }
    
    // Check for monotonic progress
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      
      if (curr.bytesRead < prev.bytesRead) {
        diagnosis.issues.push('Non-monotonic progress detected');
        diagnosis.recommendations.push('Check streaming implementation for race conditions');
      }
      
      if (curr.percentage < prev.percentage) {
        diagnosis.issues.push('Progress percentage decreased');
        diagnosis.recommendations.push('Check percentage calculation logic');
      }
    }
    
    // Check final progress
    const finalEvent = events[events.length - 1];
    if (finalEvent.percentage !== 100) {
      diagnosis.issues.push(`Final progress is ${finalEvent.percentage}% instead of 100%`);
      diagnosis.recommendations.push('Ensure progress reaches 100% on completion');
    }
    
    // Check progress frequency
    if (events.length > 1) {
      const timeSpan = events[events.length - 1].timestamp - events[0].timestamp;
      const avgInterval = timeSpan / (events.length - 1);
      
      if (avgInterval > 5000) { // > 5 seconds between updates
        diagnosis.issues.push(`Progress updates too infrequent: ${Math.round(avgInterval)}ms average`);
        diagnosis.recommendations.push('Increase progress reporting frequency');
      }
    }
  }
}
```

**Solutions**:
```typescript
class ReliableProgressReporting {
  private lastReportedProgress = 0;
  private lastReportTime = 0;
  private readonly MIN_PROGRESS_DELTA = 1; // 1%
  private readonly MIN_TIME_DELTA = 200; // 200ms
  
  createProgressCallback(onProgress?: (progress: StreamingProgress) => void): (progress: StreamingProgress) => void {
    return (progress: StreamingProgress) => {
      const now = Date.now();
      const progressDelta = progress.percentage - this.lastReportedProgress;
      const timeDelta = now - this.lastReportTime;
      
      // Report if significant progress change or enough time passed
      if (progressDelta >= this.MIN_PROGRESS_DELTA || 
          timeDelta >= this.MIN_TIME_DELTA ||
          progress.percentage === 100) {
        
        if (onProgress) {
          onProgress(progress);
        }
        
        this.lastReportedProgress = progress.percentage;
        this.lastReportTime = now;
      }
    };
  }
  
  reset(): void {
    this.lastReportedProgress = 0;
    this.lastReportTime = 0;
  }
}
```

---

## Performance Issues

### 1. Slow Pagination

**Symptoms**:
- Pagination requests take > 2 seconds
- UI freezes during pagination
- Memory usage increases with each page

**Diagnosis**:
```typescript
class PerformanceDiagnostics {
  async diagnosePaginationPerformance(): Promise<PaginationPerformanceDiagnosis> {
    const diagnosis: PaginationPerformanceDiagnosis = {
      measurements: [],
      issues: [],
      recommendations: []
    };
    
    // Test different page sizes
    const pageSizes = [10, 25, 50, 100];
    
    for (const pageSize of pageSizes) {
      const measurement = await this.measurePaginationPerformance(pageSize);
      diagnosis.measurements.push(measurement);
      
      if (measurement.loadTime > 2000) {
        diagnosis.issues.push(`Slow pagination with page size ${pageSize}: ${measurement.loadTime}ms`);
      }
      
      if (measurement.memoryUsage > 20 * 1024 * 1024) { // 20MB
        diagnosis.issues.push(`High memory usage with page size ${pageSize}: ${Math.round(measurement.memoryUsage / 1024 / 1024)}MB`);
      }
    }
    
    // Analyze trends
    this.analyzePerformanceTrends(diagnosis);
    
    return diagnosis;
  }
  
  private async measurePaginationPerformance(pageSize: number): Promise<PaginationMeasurement> {
    const memoryBefore = process.memoryUsage().heapUsed;
    const startTime = performance.now();
    
    try {
      const result = await mcpResource(`changes://active?page=1&pageSize=${pageSize}`);
      const loadTime = performance.now() - startTime;
      const memoryAfter = process.memoryUsage().heapUsed;
      
      return {
        pageSize,
        loadTime,
        memoryUsage: memoryAfter - memoryBefore,
        success: true,
        itemCount: JSON.parse(result).changes?.length || 0
      };
    } catch (error) {
      return {
        pageSize,
        loadTime: performance.now() - startTime,
        memoryUsage: process.memoryUsage().heapUsed - memoryBefore,
        success: false,
        error: error.message
      };
    }
  }
  
  private analyzePerformanceTrends(diagnosis: PaginationPerformanceDiagnosis): void {
    const successful = diagnosis.measurements.filter(m => m.success);
    
    if (successful.length < 2) return;
    
    // Find optimal page size
    const timePerItem = successful.map(m => ({
      pageSize: m.pageSize,
      timePerItem: m.loadTime / m.itemCount
    }));
    
    const optimal = timePerItem.reduce((best, current) => 
      current.timePerItem < best.timePerItem ? current : best
    );
    
    diagnosis.recommendations.push(`Optimal page size: ${optimal.pageSize} items`);
    
    // Check for performance degradation
    const sortedBySize = successful.sort((a, b) => a.pageSize - b.pageSize);
    for (let i = 1; i < sortedBySize.length; i++) {
      const prev = sortedBySize[i - 1];
      const curr = sortedBySize[i];
      
      const timeIncrease = (curr.loadTime / curr.itemCount) / (prev.loadTime / prev.itemCount);
      
      if (timeIncrease > 1.5) {
        diagnosis.issues.push(`Performance degrades significantly beyond page size ${prev.pageSize}`);
        diagnosis.recommendations.push(`Keep page size ≤ ${prev.pageSize} for optimal performance`);
        break;
      }
    }
  }
}
```

**Solutions**:
```typescript
class PaginationOptimizer {
  private performanceCache = new Map<number, PerformanceMetrics>();
  
  async getOptimalPageSize(): Promise<number> {
    // Test a range of page sizes
    const testSizes = [10, 20, 30, 40, 50];
    const results: PageSizeTest[] = [];
    
    for (const size of testSizes) {
      const metrics = await this.testPageSize(size);
      results.push({ pageSize: size, metrics });
    }
    
    // Find best balance of speed and memory
    const scored = results.map(result => ({
      pageSize: result.pageSize,
      score: this.calculateScore(result.metrics)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored[0].pageSize;
  }
  
  private async testPageSize(pageSize: number): Promise<PerformanceMetrics> {
    const measurements: number[] = [];
    
    // Test multiple times for accuracy
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const memoryBefore = process.memoryUsage().heapUsed;
      
      try {
        await mcpResource(`changes://active?page=1&pageSize=${pageSize}`);
        const loadTime = performance.now() - start;
        const memoryUsage = process.memoryUsage().heapUsed - memoryBefore;
        
        measurements.push(loadTime);
      } catch {
        measurements.push(Infinity);
      }
    }
    
    const avgLoadTime = measurements.filter(t => t !== Infinity).reduce((a, b) => a + b, 0) / measurements.length;
    
    return {
      avgLoadTime,
      consistency: Math.min(...measurements) / Math.max(...measurements),
      memoryEfficiency: pageSize / avgLoadTime // items per second
    };
  }
  
  private calculateScore(metrics: PerformanceMetrics): number {
    // Weighted score (lower is better)
    const timeScore = metrics.avgLoadTime / 1000; // Normalize to seconds
    const consistencyScore = 1 - metrics.consistency; // Higher consistency = better
    const efficiencyScore = Math.log(metrics.memoryEfficiency + 1); // Log scale
    
    return (timeScore * 0.5) + (consistencyScore * 0.3) + (efficiencyScore * 0.2);
  }
}
```

### 2. Memory Leaks

**Symptoms**:
- Memory usage increases over time
- Performance degrades with use
- Eventually crashes or becomes unresponsive

**Diagnosis**:
```typescript
class MemoryLeakDetector {
  private snapshots: MemorySnapshot[] = [];
  private readonly MAX_SNAPSHOTS = 50;
  private readonly LEAK_THRESHOLD = 1024 * 1024; // 1MB growth per minute
  
  startMonitoring(intervalMs: number = 10000): void { // Every 10 seconds
    setInterval(() => {
      this.takeSnapshot();
      this.analyzeForLeaks();
    }, intervalMs);
  }
  
  private takeSnapshot(): void {
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
      rss: process.memoryUsage().rss
    };
    
    this.snapshots.push(snapshot);
    
    if (this.snapshots.length > this.MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }
  
  private analyzeForLeaks(): void {
    if (this.snapshots.length < 10) return;
    
    const recent = this.snapshots.slice(-10);
    const older = this.snapshots.slice(-20, -10);
    
    if (older.length === 0) return;
    
    const recentAvg = recent.reduce((sum, s) => sum + s.heapUsed, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.heapUsed, 0) / older.length;
    
    const growth = recentAvg - olderAvg;
    const timeSpan = recent[recent.length - 1].timestamp - older[0].timestamp;
    const growthRate = growth / (timeSpan / 1000 / 60); // MB per minute
    
    if (growthRate > this.LEAK_THRESHOLD) {
      console.warn(`Memory leak detected: ${Math.round(growthRate / 1024 / 1024)}MB/min`);
      this.suggestLeakFixes();
    }
  }
  
  private suggestLeakFixes(): void {
    console.log('Memory leak suggestions:');
    console.log('1. Clear caches periodically');
    console.log('2. Remove event listeners');
    console.log('3. Close file handles');
    console.log('4. Use weak references where possible');
    console.log('5. Check for circular references');
  }
}
```

---

## Network Issues

### 1. Connection Problems

**Symptoms**:
- Timeouts on large operations
- Intermittent failures
- Slow response times

**Diagnosis**:
```typescript
class NetworkDiagnostics {
  async diagnoseNetworkIssues(): Promise<NetworkDiagnosis> {
    const diagnosis: NetworkDiagnosis = {
      connectivity: await this.testConnectivity(),
      latency: await this.measureLatency(),
      bandwidth: await this.measureBandwidth(),
      dns: await this.testDNS(),
      issues: [],
      recommendations: []
    };
    
    // Analyze results
    if (!diagnosis.connectivity.connected) {
      diagnosis.issues.push('No network connectivity');
      diagnosis.recommendations.push('Check network connection');
    }
    
    if (diagnosis.latency.average > 2000) { // > 2 seconds
      diagnosis.issues.push(`High latency: ${Math.round(diagnosis.latency.average)}ms`);
      diagnosis.recommendations.push('Check network quality and routing');
    }
    
    if (diagnosis.bandwidth.throughput < 100 * 1024) { // < 100KB/s
      diagnosis.issues.push(`Low bandwidth: ${Math.round(diagnosis.bandwidth.throughput / 1024)}KB/s`);
      diagnosis.recommendations.push('Consider reducing concurrent requests');
    }
    
    return diagnosis;
  }
  
  private async testConnectivity(): Promise<ConnectivityResult> {
    try {
      const start = Date.now();
      await mcpResource('changes://active?page=1&pageSize=1');
      const responseTime = Date.now() - start;
      
      return {
        connected: true,
        responseTime,
        stable: responseTime < 10000 // < 10 seconds
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
  
  private async measureLatency(): Promise<LatencyResult> {
    const measurements: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      try {
        const start = performance.now();
        await mcpResource('changes://active?page=1&pageSize=1');
        measurements.push(performance.now() - start);
      } catch {
        measurements.push(Infinity);
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const valid = measurements.filter(m => m !== Infinity);
    
    return {
      average: valid.reduce((a, b) => a + b, 0) / valid.length,
      min: Math.min(...valid),
      max: Math.max(...valid),
      jitter: this.calculateJitter(valid)
    };
  }
  
  private calculateJitter(measurements: number[]): number {
    if (measurements.length < 2) return 0;
    
    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const variance = measurements.reduce((sum, m) => sum + Math.pow(m - avg, 2), 0) / measurements.length;
    
    return Math.sqrt(variance);
  }
}
```

**Solutions**:
```typescript
class NetworkOptimizer {
  private connectionPool = new Map<string, PooledConnection>();
  private readonly MAX_CONNECTIONS = 3;
  private readonly CONNECTION_TIMEOUT = 30000;
  
  async optimizedRequest(uri: string): Promise<any> {
    const host = this.extractHost(uri);
    
    // Use connection pooling
    const connection = await this.getConnection(host);
    
    try {
      return await this.makeRequestWithConnection(connection, uri);
    } finally {
      this.releaseConnection(connection);
    }
  }
  
  private async getConnection(host: string): Promise<PooledConnection> {
    const pool = this.connectionPool.get(host) || [];
    const availableConnection = pool.find(conn => 
      conn.isAvailable && !conn.isExpired()
    );
    
    if (availableConnection) {
      availableConnection.isAvailable = false;
      return availableConnection;
    }
    
    // Create new connection if under limit
    if (pool.length < this.MAX_CONNECTIONS) {
      const newConnection = await this.createConnection(host);
      pool.push(newConnection);
      this.connectionPool.set(host, pool);
      return newConnection;
    }
    
    // Wait for available connection
    return this.waitForAvailableConnection(host);
  }
  
  private async createConnection(host: string): Promise<PooledConnection> {
    // Implementation depends on MCP client capabilities
    return {
      host,
      created: Date.now(),
      lastUsed: Date.now(),
      isAvailable: false,
      isExpired: () => Date.now() - this.created > this.CONNECTION_TIMEOUT,
      connection: await mcpCreateConnection(host)
    };
  }
}
```

---

## Memory Issues

### 1. Memory Exhaustion

**Symptoms**:
- Out of memory errors
- System becomes unresponsive
- Streaming fails on large files

**Solutions**:
```typescript
class MemoryManager {
  private readonly WARNING_THRESHOLD = 0.8;
  private readonly CRITICAL_THRESHOLD = 0.9;
  private memoryHistory: MemorySnapshot[] = [];
  
  startMonitoring(): void {
    setInterval(() => {
      this.checkMemoryUsage();
    }, 5000); // Check every 5 seconds
  }
  
  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const heapUtilization = usage.heapUsed / usage.heapTotal;
    
    this.memoryHistory.push({
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      utilization: heapUtilization
    });
    
    if (this.memoryHistory.length > 100) {
      this.memoryHistory.shift();
    }
    
    if (heapUtilization > this.CRITICAL_THRESHOLD) {
      this.handleCriticalMemory();
    } else if (heapUtilization > this.WARNING_THRESHOLD) {
      this.handleWarningMemory();
    }
  }
  
  private handleCriticalMemory(): void {
    console.error('Critical memory usage detected');
    
    // Force garbage collection
    if (global.gc) {
      for (let i = 0; i < 5; i++) {
        global.gc();
      }
    }
    
    // Clear caches
    this.clearAllCaches();
    
    // Reduce streaming parameters
    this.reduceStreamingParameters();
    
    // Notify user
    this.notifyUser('Critical memory usage - taking corrective action');
  }
  
  private handleWarningMemory(): void {
    console.warn('High memory usage detected');
    
    // Suggest garbage collection
    setTimeout(() => {
      if (global.gc) {
        global.gc();
      }
    }, 0);
    
    // Clear old cache entries
    this.clearOldCacheEntries();
  }
  
  private clearAllCaches(): void {
    // Clear pagination cache
    if (typeof global !== 'undefined' && global.paginationCache) {
      global.paginationCache.clear();
    }
    
    // Clear streaming cache
    if (typeof global !== 'undefined' && global.streamingCache) {
      global.streamingCache.clear();
    }
  }
  
  private reduceStreamingParameters(): void {
    // Reduce chunk size for future streaming operations
    if (typeof global !== 'undefined' && global.streamingConfig) {
      global.streamingConfig.chunkSize = Math.max(
        global.streamingConfig.chunkSize / 2,
        4 * 1024 // Minimum 4KB
      );
    }
  }
}
```

---

## Platform-Specific Issues

### VS Code Issues

**Common Problems**:
- Extension context invalidation
- Memory leaks in extension host
- Progress reporting not working

**Solutions**:
```typescript
class VSCodeTroubleshooter {
  async diagnoseVSCodeIssues(): Promise<VSCodeDiagnosis> {
    const diagnosis: VSCodeDiagnosis = {
      extensionContext: this.checkExtensionContext(),
      memoryUsage: this.checkVSCodeMemory(),
      progressAPI: this.checkProgressAPI(),
      issues: [],
      recommendations: []
    };
    
    if (!diagnosis.extensionContext.valid) {
      diagnosis.issues.push('Extension context issues detected');
      diagnosis.recommendations.push('Reload VS Code window');
    }
    
    if (diagnosis.memoryUsage.heapUsed > 200 * 1024 * 1024) { // 200MB
      diagnosis.issues.push('VS Code memory usage high');
      diagnosis.recommendations.push('Restart VS Code or reduce extension memory usage');
    }
    
    if (!diagnosis.progressAPI.working) {
      diagnosis.issues.push('Progress API not working');
      diagnosis.recommendations.push('Check extension manifest for progress API permissions');
    }
    
    return diagnosis;
  }
  
  private checkExtensionContext(): ExtensionContextInfo {
    try {
      // Check if extension context is valid
      const context = vscode.extensions.getExtension('openspec.task-mcp');
      
      return {
        valid: !!context,
        active: context?.isActive,
        version: context?.packageJSON?.version
      };
    } catch {
      return { valid: false, error: 'Extension context inaccessible' };
    }
  }
  
  private checkVSCodeMemory(): MemoryInfo {
    return process.memoryUsage();
  }
  
  private checkProgressAPI(): ProgressAPIInfo {
    try {
      // Test progress API
      const test = vscode.window.withProgress;
      
      return {
        working: typeof test === 'function',
        available: true
      };
    } catch {
      return { working: false, available: false };
    }
  }
}
```

### JetBrains Issues

**Common Problems**:
- EDT violations
- Plugin class loading issues
- Memory management in IDE

**Solutions**:
```kotlin
class JetBrainsTroubleshooter {
    suspend fun diagnoseJetBrainsIssues(): JetBrainsDiagnosis {
        val diagnosis = JetBrainsDiagnosis(
            edtStatus = checkEDTStatus(),
            memoryStatus = checkMemoryStatus(),
            pluginStatus = checkPluginStatus(),
            issues = mutableListOf<String>(),
            recommendations = mutableListOf<String>()
        )
        
        if (!diagnosis.edtStatus.valid) {
            diagnosis.issues.add("EDT violations detected")
            diagnosis.recommendations.add("Ensure UI operations run on EDT")
        }
        
        if (diagnosis.memoryStatus.heapUsed > 300 * 1024 * 1024) { // 300MB
            diagnosis.issues.add("JetBrains memory usage high")
            diagnosis.recommendations.add("Increase IDE memory or restart")
        }
        
        return diagnosis
    }
    
    private fun checkEDTStatus(): EDTStatus {
        return try {
            // Test if we're on EDT
            EventQueue.isDispatchThread()
            EDTStatus(valid = true)
        } catch (e: Exception) {
            EDTStatus(valid = false, error = e.message)
        }
    }
    
    private fun checkMemoryStatus(): MemoryStatus {
        val runtime = Runtime.getRuntime()
        val totalMemory = runtime.totalMemory()
        val freeMemory = runtime.freeMemory()
        val usedMemory = totalMemory - freeMemory
        
        return MemoryStatus(
            heapUsed = usedMemory,
            heapTotal = totalMemory,
            utilization = usedMemory.toDouble() / totalMemory
        )
    }
    
    private fun checkPluginStatus(): PluginStatus {
        return try {
            val pluginManager = PluginManagerCore.getPluginManager()
            val plugin = pluginManager.findPlugin("openspec.task-mcp")
            
            PluginStatus(
                loaded = plugin != null,
                enabled = plugin?.isEnabled == true,
                version = plugin?.version
            )
        } catch (e: Exception) {
            PluginStatus(loaded = false, error = e.message)
        }
    }
}
```

---

## Debug Tools

### 1. Debug Mode Configuration

```typescript
class DebugConfiguration {
  private debugMode = false;
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
  private logFile: string | null = null;

  enableDebugMode(config: DebugConfig): void {
    this.debugMode = true;
    this.logLevel = config.logLevel || 'debug';
    this.logFile = config.logFile || null;
    
    if (this.logFile) {
      this.setupFileLogging();
    }
    
    console.log('Debug mode enabled:', config);
  }

  private setupFileLogging(): void {
    const fs = require('fs');
    const path = require('path');
    
    // Create log directory if needed
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Override console methods
    const originalConsole = { ...console };
    
    console.log = (...args: any[]) => {
      originalConsole.log(...args);
      this.writeToFile('LOG', args);
    };
    
    console.error = (...args: any[]) => {
      originalConsole.error(...args);
      this.writeToFile('ERROR', args);
    };
    
    console.warn = (...args: any[]) => {
      originalConsole.warn(...args);
      this.writeToFile('WARN', args);
    };
  }

  private writeToFile(level: string, args: any[]): void {
    if (!this.logFile) return;
    
    const fs = require('fs');
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    const logEntry = `[${timestamp}] ${level}: ${message}\n`;
    
    try {
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }
}
```

### 2. Performance Profiler

```typescript
class PerformanceProfiler {
  private profiles = new Map<string, Profile>();
  private observers: PerformanceObserver[] = [];

  startProfile(name: string): void {
    const profile: Profile = {
      name,
      startTime: performance.now(),
      startMemory: process.memoryUsage().heapUsed,
      measurements: [],
      markers: []
    };

    this.profiles.set(name, profile);
    this.setupObservers(name);
  }

  endProfile(name: string): ProfileResult {
    const profile = this.profiles.get(name);
    if (!profile) {
      throw new Error(`No active profile: ${name}`);
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const result: ProfileResult = {
      name: profile.name,
      duration: endTime - profile.startTime,
      memoryDelta: endMemory - profile.startMemory,
      measurements: profile.measurements,
      markers: profile.markers,
      recommendations: this.generateRecommendations(profile, endTime - profile.startTime)
    };

    this.profiles.delete(name);
    this.cleanupObservers();

    return result;
  }

  addMeasurement(profileName: string, name: string, value: number): void {
    const profile = this.profiles.get(profileName);
    if (profile) {
      profile.measurements.push({
        name,
        value,
        timestamp: performance.now() - profile.startTime
      });
    }
  }

  addMarker(profileName: string, name: string): void {
    const profile = this.profiles.get(profileName);
    if (profile) {
      profile.markers.push({
        name,
        timestamp: performance.now() - profile.startTime
      });
    }
  }

  getProfileReport(): ProfileReport {
    const reports = Array.from(this.profiles.entries()).map(([name, profile]) => ({
      name,
      duration: performance.now() - profile.startTime,
      active: true
    }));

    return {
      activeProfiles: reports,
      recommendations: this.generateGlobalRecommendations()
    };
  }
}
```

### 3. Health Check Tool

```typescript
class HealthCheckTool {
  async runComprehensiveHealthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      checks: {}
    };

    // Check basic connectivity
    result.checks.connectivity = await this.checkConnectivity();
    
    // Check pagination
    result.checks.pagination = await this.checkPaginationHealth();
    
    // Check streaming
    result.checks.streaming = await this.checkStreamingHealth();
    
    // Check memory
    result.checks.memory = this.checkMemoryHealth();
    
    // Check performance
    result.checks.performance = await this.checkPerformanceHealth();
    
    // Determine overall health
    const failedChecks = Object.values(result.checks).filter(check => check.status !== 'healthy');
    
    if (failedChecks.length === 0) {
      result.overall = 'healthy';
    } else if (failedChecks.length <= 2) {
      result.overall = 'degraded';
    } else {
      result.overall = 'unhealthy';
    }

    return result;
  }

  private async checkConnectivity(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      await mcpResource('changes://active?page=1&pageSize=1');
      const responseTime = Date.now() - start;
      
      return {
        status: responseTime < 5000 ? 'healthy' : 'degraded',
        message: `Response time: ${responseTime}ms`,
        details: { responseTime }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Connection failed: ${error.message}`,
        error: error.message
      };
    }
  }

  private async checkPaginationHealth(): Promise<HealthCheck> {
    try {
      const result = await mcpResource('changes://active?page=1&pageSize=10');
      const data = JSON.parse(result);
      
      if (!data.changes || !Array.isArray(data.changes)) {
        return {
          status: 'unhealthy',
          message: 'Invalid pagination response format'
        };
      }
      
      if (typeof data.total !== 'number') {
        return {
          status: 'degraded',
          message: 'Missing total count in pagination response'
        };
      }
      
      return {
        status: 'healthy',
        message: `Pagination working: ${data.changes.length}/${data.total} items`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Pagination check failed: ${error.message}`,
        error: error.message
      };
    }
  }

  private async checkStreamingHealth(): Promise<HealthCheck> {
    try {
      // Test with a small file first
      const result = await mcpResource('change://test/proposal');
      
      return {
        status: 'healthy',
        message: 'Streaming functionality working'
      };
    } catch (error) {
      if (error.message.includes('STREAMING_ERROR')) {
        return {
          status: 'unhealthy',
          message: `Streaming errors detected: ${error.message}`,
          error: error.message
        };
      }
      
      return {
        status: 'degraded',
        message: `Streaming check inconclusive: ${error.message}`,
        error: error.message
      };
    }
  }

  private checkMemoryHealth(): HealthCheck {
    const memory = process.memoryUsage();
    const heapUtilization = memory.heapUsed / memory.heapTotal;
    
    if (heapUtilization > 0.9) {
      return {
        status: 'unhealthy',
        message: `Critical memory usage: ${Math.round(heapUtilization * 100)}%`,
        details: memory
      };
    } else if (heapUtilization > 0.7) {
      return {
        status: 'degraded',
        message: `High memory usage: ${Math.round(heapUtilization * 100)}%`,
        details: memory
      };
    }
    
    return {
      status: 'healthy',
      message: `Memory usage normal: ${Math.round(heapUtilization * 100)}%`,
      details: memory
    };
  }

  private async checkPerformanceHealth(): Promise<HealthCheck> {
    const start = performance.now();
    
    try {
      // Run a series of operations to test performance
      await Promise.all([
        mcpResource('changes://active?page=1&pageSize=10'),
        mcpResource('changes://active?page=1&pageSize=20'),
        mcpResource('changes://active?page=1&pageSize=50')
      ]);
      
      const duration = performance.now() - start;
      const avgTime = duration / 3;
      
      if (avgTime > 3000) { // > 3 seconds average
        return {
          status: 'degraded',
          message: `Slow performance: ${Math.round(avgTime)}ms average`,
          details: { avgTime, duration }
        };
      }
      
      return {
        status: 'healthy',
        message: `Performance acceptable: ${Math.round(avgTime)}ms average`,
        details: { avgTime, duration }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Performance check failed: ${error.message}`,
        error: error.message
      };
    }
  }
}
```

---

*This troubleshooting guide provides comprehensive diagnostic tools and solutions for common pagination and streaming issues. For implementation details, see the main IDE Integration Guide.*