# Streaming Architecture Design Document

## Overview

This document outlines the enhanced streaming architecture for memory-efficient file reading in OpenSpec, building upon the existing implementation in `src/stdio/resources/streaming-reader.ts`. The design focuses on robust chunk size strategy, intelligent memory thresholds, effective backpressure handling, comprehensive error recovery, and systematic resource cleanup.

## Architecture Goals

1. **Memory Efficiency**: Maintain peak memory usage below 50MB regardless of file size
2. **Performance**: Stream files up to 100MB+ with throughput >10MB/second
3. **Reliability**: Handle interrupted streams with automatic recovery
4. **Scalability**: Support concurrent streaming operations with proper resource isolation
5. **Observability**: Provide detailed metrics and progress tracking

## Core Components

### 1. Chunk Size Strategy

#### Default Configuration
```typescript
interface ChunkConfig {
  defaultChunkSize: 64 * 1024; // 64KB - optimal balance of memory vs. I/O efficiency
  minChunkSize: 4 * 1024;      // 4KB - minimum for filesystem alignment
  maxChunkSize: 1024 * 1024;   // 1MB - maximum to prevent memory spikes
  adaptiveSizing: true;         // Enable adaptive chunk sizing
}
```

#### Adaptive Chunk Sizing Algorithm

```typescript
class AdaptiveChunkSizer {
  private performanceHistory: ChunkPerformance[] = [];
  private readonly historySize = 10;
  
  /**
   * Determine optimal chunk size based on system conditions
   */
  calculateOptimalChunkSize(
    fileSize: number,
    currentMemory: MemoryStats,
    throughputHistory: number[]
  ): number {
    // Base size on file size class
    let baseChunk = this.getBaseChunkForFileSize(fileSize);
    
    // Adjust for memory pressure
    const memoryPressure = currentMemory.heapUsedPercent;
    if (memoryPressure > 80) {
      baseChunk = Math.max(this.config.minChunkSize, baseChunk * 0.5);
    } else if (memoryPressure < 40) {
      baseChunk = Math.min(this.config.maxChunkSize, baseChunk * 1.5);
    }
    
    // Adjust for throughput trends
    const avgThroughput = throughputHistory.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, throughputHistory.length);
    if (avgThroughput < 5 * 1024 * 1024) { // Less than 5MB/s
      baseChunk = Math.min(this.config.maxChunkSize, baseChunk * 1.2);
    }
    
    return Math.round(baseChunk);
  }
  
  private getBaseChunkForFileSize(fileSize: number): number {
    if (fileSize < 1024 * 1024) return 32 * 1024;      // <1MB: 32KB
    if (fileSize < 10 * 1024 * 1024) return 64 * 1024;  // <10MB: 64KB
    if (fileSize < 100 * 1024 * 1024) return 128 * 1024; // <100MB: 128KB
    return 256 * 1024;                                   // ≥100MB: 256KB
  }
}
```

### 2. Memory Threshold Strategy

#### Threshold Configuration
```typescript
interface MemoryThresholds {
  // Streaming trigger threshold
  streamingTrigger: 1 * 1024 * 1024;  // 1MB - switch to streaming
  
  // Memory pressure levels
  warningThreshold: 60;               // 60% heap usage
  criticalThreshold: 75;              // 75% heap usage
  maximumThreshold: 50 * 1024 * 1024; // 50MB absolute limit
  
  // Adaptive thresholds
  adaptiveScaling: true;
  baseMultiplier: 1.0;
  pressureMultiplier: 0.7;
}
```

#### Adaptive Memory Management

```typescript
class AdaptiveMemoryManager {
  private thresholds: MemoryThresholds;
  private memoryMonitor: MemoryMonitor;
  
  /**
   * Check if streaming should be triggered based on file and memory state
   */
  shouldTriggerStreaming(fileSize: number, memoryStats: MemoryStats): boolean {
    // Always stream files larger than trigger threshold
    if (fileSize >= this.thresholds.streamingTrigger) {
      return true;
    }
    
    // Also stream if under memory pressure, even for smaller files
    const pressureLevel = this.getMemoryPressure(memoryStats);
    if (pressureLevel === 'critical' && fileSize > 256 * 1024) { // 256KB
      return true;
    }
    
    return false;
  }
  
  /**
   * Get current memory-adjusted chunk size
   */
  getMemoryAdjustedChunkSize(baseChunkSize: number): number {
    const currentMemory = this.memoryMonitor.getCurrentStats();
    const pressureLevel = this.getMemoryPressure(currentMemory);
    
    switch (pressureLevel) {
      case 'critical':
        return Math.max(4 * 1024, baseChunkSize * 0.5);
      case 'warning':
        return Math.max(8 * 1024, baseChunkSize * 0.75);
      case 'normal':
        return baseChunkSize;
      default:
        return baseChunkSize;
    }
  }
}
```

