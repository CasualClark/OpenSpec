# Enhanced Streaming Architecture Design

## Overview

This document defines a comprehensive streaming architecture for memory-efficient file reading in OpenSpec, building upon the existing `StreamingReader` implementation. The design introduces sophisticated chunk sizing strategies, intelligent memory management, robust backpressure handling, comprehensive error recovery, and systematic resource cleanup patterns.

## Architecture Goals

1. **Memory Efficiency**: Maintain peak memory usage below 50MB regardless of file size
2. **Performance**: Achieve 10-25MB/second throughput with <200ms chunk latency
3. **Reliability**: >99.5% stream success rate with >95% recovery success
4. **Scalability**: Support 10+ concurrent streams with proper resource isolation
5. **Observability**: Real-time metrics and detailed progress tracking

## 1. Chunk Size Strategy

### 1.1 Adaptive Chunk Sizing

The architecture implements an intelligent chunk sizing algorithm that adapts based on file size, system memory, and throughput performance:

```typescript
interface ChunkConfig {
  defaultChunkSize: 64 * 1024;     // 64KB - optimal balance
  minChunkSize: 4 * 1024;          // 4KB - filesystem alignment minimum
  maxChunkSize: 1024 * 1024;       // 1MB - absolute maximum
  adaptiveSizing: boolean;         // Enable adaptive optimization
  performanceHistorySize: number;   // History samples for optimization
}

class AdaptiveChunkSizer {
  private performanceHistory: ChunkPerformance[] = [];
  
  calculateOptimalChunkSize(
    fileSize: number,
    memoryStats: MemoryStats,
    throughputHistory: number[]
  ): number {
    // Base sizing on file class
    let baseChunk = this.getFileClassChunkSize(fileSize);
    
    // Memory pressure adjustment
    const memoryPressure = memoryStats.heapUsedPercent;
    baseChunk = this.adjustForMemoryPressure(baseChunk, memoryPressure);
    
    // Throughput-based optimization
    baseChunk = this.optimizeForThroughput(baseChunk, throughputHistory);
    
    return Math.round(this.constrainToBounds(baseChunk));
  }
  
  private getFileClassChunkSize(fileSize: number): number {
    if (fileSize < 1 * 1024 * 1024) return 32 * 1024;      // <1MB: 32KB
    if (fileSize < 10 * 1024 * 1024) return 64 * 1024;     // <10MB: 64KB
    if (fileSize < 100 * 1024 * 1024) return 128 * 1024;   // <100MB: 128KB
    return 256 * 1024;                                      // ≥100MB: 256KB
  }
  
  private adjustForMemoryPressure(baseChunk: number, memoryPressure: number): number {
    if (memoryPressure > 80) return baseChunk * 0.5;        // Heavy pressure: halve
    if (memoryPressure > 60) return baseChunk * 0.75;       // Moderate pressure: reduce 25%
    if (memoryPressure < 40) return baseChunk * 1.25;       // Light pressure: increase 25%
    return baseChunk;
  }
  
  private optimizeForThroughput(baseChunk: number, history: number[]): number {
    if (history.length < 3) return baseChunk;
    
    const avgThroughput = history.slice(-5).reduce((a, b) => a + b, 0) / 
                         Math.min(5, history.length);
    
    // If throughput is low, try larger chunks
    if (avgThroughput < 5 * 1024 * 1024) return baseChunk * 1.2;  // <5MB/s
    
    return baseChunk;
  }
}
```

### 1.2 Chunk Performance Tracking

```typescript
interface ChunkPerformance {
  chunkSize: number;
  throughput: number;        // MB/second
  processingTime: number;     // milliseconds
  memoryEfficiency: number;   // bytes per MB of memory used
  timestamp: number;
}

class ChunkPerformanceTracker {
  recordPerformance(
    chunkSize: number,
    bytesProcessed: number,
    processingTime: number,
    memoryUsed: number
  ): void {
    const performance: ChunkPerformance = {
      chunkSize,
      throughput: (bytesProcessed / 1024 / 1024) / (processingTime / 1000),
      processingTime,
      memoryEfficiency: bytesProcessed / (memoryUsed / 1024 / 1024),
      timestamp: Date.now()
    };
    
    this.performanceHistory.push(performance);
    if (this.performanceHistory.length > 10) {
      this.performanceHistory.shift();
    }
  }
  
  getOptimalChunkSizeForCurrentConditions(): number {
    // Weighted scoring based on recent performance
    const recentPerformance = this.performanceHistory.slice(-5);
    const scores = recentPerformance.map(p => ({
      chunkSize: p.chunkSize,
      score: this.calculatePerformanceScore(p)
    }));
    
    return scores.reduce((best, current) => 
      current.score > best.score ? current : best
    ).chunkSize;
  }
  
  private calculatePerformanceScore(perf: ChunkPerformance): number {
    // Weighted scoring: 40% throughput, 30% speed, 30% memory efficiency
    const throughputScore = Math.min(perf.throughput / 50, 1) * 0.4;  // 50MB/s = perfect
    const speedScore = Math.max(0, 1 - (perf.processingTime / 1000)) * 0.3;  // 1s = 0
    const memoryScore = Math.min(perf.memoryEfficiency / 1000, 1) * 0.3;  // 1000:1 = perfect
    
    return throughputScore + speedScore + memoryScore;
  }
}
```

## 2. Memory Thresholds & Management