### 3. Backpressure Handling

#### Multi-Level Backpressure System

```typescript
class BackpressureController {
  private readonly BACKPRESSURE_LEVELS = {
    NONE: { multiplier: 1.0, maxConcurrent: 10 },
    LIGHT: { multiplier: 0.8, maxConcurrent: 6 },
    MODERATE: { multiplier: 0.5, maxConcurrent: 3 },
    HEAVY: { multiplier: 0.25, maxConcurrent: 1 },
    CRITICAL: { multiplier: 0.1, maxConcurrent: 0 }
  };
  
  /**
   * Calculate current backpressure level
   */
  calculateBackpressure(
    memoryStats: MemoryStats,
    activeStreams: number,
    avgProcessingTime: number
  ): BackpressureLevel {
    let pressureScore = 0;
    
    // Memory pressure (0-40 points)
    if (memoryStats.heapUsedPercent > 80) pressureScore += 40;
    else if (memoryStats.heapUsedPercent > 70) pressureScore += 30;
    else if (memoryStats.heapUsedPercent > 60) pressureScore += 20;
    else if (memoryStats.heapUsedPercent > 50) pressureScore += 10;
    
    // Concurrent streams pressure (0-30 points)
    if (activeStreams > 8) pressureScore += 30;
    else if (activeStreams > 5) pressureScore += 20;
    else if (activeStreams > 3) pressureScore += 10;
    
    // Processing time pressure (0-30 points)
    if (avgProcessingTime > 1000) pressureScore += 30; // >1s per chunk
    else if (avgProcessingTime > 500) pressureScore += 20; // >500ms
    else if (avgProcessingTime > 200) pressureScore += 10; // >200ms
    
    // Determine level based on score
    if (pressureScore >= 80) return 'CRITICAL';
    if (pressureScore >= 60) return 'HEAVY';
    if (pressureScore >= 40) return 'MODERATE';
    if (pressureScore >= 20) return 'LIGHT';
    return 'NONE';
  }
  
  /**
   * Apply backpressure to streaming operation
   */
  async applyBackpressure(
    level: BackpressureLevel,
    currentChunk: string
  ): Promise<void> {
    const config = this.BACKPRESSURE_LEVELS[level];
    
    if (level === 'CRITICAL') {
      throw new Error('System under extreme pressure - streaming paused');
    }
    
    // Add delay based on pressure level
    const delay = this.calculateDelay(level);
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  private calculateDelay(level: BackpressureLevel): number {
    switch (level) {
      case 'HEAVY': return 100 + Math.random() * 100;  // 100-200ms
      case 'MODERATE': return 50 + Math.random() * 50;  // 50-100ms
      case 'LIGHT': return 10 + Math.random() * 20;     // 10-30ms
      default: return 0;
    }
  }
}
```

### 4. Error Recovery for Interrupted Streams

#### Stream State Management