### 2.1 Multi-Level Memory Threshold System

```typescript
interface MemoryThresholds {
  // Streaming trigger thresholds
  streamingTrigger: number;        // 1MB - switch to streaming mode
  emergencyTrigger: number;        // 100MB - emergency cleanup
  
  // Pressure level thresholds
  warningThreshold: number;        // 60% heap usage - light backpressure
  criticalThreshold: number;       // 75% heap usage - heavy backpressure
  emergencyThreshold: number;      // 85% heap usage - emergency measures
  
  // Absolute limits
  maxMemoryUsage: number;          // 50MB absolute limit per operation
  maxSystemMemory: number;         // 80% of available system memory
  
  // Adaptive configuration
  adaptiveScaling: boolean;
  pressureMultiplier: number;      // Scale down factor under pressure
}

class AdaptiveMemoryManager {
  private thresholds: MemoryThresholds;
  private memoryHistory: MemorySnapshot[] = [];
  
  constructor(config: Partial<MemoryThresholds> = {}) {
    this.thresholds = {
      streamingTrigger: 1 * 1024 * 1024,        // 1MB
      emergencyTrigger: 100 * 1024 * 1024,     // 100MB
      warningThreshold: 60,                     // 60%
      criticalThreshold: 75,                    // 75%
      emergencyThreshold: 85,                   // 85%
      maxMemoryUsage: 50 * 1024 * 1024,        // 50MB
      maxSystemMemory: this.getAvailableSystemMemory() * 0.8,
      adaptiveScaling: true,
      pressureMultiplier: 0.7,
      ...config
    };
  }
  
  shouldTriggerStreaming(fileSize: number, memoryStats: MemoryStats): boolean {
    // Always stream large files
    if (fileSize >= this.thresholds.streamingTrigger) return true;
    
    // Stream smaller files under memory pressure
    const pressureLevel = this.getMemoryPressureLevel(memoryStats);
    if (pressureLevel === 'critical' && fileSize > 256 * 1024) return true;  // 256KB
    if (pressureLevel === 'warning' && fileSize > 512 * 1024) return true;   // 512KB
    
    return false;
  }
  
  getMemoryPressureLevel(memoryStats: MemoryStats): 'normal' | 'warning' | 'critical' | 'emergency' {
    const heapPercent = (memoryStats.heapUsed / memoryStats.heapTotal) * 100;
    
    if (heapPercent >= this.thresholds.emergencyThreshold) return 'emergency';
    if (heapPercent >= this.thresholds.criticalThreshold) return 'critical';
    if (heapPercent >= this.thresholds.warningThreshold) return 'warning';
    return 'normal';
  }
  
  calculateAdjustedLimits(baseChunkSize: number, memoryStats: MemoryStats): {
    maxChunkSize: number;
    maxConcurrentStreams: number;
    readDelay: number;
  } {
    const pressureLevel = this.getMemoryPressureLevel(memoryStats);
    
    switch (pressureLevel) {
      case 'emergency':
        return {
          maxChunkSize: Math.max(4 * 1024, baseChunkSize * 0.25),
          maxConcurrentStreams: 1,
          readDelay: 200  // 200ms delay
        };
      case 'critical':
        return {
          maxChunkSize: Math.max(8 * 1024, baseChunkSize * 0.5),
          maxConcurrentStreams: 2,
          readDelay: 100  // 100ms delay
        };
      case 'warning':
        return {
          maxChunkSize: Math.max(16 * 1024, baseChunkSize * 0.75),
          maxConcurrentStreams: 5,
          readDelay: 50   // 50ms delay
        };
      default:
        return {
          maxChunkSize: baseChunkSize,
          maxConcurrentStreams: 10,
          readDelay: 0
        };
    }
  }
  
  private getAvailableSystemMemory(): number {
    const systemMemory = require('os').totalmem();
    const freeMemory = require('os').freemem();
    return freeMemory;
  }
}
```

### 2.2 Real-time Memory Monitoring

```typescript
interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  activeStreams: number;
  averageThroughput: number;
}

class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private monitoringInterval: NodeJS.Timeout;
  private readonly SNAPSHOT_INTERVAL = 5000;  // 5 seconds
  
  constructor(
    private onMemoryPressure: (level: MemoryPressureLevel) => void,
    private getActiveStreams: () => number,
    private getAverageThroughput: () => number
  ) {
    this.startMonitoring();
  }
  
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const snapshot: MemorySnapshot = {
        timestamp: Date.now(),
        ...process.memoryUsage(),
        activeStreams: this.getActiveStreams(),
        averageThroughput: this.getAverageThroughput()
      };
      
      this.snapshots.push(snapshot);
      if (this.snapshots.length > 60) {  // Keep 5 minutes of history
        this.snapshots.shift();
      }
      
      const pressureLevel = this.analyzeMemoryTrend();
      if (pressureLevel !== 'normal') {
        this.onMemoryPressure(pressureLevel);
      }
    }, this.SNAPSHOT_INTERVAL);
  }
  
  private analyzeMemoryTrend(): MemoryPressureLevel {
    if (this.snapshots.length < 3) return 'normal';
    
    const recent = this.snapshots.slice(-5);
    const heapGrowthRate = this.calculateGrowthRate(recent.map(s => s.heapUsed));
    const currentUsage = recent[recent.length - 1].heapUsed / recent[recent.length - 1].heapTotal;
    
    // Check for rapid growth or high usage
    if (currentUsage > 0.85 || heapGrowthRate > 0.1) return 'emergency';
    if (currentUsage > 0.75 || heapGrowthRate > 0.05) return 'critical';
    if (currentUsage > 0.6 || heapGrowthRate > 0.02) return 'warning';
    
    return 'normal';
  }
  
  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;
    
    const first = values[0];
    const last = values[values.length - 1];
    const timeSpan = values.length * this.SNAPSHOT_INTERVAL * 1000; // ms
    
    return (last - first) / first / (timeSpan / 1000); // per second
  }
  
  getCurrentStats(): MemoryStats {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
      heapUsedPercent: (mem.heapUsed / mem.heapTotal) * 100,
      growthRate: this.calculateGrowthRate(this.snapshots.map(s => s.heapUsed))
    };
  }
  
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
}
```