```typescript
interface StreamState {
  filePath: string;
  fileSize: number;
  bytesRead: number;
  chunkSize: number;
  lastSuccessfulChunk: number;
  checksum?: string;
  timestamp: number;
}

class StreamRecoveryManager {
  private activeStreams = new Map<string, StreamState>();
  private checkpointInterval = 5; // Checkpoint every 5 chunks
  
  /**
   * Create a recoverable stream
   */
  async createRecoverableStream(
    filePath: string,
    options: StreamOptions
  ): Promise<AsyncGenerator<string>> {
    const state = this.initializeStreamState(filePath, options);
    this.activeStreams.set(filePath, state);
    
    try {
      return this.streamWithRecovery(state);
    } catch (error) {
      await this.handleStreamInterruption(state, error);
      throw error;
    }
  }
  
  /**
   * Stream with automatic checkpointing
   */
  private async *streamWithRecovery(
    state: StreamState
  ): AsyncGenerator<string> {
    const stream = createReadStream(state.filePath, {
      highWaterMark: state.chunkSize,
      start: state.bytesRead // Resume from last position
    });
    
    let chunkNumber = Math.floor(state.bytesRead / state.chunkSize);
    
    try {
      for await (const chunk of stream) {
        yield chunk as string;
        
        state.bytesRead += Buffer.byteLength(chunk as string, 'utf8');
        chunkNumber++;
        
        // Create checkpoint periodically
        if (chunkNumber % this.checkpointInterval === 0) {
          await this.createCheckpoint(state);
        }
      }
      
      // Stream completed successfully
      this.activeStreams.delete(state.filePath);
      
    } catch (error) {
      state.lastSuccessfulChunk = chunkNumber - 1;
      throw error;
    }
  }
  
  /**
   * Attempt to recover interrupted stream
   */
  async attemptRecovery(filePath: string): Promise<boolean> {
    const state = this.activeStreams.get(filePath);
    if (!state) return false;
    
    try {
      // Verify file hasn't changed
      const currentStats = await statAsync(filePath);
      if (currentStats.size !== state.fileSize || currentStats.mtimeMs > state.timestamp) {
        return false; // File changed, cannot recover
      }
      
      // Verify last chunk integrity if checksum available
      if (state.checksum) {
        const isValid = await this.verifyChunkIntegrity(state);
        if (!isValid) return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Create checkpoint for recovery
   */
  private async createCheckpoint(state: StreamState): Promise<void> {
    const checkpoint: StreamCheckpoint = {
      filePath: state.filePath,
      bytesRead: state.bytesRead,
      chunkNumber: Math.floor(state.bytesRead / state.chunkSize),
      timestamp: Date.now()
    };
    
    // Store checkpoint in memory or persistent storage
    await this.persistCheckpoint(checkpoint);
  }
}
```

#### Retry Strategy for Streaming

```typescript
class StreamingRetryManager extends RetryManager {
  /**
   * Create retry manager specifically for streaming operations
   */
  static forStreaming(config: Partial<RetryConfig> = {}): StreamingRetryManager {
    const streamingConfig: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      maxAttempts: 5, // More retries for streaming
      baseDelay: 500, // Faster initial retry
      maxDelay: 10000, // Shorter max delay
      backoffMultiplier: 1.5, // Gentler backoff
      nonRetryableErrors: [
        ...DEFAULT_RETRY_CONFIG.nonRetryableErrors,
        'FILE_CHANGED',
        'CHECKSUM_MISMATCH',
        'PERMISSION_DENIED'
      ]
    };
    
    return new StreamingRetryManager({ ...streamingConfig, ...config });
  }
  
  /**
   * Determine if streaming error is retryable
   */
  isRetryableStreamingError(error: Error, context: StreamingContext): boolean {
    // Don't retry if file has changed during streaming
    if (error.message.includes('FILE_CHANGED')) return false;
    
    // Don't retry if we've made significant progress (>50%)
    if (context.progress.percentage > 50) {
      return false;
    }
    
    // Retry network and temporary I/O errors
    if (error.message.includes('ECONNRESET') || 
        error.message.includes('EBUSY') ||
        error.message.includes('EMFILE')) {
      return true;
    }
    
    return super.isRetryable(error);
  }
}
```

### 5. Resource Cleanup Patterns

#### Cleanup Strategy

```typescript
class ResourceCleanupManager {
  private cleanupTasks = new Set<CleanupTask>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
  
  constructor() {
    this.startCleanupScheduler();
  }
  
  /**
   * Register a resource for cleanup
   */
  registerResource(
    resource: StreamResource,
    priority: 'immediate' | 'normal' | 'deferred' = 'normal'
  ): void {
    const task: CleanupTask = {
      resource,
      priority,
      registeredAt: Date.now(),
      maxAge: this.getMaxAge(priority)
    };
    
    this.cleanupTasks.add(task);
    
    if (priority === 'immediate') {
      this.cleanupResource(task);
    }
  }
  
  /**
   * Cleanup expired or orphaned resources
   */
  private performPeriodicCleanup(): void {
    const now = Date.now();
    const tasksToCleanup: CleanupTask[] = [];
    
    for (const task of this.cleanupTasks) {
      // Check if task has expired
      if (now - task.registeredAt > task.maxAge) {
        tasksToCleanup.push(task);
        continue;
      }
      
      // Check if resource is no longer referenced
      if (this.isOrphaned(task.resource)) {
        tasksToCleanup.push(task);
      }
    }
    
    // Perform cleanup
    for (const task of tasksToCleanup) {
      this.cleanupResource(task);
      this.cleanupTasks.delete(task);
    }
  }
  
  /**
   * Cleanup individual resource
   */
  private cleanupResource(task: CleanupTask): void {
    try {
      const resource = task.resource;
      
      // Close streams
      if (resource.stream && !resource.stream.destroyed) {
        resource.stream.destroy();
      }
      
      // Clear buffers
      if (resource.buffers) {
        resource.buffers.length = 0;
      }
      
      // Remove event listeners
      if (resource.eventListeners) {
        resource.eventListeners.forEach(({ target, event, listener }) => {
          target.removeListener(event, listener);
        });
      }
      
      // Force GC if available
      if (task.priority === 'immediate' && global.gc) {
        global.gc();
      }
      
    } catch (error) {
      console.error('Error during resource cleanup:', error);
    }
  }
  
  /**
   * Emergency cleanup for memory pressure
   */
  emergencyCleanup(): void {
    // Cleanup all deferred resources first
    const deferredTasks = Array.from(this.cleanupTasks)
      .filter(task => task.priority === 'deferred');
    
    for (const task of deferredTasks) {
      this.cleanupResource(task);
      this.cleanupTasks.delete(task);
    }
    
    // If still under pressure, cleanup normal priority tasks
    const memoryStats = process.memoryUsage();
    if (memoryStats.heapUsed / memoryStats.heapTotal > 0.8) {
      const normalTasks = Array.from(this.cleanupTasks)
        .filter(task => task.priority === 'normal')
        .slice(0, Math.floor(normalTasks.length / 2));
      
      for (const task of normalTasks) {
        this.cleanupResource(task);
        this.cleanupTasks.delete(task);
      }
    }
  }
}
```