## 3. Backpressure Handling

### 3.1 Multi-Factor Backpressure System

```typescript
interface BackpressureFactors {
  memoryPressure: number;      // 0-40 points
  concurrencyPressure: number; // 0-30 points
  throughputPressure: number;  // 0-30 points
  totalScore: number;          // 0-100 points
}

type BackpressureLevel = 'NONE' | 'LIGHT' | 'MODERATE' | 'HEAVY' | 'CRITICAL';

interface BackpressureConfig {
  multiplier: number;           // Speed reduction factor
  maxConcurrentStreams: number; // Concurrent stream limit
  readDelay: number;           // Delay between reads (ms)
  emergencyAction?: () => void; // Emergency callback
}

class BackpressureController {
  private readonly BACKPRESSURE_CONFIGS: Record<BackpressureLevel, BackpressureConfig> = {
    NONE: {
      multiplier: 1.0,
      maxConcurrentStreams: 10,
      readDelay: 0
    },
    LIGHT: {
      multiplier: 0.8,
      maxConcurrentStreams: 6,
      readDelay: 10 + Math.random() * 20  // 10-30ms
    },
    MODERATE: {
      multiplier: 0.5,
      maxConcurrentStreams: 3,
      readDelay: 50 + Math.random() * 50   // 50-100ms
    },
    HEAVY: {
      multiplier: 0.25,
      maxConcurrentStreams: 1,
      readDelay: 100 + Math.random() * 100 // 100-200ms
    },
    CRITICAL: {
      multiplier: 0.1,
      maxConcurrentStreams: 0,
      readDelay: 500,
      emergencyAction: () => this.emergencyCleanup()
    }
  };
  
  calculateBackpressureLevel(
    memoryStats: MemoryStats,
    activeStreams: number,
    avgThroughput: number,
    avgProcessingTime: number
  ): BackpressureLevel {
    const factors = this.calculateBackpressureFactors(
      memoryStats,
      activeStreams,
      avgThroughput,
      avgProcessingTime
    );
    
    // Determine level based on total score
    if (factors.totalScore >= 80) return 'CRITICAL';
    if (factors.totalScore >= 60) return 'HEAVY';
    if (factors.totalScore >= 40) return 'MODERATE';
    if (factors.totalScore >= 20) return 'LIGHT';
    return 'NONE';
  }
  
  private calculateBackpressureFactors(
    memoryStats: MemoryStats,
    activeStreams: number,
    avgThroughput: number,
    avgProcessingTime: number
  ): BackpressureFactors {
    // Memory pressure (0-40 points)
    let memoryPressure = 0;
    if (memoryStats.heapUsedPercent > 80) memoryPressure = 40;
    else if (memoryStats.heapUsedPercent > 70) memoryPressure = 30;
    else if (memoryStats.heapUsedPercent > 60) memoryPressure = 20;
    else if (memoryStats.heapUsedPercent > 50) memoryPressure = 10;
    
    // Concurrency pressure (0-30 points)
    let concurrencyPressure = 0;
    if (activeStreams > 8) concurrencyPressure = 30;
    else if (activeStreams > 5) concurrencyPressure = 20;
    else if (activeStreams > 3) concurrencyPressure = 10;
    
    // Throughput pressure (0-30 points)
    let throughputPressure = 0;
    if (avgThroughput < 2 * 1024 * 1024) throughputPressure = 30;  // <2MB/s
    else if (avgThroughput < 5 * 1024 * 1024) throughputPressure = 20; // <5MB/s
    else if (avgThroughput < 10 * 1024 * 1024) throughputPressure = 10; // <10MB/s
    
    // Processing time pressure
    if (avgProcessingTime > 1000) throughputPressure = Math.min(30, throughputPressure + 20);
    else if (avgProcessingTime > 500) throughputPressure = Math.min(30, throughputPressure + 10);
    
    const totalScore = memoryPressure + concurrencyPressure + throughputPressure;
    
    return {
      memoryPressure,
      concurrencyPressure,
      throughputPressure,
      totalScore
    };
  }
  
  async applyBackpressure(
    level: BackpressureLevel,
    currentChunk: string
  ): Promise<void> {
    const config = this.BACKPRESSURE_CONFIGS[level];
    
    // Handle critical backpressure
    if (level === 'CRITICAL') {
      if (config.emergencyAction) {
        config.emergencyAction();
      }
      throw new Error('System under extreme pressure - streaming paused');
    }
    
    // Apply delay if configured
    if (config.readDelay > 0) {
      await this.delay(config.readDelay);
    }
    
    // Return adjusted chunk if needed
    if (level === 'HEAVY' && currentChunk.length > 32 * 1024) {
      // In heavy pressure, return smaller chunks
      return currentChunk.slice(0, 32 * 1024);
    }
  }
  
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private emergencyCleanup(): void {
    // Trigger immediate resource cleanup
    process.emit('emergency-cleanup', {
      reason: 'extreme-backpressure',
      timestamp: Date.now()
    });
  }
}
```