## Integration Architecture

### Enhanced Streaming Reader

```typescript
class EnhancedStreamingReader extends StreamingReader {
  private adaptiveSizer: AdaptiveChunkSizer;
  private memoryManager: AdaptiveMemoryManager;
  private backpressureController: BackpressureController;
  private recoveryManager: StreamRecoveryManager;
  private cleanupManager: ResourceCleanupManager;
  
  constructor(security: SecurityContext, logger: LoggerFunction, config: StreamingConfig = {}) {
    super(security, logger, config);
    
    this.adaptiveSizer = new AdaptiveChunkSizer(config);
    this.memoryManager = new AdaptiveMemoryManager(config);
    this.backpressureController = new BackpressureController();
    this.recoveryManager = new StreamRecoveryManager();
    this.cleanupManager = new ResourceCleanupManager();
  }
  
  /**
   * Enhanced file reading with all improvements
   */
  async readFileEnhanced(
    filePath: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<StreamingResult> {
    const startTime = Date.now();
    let resource: StreamResource | null = null;
    
    try {
      // Security validation
      const validation = await this.validateAccess(filePath);
      if (!validation.isValid) {
        return this.createErrorResult(validation, startTime);
      }
      
      // Get file stats
      const fileStats = await statAsync(filePath);
      
      // Determine if streaming is needed
      const memoryStats = this.memoryMonitor.getCurrentStats();
      const shouldStream = this.memoryManager.shouldTriggerStreaming(
        fileStats.size, 
        memoryStats
      );
      
      if (!shouldStream) {
        return this.readFileBuffered(filePath, onProgress, startTime);
      }
      
      // Calculate adaptive chunk size
      const baseChunkSize = this.adaptiveSizer.calculateOptimalChunkSize(
        fileStats.size,
        memoryStats,
        this.getThroughputHistory()
      );
      
      const adjustedChunkSize = this.memoryManager.getMemoryAdjustedChunkSize(baseChunkSize);
      
      // Register resource for cleanup
      resource = await this.createStreamResource(filePath, adjustedChunkSize);
      this.cleanupManager.registerResource(resource);
      
      // Perform streaming with backpressure and recovery
      return await this.streamWithEnhancements(
        resource,
        fileStats.size,
        adjustedChunkSize,
        onProgress,
        startTime
      );
      
    } catch (error) {
      // Attempt recovery if possible
      if (resource && await this.recoveryManager.attemptRecovery(filePath)) {
        return this.retryWithRecovery(filePath, onProgress, startTime);
      }
      
      return this.handleStreamError(error, filePath, startTime);
    } finally {
      if (resource) {
        this.cleanupManager.registerResource(resource, 'deferred');
      }
    }
  }
  
  /**
   * Streaming with all enhancements
   */
  private async streamWithEnhancements(
    resource: StreamResource,
    fileSize: number,
    chunkSize: number,
    onProgress?: (progress: StreamingProgress) => void,
    startTime?: number
  ): Promise<StreamingResult> {
    const chunks: string[] = [];
    let bytesRead = 0;
    let chunkNumber = 0;
    let processingTimes: number[] = [];
    
    for await (const chunk of resource.stream) {
      const chunkStartTime = Date.now();
      
      // Apply backpressure if needed
      const memoryStats = this.memoryMonitor.getCurrentStats();
      const activeStreams = this.getActiveStreamCount();
      const avgProcessingTime = processingTimes.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, processingTimes.length);
      
      const backpressureLevel = this.backpressureController.calculateBackpressure(
        memoryStats,
        activeStreams,
        avgProcessingTime
      );
      
      await this.backpressureController.applyBackpressure(backpressureLevel, chunk as string);
      
      // Process chunk
      chunks.push(chunk as string);
      bytesRead += Buffer.byteLength(chunk as string, 'utf8');
      chunkNumber++;
      
      // Track performance
      const processingTime = Date.now() - chunkStartTime;
      processingTimes.push(processingTime);
      if (processingTimes.length > 20) processingTimes.shift();
      
      // Report progress
      if (chunkNumber % 5 === 0 && onProgress) {
        const progress: StreamingProgress = {
          bytesRead,
          totalBytes: fileSize,
          percentage: Math.round((bytesRead / fileSize) * 100),
          chunkNumber,
          totalChunks: Math.ceil(fileSize / chunkSize),
          memoryUsage: memoryStats.heapUsed,
          backpressureLevel,
          processingTime
        };
        onProgress(progress);
      }
    }
    
    const content = chunks.join('');
    const processingTime = Date.now() - (startTime || Date.now());
    
    return {
      content,
      validation: { isValid: true, errors: [] },
      progress: {
        bytesRead,
        totalBytes: fileSize,
        percentage: 100,
        chunkNumber,
        totalChunks: Math.ceil(fileSize / chunkSize),
        memoryUsage: memoryStats.heapUsed
      },
      usedStreaming: true,
      processingTime
    };
  }
}
```