### 3.2 Adaptive Rate Limiting

```typescript
class AdaptiveRateLimiter {
  private requestTimes: number[] = [];
  private currentRateLimit: number = 10; // Start with 10 requests/second
  private readonly MIN_RATE_LIMIT = 1;
  private readonly MAX_RATE_LIMIT = 50;
  
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Clean old requests (older than 1 second)
    this.requestTimes = this.requestTimes.filter(time => now - time < 1000);
    
    // Check if we're at the limit
    if (this.requestTimes.length >= this.currentRateLimit) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = 1000 - (now - oldestRequest);
      
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }
    
    this.requestTimes.push(now);
    this.adaptRateLimit();
  }
  
  private adaptRateLimit(): void {
    const recentRequests = this.requestTimes.length;
    const currentLoad = recentRequests / this.currentRateLimit;
    
    if (currentLoad > 0.9) {
      // High load - reduce rate
      this.currentRateLimit = Math.max(
        this.MIN_RATE_LIMIT,
        Math.floor(this.currentRateLimit * 0.9)
      );
    } else if (currentLoad < 0.5) {
      // Low load - increase rate
      this.currentRateLimit = Math.min(
        this.MAX_RATE_LIMIT,
        Math.ceil(this.currentRateLimit * 1.1)
      );
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## 4. Error Recovery for Interrupted Streams

### 4.1 Stream State Management & Checkpointing

```typescript
interface StreamState {
  filePath: string;
  fileSize: number;
  fileMtime: number;           // Modification time for integrity
  bytesRead: number;
  chunkSize: number;
  lastSuccessfulChunk: number;
  checksum?: string;
  timestamp: number;
  streamId: string;
}

interface StreamCheckpoint {
  streamId: string;
  filePath: string;
  bytesRead: number;
  chunkNumber: number;
  checksum: string;
  timestamp: number;
}

class StreamRecoveryManager {
  private activeStreams = new Map<string, StreamState>();
  private checkpoints = new Map<string, StreamCheckpoint>();
  private readonly CHECKPOINT_INTERVAL = 5; // Every 5 chunks
  private readonly MAX_CHECKPOINTS = 20;
  
  async createRecoverableStream(
    filePath: string,
    options: StreamOptions
  ): Promise<{ streamId: string; generator: AsyncGenerator<string> }> {
    const streamId = this.generateStreamId();
    const stats = await statAsync(filePath);
    
    const state: StreamState = {
      filePath,
      fileSize: stats.size,
      fileMtime: stats.mtimeMs,
      bytesRead: 0,
      chunkSize: options.chunkSize || 64 * 1024,
      lastSuccessfulChunk: 0,
      timestamp: Date.now(),
      streamId
    };
    
    this.activeStreams.set(streamId, state);
    
    // Check for existing checkpoint
    const checkpoint = await this.loadCheckpoint(filePath);
    if (checkpoint && await this.validateCheckpoint(checkpoint)) {
      state.bytesRead = checkpoint.bytesRead;
      state.lastSuccessfulChunk = checkpoint.chunkNumber;
    }
    
    const generator = this.streamWithRecovery(state);
    
    return { streamId, generator };
  }
  
  private async *streamWithRecovery(
    state: StreamState
  ): AsyncGenerator<string> {
    const stream = createReadStream(state.filePath, {
      highWaterMark: state.chunkSize,
      start: state.bytesRead // Resume from last position
    });
    
    let chunkNumber = Math.floor(state.bytesRead / state.chunkSize);
    let runningChecksum = this.calculateInitialChecksum(state);
    
    try {
      for await (const chunk of stream) {
        const chunkStr = chunk instanceof Buffer ? chunk.toString('utf8') : chunk;
        
        // Update checksum
        runningChecksum = this.updateChecksum(runningChecksum, chunkStr);
        
        yield chunkStr;
        
        state.bytesRead += Buffer.byteLength(chunkStr, 'utf8');
        chunkNumber++;
        state.lastSuccessfulChunk = chunkNumber;
        
        // Create checkpoint periodically
        if (chunkNumber % this.CHECKPOINT_INTERVAL === 0) {
          await this.createCheckpoint(state, runningChecksum);
        }
      }
      
      // Stream completed successfully
      this.activeStreams.delete(state.streamId);
      await this.removeCheckpoint(state.filePath);
      
    } catch (error) {
      state.lastSuccessfulChunk = chunkNumber - 1;
      await this.handleStreamError(state, error);
      throw error;
    }
  }
  