## Performance Metrics & Monitoring

### Key Performance Indicators

1. **Memory Efficiency**
   - Peak memory usage < 50MB
   - Memory growth rate < 1MB/second
   - GC frequency < 1 per 100MB streamed

2. **Throughput Metrics**
   - Minimum throughput: 10MB/second
   - Average throughput: 25MB/second
   - 95th percentile latency: <200ms per chunk

3. **Reliability Metrics**
   - Stream success rate: >99.5%
   - Recovery success rate: >95%
   - Resource cleanup efficiency: >98%

4. **Backpressure Effectiveness**
   - Memory breach prevention: >99%
   - System stability under load: <5% performance degradation

### Monitoring Integration

```typescript
interface StreamingMetrics {
  // Performance metrics
  totalBytesStreamed: number;
  averageThroughput: number;
  peakMemoryUsage: number;
  averageChunkProcessingTime: number;
  
  // Reliability metrics
  streamSuccessCount: number;
  streamFailureCount: number;
  recoveryAttempts: number;
  recoverySuccesses: number;
  
  // Resource metrics
  activeStreams: number;
  averageBackpressureLevel: number;
  cleanupOperationsPerformed: number;
}
```

## Implementation Plan

### Phase 1: Core Architecture Enhancement (2 weeks)
- Implement AdaptiveChunkSizer
- Enhance MemoryManager with adaptive thresholds
- Create BackpressureController
- Update StreamingReader integration

### Phase 2: Error Recovery & Cleanup (2 weeks)
- Implement StreamRecoveryManager
- Create ResourceCleanupManager
- Add checkpointing mechanism
- Integrate retry strategies

### Phase 3: Monitoring & Performance (1 week)
- Add comprehensive metrics collection
- Implement performance dashboards
- Create performance alerting
- Optimize based on real-world data

### Phase 4: Testing & Validation (1 week)
- Performance testing with large files
- Concurrent streaming stress tests
- Memory pressure simulation
- Recovery mechanism validation

## Risk Assessment & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Memory leaks in streaming | High | Low | Comprehensive resource cleanup, memory monitoring |
| Performance regression | Medium | Medium | Baseline performance testing, gradual rollout |
| Complex error scenarios | Medium | High | Extensive error testing, retry mechanisms |
| Resource contention under load | High | Medium | Backpressure control, resource limits |

## Conclusion

This enhanced streaming architecture provides a robust, scalable, and maintainable solution for memory-efficient file reading in OpenSpec. The design builds upon the existing solid foundation while adding critical capabilities for handling large files, system pressure, and error recovery.

The modular approach allows for incremental implementation and testing, reducing risk while delivering immediate value. The comprehensive monitoring and metrics ensure the system can be tuned and optimized based on real-world usage patterns.

The architecture is designed to handle the current requirements while providing room for future enhancements and scaling to support even larger workloads.