  async attemptRecovery(streamId: string): Promise<boolean> {
    const state = this.activeStreams.get(streamId);
    if (!state) return false;
    
    try {
      // Verify file hasn't changed
      const currentStats = await statAsync(state.filePath);
      if (currentStats.size !== state.fileSize || 
          currentStats.mtimeMs !== state.fileMtime) {
        return false; // File changed, cannot recover
      }
      
      // Verify last checkpoint integrity
      const checkpoint = await this.loadCheckpoint(state.filePath);
      if (checkpoint && !await this.validateCheckpoint(checkpoint)) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  private async createCheckpoint(state: StreamState, checksum: string): Promise<void> {
    const checkpoint: StreamCheckpoint = {
      streamId: state.streamId,
      filePath: state.filePath,
      bytesRead: state.bytesRead,
      chunkNumber: Math.floor(state.bytesRead / state.chunkSize),
      checksum,
      timestamp: Date.now()
    };
    
    // Store in memory (could be persisted for long-running operations)
    this.checkpoints.set(state.filePath, checkpoint);
    
    // Cleanup old checkpoints
    if (this.checkpoints.size > this.MAX_CHECKPOINTS) {
      const oldest = Array.from(this.checkpoints.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];
      this.checkpoints.delete(oldest[0]);
    }
  }
  
  private async validateCheckpoint(checkpoint: StreamCheckpoint): Promise<boolean> {
    try {
      const state = this.activeStreams.get(checkpoint.streamId);
      if (!state) return false;
      
      // Verify file metadata
      const stats = await statAsync(checkpoint.filePath);
      if (stats.size !== state.fileSize || stats.mtimeMs !== state.fileMtime) {
        return false;
      }
      
      // Verify checkpoint checksum if available
      if (checkpoint.checksum) {
        // Re-read the checkpointed portion and verify checksum
        const actualChecksum = await this.calculateFileChecksum(
          checkpoint.filePath,
          0,
          checkpoint.bytesRead
        );
        
        return actualChecksum === checkpoint.checksum;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  private calculateInitialChecksum(state: StreamState): string {
    // Initialize checksum based on file metadata
    const metadata = `${state.filePath}:${state.fileSize}:${state.fileMtime}`;
    return this.simpleHash(metadata);
  }
  
  private updateChecksum(currentChecksum: string, data: string): string {
    // Simple rolling checksum (could use CRC32 or SHA256 for production)
    return this.simpleHash(currentChecksum + data);
  }
  
  private simpleHash(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
  
  private generateStreamId(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 4.2 Intelligent Retry Strategy

```typescript
interface RetryContext {
  attemptNumber: number;
  lastError: Error;
  streamProgress: number;      // Percentage completed
  bytesProcessed: number;
  timeElapsed: number;         // milliseconds
}

class StreamingRetryManager {
  private readonly RETRY_STRATEGIES = {
    NETWORK_ERROR: {
      maxAttempts: 5,
      baseDelay: 500,
      maxDelay: 10000,
      backoffMultiplier: 1.5,
      recoverable: true
    },
    FILE_SYSTEM_ERROR: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2.0,
      recoverable: true
    },
    MEMORY_ERROR: {
      maxAttempts: 2,
      baseDelay: 2000,
      maxDelay: 3000,
      backoffMultiplier: 1.0,
      recoverable: true
    },
    PERMISSION_ERROR: {
      maxAttempts: 1,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1.0,
      recoverable: false
    },
    FILE_CHANGED: {
      maxAttempts: 1,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1.0,
      recoverable: false
    }
  };
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: Partial<RetryContext> = {}
  ): Promise<T> {
    const errorType = this.classifyError(context.lastError);
    const strategy = this.RETRY_STRATEGIES[errorType];
    
    if (!strategy.recoverable) {
      throw context.lastError;
    }
    
    let attemptNumber = context.attemptNumber || 0;
    const maxAttempts = strategy.maxAttempts;
    
    while (attemptNumber < maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        attemptNumber++;
        
        if (attemptNumber >= maxAttempts) {
          throw error;
        }
        
        const delay = this.calculateRetryDelay(strategy, attemptNumber);
        await this.delay(delay);
        
        // Update context for next attempt
        context.lastError = error as Error;
        context.attemptNumber = attemptNumber;
      }
    }
    
    throw context.lastError;
  }
  
  private classifyError(error?: Error): keyof typeof this.RETRY_STRATEGIES {
    if (!error) return 'NETWORK_ERROR';
    
    const message = error.message.toLowerCase();
    
    if (message.includes('econnreset') || message.includes('etimedout')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('enoent') || message.includes('eacces')) {
      return 'FILE_SYSTEM_ERROR';
    }
    if (message.includes('memory') || message.includes('heap')) {
      return 'MEMORY_ERROR';
    }
    if (message.includes('eperm') || message.includes('eacces')) {
      return 'PERMISSION_ERROR';
    }
    if (message.includes('file changed') || message.includes('mtime')) {
      return 'FILE_CHANGED';
    }
    
    return 'NETWORK_ERROR';
  }
  
  private calculateRetryDelay(strategy: any, attemptNumber: number): number {
    const delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attemptNumber - 1);
    return Math.min(delay, strategy.maxDelay);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  shouldRetry(error: Error, context: RetryContext): boolean {
    // Don't retry if we've made significant progress (>75%)
    if (context.streamProgress > 75) {
      return false;
    }
    
    // Don't retry if the error is non-recoverable
    const errorType = this.classifyError(error);
    return this.RETRY_STRATEGIES[errorType].recoverable;
  }
}
```

## 5. Resource Cleanup Patterns

### 5.1 Hierarchical Resource Management

```typescript
type CleanupPriority = 'immediate' | 'high' | 'normal' | 'low' | 'deferred';

interface StreamResource {
  id: string;
  type: 'stream' | 'buffer' | 'file' | 'listener';
  resource: any;
  createdAt: number;
  lastAccessed: number;
  size?: number;  // Approximate memory size in bytes
  metadata?: Record<string, any>;
}

interface CleanupTask {
  resource: StreamResource;
  priority: CleanupPriority;
  registeredAt: number;
  maxAge: number;
  cleanupFunction: (resource: StreamResource) => Promise<void>;
}

class ResourceCleanupManager {
  private resources = new Map<string, StreamResource>();
  private cleanupTasks = new Set<CleanupTask>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL = 30000;  // 30 seconds
  private readonly DEFAULT_MAX_AGE = 300000;  // 5 minutes
  
  constructor() {
    this.startCleanupScheduler();
    this.setupEmergencyHandlers();
  }
  
  registerResource(
    resource: any,
    type: StreamResource['type'],
    priority: CleanupPriority = 'normal',
    options: Partial<{ size: number; maxAge: number; metadata: Record<string, any> }> = {}
  ): string {
    const resourceId = this.generateResourceId();
    const streamResource: StreamResource = {
      id: resourceId,
      type,
      resource,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      size: options.size,
      metadata: options.metadata
    };
    
    this.resources.set(resourceId, streamResource);
    
    // Create cleanup task
    const maxAge = options.maxAge || this.getDefaultMaxAge(priority);
    const cleanupTask: CleanupTask = {
      resource: streamResource,
      priority,
      registeredAt: Date.now(),
      maxAge,
      cleanupFunction: this.getCleanupFunction(type)
    };
    
    this.cleanupTasks.add(cleanupTask);
    
    if (priority === 'immediate') {
      this.cleanupResource(cleanupTask);
    }
    
    return resourceId;
  }
  
  accessResource(resourceId: string): StreamResource | null {
    const resource = this.resources.get(resourceId);
    if (resource) {
      resource.lastAccessed = Date.now();
      return resource;
    }
    return null;
  }
  
  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, this.CLEANUP_INTERVAL);
  }
  
  private async performPeriodicCleanup(): Promise<void> {
    const now = Date.now();
    const tasksToCleanup: CleanupTask[] = [];
    
    for (const task of this.cleanupTasks) {
      const shouldCleanup = this.shouldCleanupResource(task, now);
      if (shouldCleanup) {
        tasksToCleanup.push(task);
      }
    }
    
    // Perform cleanup in priority order
    tasksToCleanup.sort((a, b) => this.getPriorityWeight(a.priority) - this.getPriorityWeight(b.priority));
    
    for (const task of tasksToCleanup) {
      await this.cleanupResource(task);
      this.cleanupTasks.delete(task);
      this.resources.delete(task.resource.id);
    }
  }
  
  private shouldCleanupResource(task: CleanupTask, now: number): boolean {
    const resource = task.resource;
    const age = now - task.registeredAt;
    const timeSinceAccess = now - resource.lastAccessed;
    
    // Age-based cleanup
    if (age > task.maxAge) return true;
    
    // Access-based cleanup for lower priority resources
    if (task.priority === 'low' && timeSinceAccess > 60000) return true;  // 1 minute
    if (task.priority === 'deferred' && timeSinceAccess > 30000) return true; // 30 seconds
    
    // Memory pressure cleanup
    const memoryUsage = process.memoryUsage();
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    if (heapUsagePercent > 75 && task.priority !== 'immediate') return true;
    
    return false;
  }
  
  private async cleanupResource(task: CleanupTask): Promise<void> {
    try {
      await task.cleanupFunction(task.resource);
    } catch (error) {
      console.error(`Error cleaning up resource ${task.resource.id}:`, error);
    }
  }
  
  private getCleanupFunction(type: StreamResource['type']): (resource: StreamResource) => Promise<void> {
    return async (resource: StreamResource) => {
      switch (type) {
        case 'stream':
          if (resource.resource && typeof resource.resource.destroy === 'function') {
            resource.resource.destroy();
          }
          break;
          
        case 'buffer':
          if (resource.resource && Array.isArray(resource.resource)) {
            resource.resource.length = 0;
          }
          break;
          
        case 'file':
          if (resource.resource && typeof resource.resource.close === 'function') {
            await resource.resource.close();
          }
          break;
          
        case 'listener':
          if (resource.resource && resource.resource.target && resource.resource.event) {
            resource.resource.target.removeListener(resource.resource.event, resource.resource.listener);
          }
          break;
      }
    };
  }
  
  async emergencyCleanup(): Promise<void> {
    console.warn('Performing emergency resource cleanup...');
    
    // Cleanup all deferred and low priority resources first
    const emergencyTasks = Array.from(this.cleanupTasks).filter(task => 
      task.priority === 'deferred' || task.priority === 'low'
    );
    
    for (const task of emergencyTasks) {
      await this.cleanupResource(task);
      this.cleanupTasks.delete(task);
      this.resources.delete(task.resource.id);
    }
    
    // If still under pressure, cleanup normal priority resources
    const memoryUsage = process.memoryUsage();
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    if (heapUsagePercent > 80) {
      const normalTasks = Array.from(this.cleanupTasks)
        .filter(task => task.priority === 'normal')
        .slice(0, Math.floor(normalTasks.length / 2));
      
      for (const task of normalTasks) {
        await this.cleanupResource(task);
        this.cleanupTasks.delete(task);
        this.resources.delete(task.resource.id);
      }
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  private setupEmergencyHandlers(): void {
    process.on('emergency-cleanup', async () => {
      await this.emergencyCleanup();
    });
    
    process.on('beforeExit', async () => {
      await this.cleanupAll();
    });
  }
  
  private async cleanupAll(): Promise<void> {
    const allTasks = Array.from(this.cleanupTasks);
    for (const task of allTasks) {
      await this.cleanupResource(task);
    }
    this.cleanupTasks.clear();
    this.resources.clear();
  }
  
  private getPriorityWeight(priority: CleanupPriority): number {
    const weights = { immediate: 1, high: 2, normal: 3, low: 4, deferred: 5 };
    return weights[priority];
  }
  
  private getDefaultMaxAge(priority: CleanupPriority): number {
    const ages = {
      immediate: 0,
      high: 60000,       // 1 minute
      normal: 300000,    // 5 minutes
      low: 600000,       // 10 minutes
      deferred: 1800000  // 30 minutes
    };
    return ages[priority];
  }
  
  private generateResourceId(): string {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getCleanupStats(): {
    totalResources: number;
    resourcesByType: Record<string, number>;
    resourcesByPriority: Record<CleanupPriority, number>;
    totalMemoryEstimate: number;
  } {
    const resourcesByType: Record<string, number> = {};
    const resourcesByPriority: Record<CleanupPriority, number> = {
      immediate: 0, high: 0, normal: 0, low: 0, deferred: 0
    };
    
    let totalMemoryEstimate = 0;
    
    for (const resource of this.resources.values()) {
      resourcesByType[resource.type] = (resourcesByType[resource.type] || 0) + 1;
      
      const task = Array.from(this.cleanupTasks).find(t => t.resource.id === resource.id);
      if (task) {
        resourcesByPriority[task.priority]++;
      }
      
      totalMemoryEstimate += resource.size || 0;
    }
    
    return {
      totalResources: this.resources.size,
      resourcesByType,
      resourcesByPriority,
      totalMemoryEstimate
    };
  }
}
```

## 6. Integration & Implementation

### 6.1 Enhanced Streaming Reader

```typescript
class EnhancedStreamingReader extends StreamingReader {
  private adaptiveSizer: AdaptiveChunkSizer;
  private memoryManager: AdaptiveMemoryManager;
  private backpressureController: BackpressureController;
  private recoveryManager: StreamRecoveryManager;
  private cleanupManager: ResourceCleanupManager;
  private memoryMonitor: MemoryMonitor;
  private rateLimiter: AdaptiveRateLimiter;
  
  constructor(
    security: SecurityContext,
    logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void,
    config: StreamingConfig = {}
  ) {
    super(security, logger, config);
    
    this.adaptiveSizer = new AdaptiveChunkSizer();
    this.memoryManager = new AdaptiveMemoryManager();
    this.backpressureController = new BackpressureController();
    this.recoveryManager = new StreamRecoveryManager();
    this.cleanupManager = new ResourceCleanupManager();
    this.rateLimiter = new AdaptiveRateLimiter();
    
    // Setup memory monitoring
    this.memoryMonitor = new MemoryMonitor(
      (level) => this.handleMemoryPressure(level),
      () => this.getActiveStreamCount(),
      () => this.getAverageThroughput()
    );
  }
  
  async readFileEnhanced(
    filePath: string,
    onProgress?: (progress: EnhancedStreamingProgress) => void
  ): Promise<EnhancedStreamingResult> {
    const startTime = Date.now();
    let resourceId: string | null = null;
    
    try {
      // Security validation
      const validation = await this.validateAccess(filePath);
      if (!validation.isValid) {
        return this.createErrorResult(validation, startTime);
      }
      
      // Get file stats
      const fileStats = await statAsync(filePath);
      
      // Determine streaming strategy
      const memoryStats = this.memoryMonitor.getCurrentStats();
      const shouldStream = this.memoryManager.shouldTriggerStreaming(fileStats.size, memoryStats);
      
      if (!shouldStream) {
        return this.readFileBuffered(filePath, onProgress, startTime);
      }
      
      // Calculate optimal chunk size
      const baseChunkSize = this.adaptiveSizer.calculateOptimalChunkSize(
        fileStats.size,
        memoryStats,
        this.getThroughputHistory()
      );
      
      const adjustedLimits = this.memoryManager.calculateAdjustedLimits(baseChunkSize, memoryStats);
      const adjustedChunkSize = Math.min(baseChunkSize, adjustedLimits.maxChunkSize);
      
      // Register resource for cleanup
      resourceId = this.cleanupManager.registerResource(
        null, // Will be set after stream creation
        'stream',
        'normal',
        { size: fileStats.size, maxAge: 600000 } // 10 minutes max age
      );
      
      // Perform enhanced streaming
      return await this.streamWithAllEnhancements(
        filePath,
        fileStats.size,
        adjustedChunkSize,
        adjustedLimits,
        onProgress,
        startTime
      );
      
    } catch (error) {
      // Attempt recovery if possible
      if (await this.recoveryManager.attemptRecovery(resourceId || '')) {
        return this.retryWithRecovery(filePath, onProgress, startTime);
      }
      
      return this.handleStreamError(error, filePath, startTime);
    } finally {
      if (resourceId) {
        this.cleanupManager.registerResource(
          this.cleanupManager.accessResource(resourceId),
          'stream',
          'deferred'
        );
      }
    }
  }
  
  private async streamWithAllEnhancements(
    filePath: string,
    fileSize: number,
    chunkSize: number,
    limits: any,
    onProgress?: (progress: EnhancedStreamingProgress) => void,
    startTime?: number
  ): Promise<EnhancedStreamingResult> {
    const chunks: string[] = [];
    let bytesRead = 0;
    let chunkNumber = 0;
    let processingTimes: number[] = [];
    let activeStreamCount = 0;
    
    const stream = createReadStream(filePath, {
      highWaterMark: chunkSize
    });
    
    // Register stream resource
    const resourceId = this.cleanupManager.registerResource(
      stream,
      'stream',
      'normal',
      { size: fileSize }
    );
    
    try {
      for await (const chunk of stream) {
        const chunkStartTime = Date.now();
        
        // Apply rate limiting
        await this.rateLimiter.waitForSlot();
        
        // Get current system state
        const memoryStats = this.memoryMonitor.getCurrentStats();
        const avgProcessingTime = processingTimes.slice(-5).reduce((a, b) => a + b, 0) / 
                                 Math.min(5, processingTimes.length);
        
        // Calculate and apply backpressure
        const backpressureLevel = this.backpressureController.calculateBackpressureLevel(
          memoryStats,
          this.getActiveStreamCount(),
          this.getAverageThroughput(),
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
          const progress: EnhancedStreamingProgress = {
            bytesRead,
            totalBytes: fileSize,
            percentage: Math.round((bytesRead / fileSize) * 100),
            chunkNumber,
            totalChunks: Math.ceil(fileSize / chunkSize),
            memoryUsage: memoryStats.heapUsed,
            backpressureLevel,
            processingTime,
            throughput: (bytesRead / 1024 / 1024) / ((Date.now() - (startTime || Date.now())) / 1000)
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
          memoryUsage: memoryStats.heapUsed,
          backpressureLevel: 'NONE',
          processingTime,
          throughput: (bytesRead / 1024 / 1024) / (processingTime / 1000)
        },
        usedStreaming: true,
        processingTime,
        metrics: this.collectMetrics()
      };
      
    } finally {
      this.cleanupManager.registerResource(
        this.cleanupManager.accessResource(resourceId),
        'stream',
        'immediate'
      );
    }
  }
  
  private handleMemoryPressure(level: MemoryPressureLevel): void {
    this.logger('warn', `Memory pressure detected: ${level}`);
    
    switch (level) {
      case 'emergency':
        this.cleanupManager.emergencyCleanup();
        break;
      case 'critical':
        // Force garbage collection and reduce active streams
        if (global.gc) global.gc();
        this.rateLimiter.setMaxRateLimit(2); // Reduce to 2 ops/sec
        break;
      case 'warning':
        this.rateLimiter.setMaxRateLimit(5); // Reduce to 5 ops/sec
        break;
    }
  }
  
  private collectMetrics(): StreamingMetrics {
    return {
      totalBytesStreamed: this.getTotalBytesStreamed(),
      averageThroughput: this.getAverageThroughput(),
      peakMemoryUsage: this.memoryMonitor.getCurrentStats().heapUsed,
      averageChunkProcessingTime: this.getAverageProcessingTime(),
      streamSuccessCount: this.getStreamSuccessCount(),
      streamFailureCount: this.getStreamFailureCount(),
      recoveryAttempts: this.getRecoveryAttempts(),
      recoverySuccesses: this.getRecoverySuccesses(),
      activeStreams: this.getActiveStreamCount(),
      averageBackpressureLevel: this.getAverageBackpressureLevel(),
      cleanupOperationsPerformed: this.cleanupManager.getCleanupStats().totalResources
    };
  }
  
  // Helper methods would be implemented here
  private getActiveStreamCount(): number { return 0; }
  private getAverageThroughput(): number { return 0; }
  private getThroughputHistory(): number[] { return []; }
  private getTotalBytesStreamed(): number { return 0; }
  private getAverageProcessingTime(): number { return 0; }
  private getStreamSuccessCount(): number { return 0; }
  private getStreamFailureCount(): number { return 0; }
  private getRecoveryAttempts(): number { return 0; }
  private getRecoverySuccesses(): number { return 0; }
  private getAverageBackpressureLevel(): string { return 'NONE'; }
}
```

## Implementation Plan

### Phase 1: Core Architecture (Week 1-2)
- Implement AdaptiveChunkSizer and ChunkPerformanceTracker
- Enhance MemoryManager with multi-level thresholds
- Create BackpressureController with multi-factor analysis
- Update existing StreamingReader to use new components

### Phase 2: Recovery & Cleanup (Week 3-4)
- Implement StreamRecoveryManager with checkpointing
- Create ResourceCleanupManager with hierarchical cleanup
- Add StreamingRetryManager with intelligent strategies
- Integrate with existing error handling

### Phase 3: Monitoring & Optimization (Week 5)
- Implement comprehensive metrics collection
- Add real-time memory monitoring
- Create performance dashboards and alerting
- Optimize based on real-world performance data

### Phase 4: Testing & Validation (Week 6)
- Performance testing with various file sizes
- Concurrent streaming stress tests
- Memory pressure simulation and validation
- Error recovery and cleanup mechanism testing

This architecture provides a robust, scalable, and maintainable foundation for memory-efficient file streaming while building upon the existing solid implementation in OpenSpec.