/**
 * Memory-efficient streaming resource reader for large files
 * 
 * Features:
 * - 64KB chunk size default with adaptive sizing
 * - 1MB threshold for streaming vs direct read
 * - Size limit validation (100MB max)
 * - Node.js ReadableStream integration
 * - Proper cleanup on errors
 * - Checkpoint-based error recovery
 */

import { createReadStream, stat, readFile } from 'fs';
import { promisify } from 'util';
import { Readable } from 'stream';

const statAsync = promisify(stat);
const readFileAsync = promisify(readFile);

/**
 * Configuration options for streaming operations
 */
export interface StreamOptions {
  /** Chunk size in bytes (default: 64KB) */
  chunkSize?: number;
  /** Encoding for file content (default: 'utf8') */
  encoding?: BufferEncoding;
  /** Maximum file size in bytes (default: 100MB) */
  maxSize?: number;
  /** Streaming threshold in bytes (default: 1MB) */
  streamingThreshold?: number;
  /** Maximum memory usage in bytes (default: 50MB) */
  maxMemoryUsage?: number;
  /** Interval for checkpoints (default: every 10 chunks) */
  checkpointInterval?: number;
  /** Enable adaptive chunk sizing (default: false) */
  adaptiveChunking?: boolean;
}

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  /** Current memory usage in bytes */
  currentUsage: number;
  /** Peak memory usage in bytes */
  peakUsage: number;
  /** Memory limit in bytes */
  limit: number;
}

/**
 * Checkpoint information for error recovery
 */
export interface Checkpoint {
  /** Position in bytes */
  position: number;
  /** Chunk number */
  chunkNumber: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Memory-efficient streaming reader for large files
 */
export class StreamingResourceReader {
  private readonly DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly STREAMING_THRESHOLD = 1024 * 1024; // 1MB
  private readonly DEFAULT_MAX_MEMORY_USAGE = 50 * 1024 * 1024; // 50MB
  private readonly DEFAULT_CHECKPOINT_INTERVAL = 10;
  
  private config: Required<StreamOptions>;
  private memoryUsage: number = 0;
  private peakMemoryUsage: number = 0;
  private checkpointCallback?: (position: number) => void;
  private checkpoints: Checkpoint[] = [];
  private currentChunkNumber: number = 0;

  constructor(options: StreamOptions = {}) {
    this.config = {
      chunkSize: options.chunkSize || this.DEFAULT_CHUNK_SIZE,
      encoding: options.encoding || 'utf8',
      maxSize: options.maxSize || this.MAX_FILE_SIZE,
      streamingThreshold: options.streamingThreshold || this.STREAMING_THRESHOLD,
      maxMemoryUsage: options.maxMemoryUsage || this.DEFAULT_MAX_MEMORY_USAGE,
      checkpointInterval: options.checkpointInterval || this.DEFAULT_CHECKPOINT_INTERVAL,
      adaptiveChunking: options.adaptiveChunking || false
    };
  }

  /**
   * Get the configured chunk size
   */
  getChunkSize(): number {
    return this.config.chunkSize;
  }

  /**
   * Get the configured maximum file size
   */
  getMaxFileSize(): number {
    return this.config.maxSize;
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): MemoryStats {
    return {
      currentUsage: this.memoryUsage,
      peakUsage: this.peakMemoryUsage,
      limit: this.config.maxMemoryUsage
    };
  }

  /**
   * Set checkpoint callback for error recovery
   */
  setCheckpointCallback(callback: (position: number) => void): void {
    this.checkpointCallback = callback;
  }

  /**
   * Get all checkpoints
   */
  getCheckpoints(): Checkpoint[] {
    return [...this.checkpoints];
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints = [];
  }

  /**
   * Stream file contents to MCP client
   * Returns async generator for MCP streaming protocol
   */
  async *streamFile(
    filePath: string,
    options: StreamOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const config = { ...this.config, ...options };
    const chunkSize = this.getAdaptiveChunkSize(filePath, config);
    
    // Validate file exists and is within size limit
    const stats = await this.validateFile(filePath, config.maxSize);
    
    // Create read stream
    const stream = createReadStream(filePath, {
      encoding: config.encoding,
      highWaterMark: chunkSize,
      start: 0,
      end: stats.size - 1
    });

    let bytesRead = 0;
    this.currentChunkNumber = 0;
    this.memoryUsage = 0;

    try {
      for await (const chunk of stream) {
        // Track memory usage - chunk is in memory before yielding
        const chunkLength = Buffer.byteLength(chunk, config.encoding);
        this.memoryUsage += chunkLength;
        this.peakMemoryUsage = Math.max(this.peakMemoryUsage, this.memoryUsage);

        // Check memory limits BEFORE yielding
        if (this.memoryUsage > config.maxMemoryUsage) {
          stream.destroy();
          throw new Error(`Memory limit exceeded: ${this.memoryUsage} > ${config.maxMemoryUsage} bytes`);
        }

        bytesRead += chunkLength;
        this.currentChunkNumber++;

        // Create checkpoint if needed
        if (this.currentChunkNumber % config.checkpointInterval === 0) {
          this.createCheckpoint(bytesRead);
        }

        yield chunk;

        // Reset memory usage after yielding (chunk is no longer in memory)
        this.memoryUsage -= chunkLength;
      }

      // Final checkpoint
      this.createCheckpoint(bytesRead);

    } catch (error) {
      stream.destroy();
      this.cleanup();
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Stream file from a specific checkpoint position
   */
  async *streamFileFromCheckpoint(
    filePath: string,
    checkpointPosition: number,
    options: StreamOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const config = { ...this.config, ...options };
    const chunkSize = this.getAdaptiveChunkSize(filePath, config);
    
    // Validate file
    const stats = await this.validateFile(filePath, config.maxSize);
    
    if (checkpointPosition >= stats.size) {
      throw new Error(`Checkpoint position ${checkpointPosition} exceeds file size ${stats.size}`);
    }

    // Create read stream from checkpoint position
    const stream = createReadStream(filePath, {
      encoding: config.encoding,
      highWaterMark: chunkSize,
      start: checkpointPosition,
      end: stats.size - 1
    });

    let bytesRead = checkpointPosition;
    this.memoryUsage = 0;

    try {
      for await (const chunk of stream) {
        const chunkLength = Buffer.byteLength(chunk, config.encoding);
        this.memoryUsage += chunkLength;
        this.peakMemoryUsage = Math.max(this.peakMemoryUsage, this.memoryUsage);

        if (this.memoryUsage > config.maxMemoryUsage) {
          stream.destroy();
          throw new Error(`Memory limit exceeded: ${this.memoryUsage} > ${config.maxMemoryUsage} bytes`);
        }

        bytesRead += chunkLength;
        yield chunk;
        this.memoryUsage -= chunkLength;
      }

    } catch (error) {
      stream.destroy();
      this.cleanup();
      throw error;
    } finally {
      this.cleanup();
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
    const config = { ...this.config, ...options };
    
    try {
      const stats = await this.validateFile(filePath, config.maxSize);
      
      if (stats.size < config.streamingThreshold) {
        // Small file: read directly
        return await readFileAsync(filePath, config.encoding);
      } else {
        // Large file: use streaming
        return this.streamFile(filePath, options);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a test stream (for testing error handling)
   */
  createTestStream(filePath: string): Readable {
    const stream = createReadStream(filePath, {
      encoding: this.config.encoding,
      highWaterMark: this.config.chunkSize
    });
    return stream;
  }

  /**
   * Validate file exists and is within size limits
   */
  private async validateFile(filePath: string, maxSize: number): Promise<{ size: number; isFile: boolean }> {
    try {
      const stats = await statAsync(filePath);
      
      if (!stats.isFile()) {
        throw new Error(`Not a file: ${filePath}`);
      }
      
      if (stats.size > maxSize) {
        throw new Error(
          `File too large: ${stats.size} bytes (max: ${maxSize})`
        );
      }
      
      return {
        size: stats.size,
        isFile: stats.isFile()
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to access file: ${filePath}`);
    }
  }

  /**
   * Get adaptive chunk size based on file characteristics
   */
  private getAdaptiveChunkSize(_filePath: string, config: Required<StreamOptions>): number {
    if (!config.adaptiveChunking) {
      return config.chunkSize;
    }

    // For now, return the configured chunk size
    // In a real implementation, this could adapt based on file size,
    // available memory, or other factors
    return config.chunkSize;
  }

  /**
   * Create a checkpoint at the current position
   */
  private createCheckpoint(position: number): void {
    const checkpoint: Checkpoint = {
      position,
      chunkNumber: this.currentChunkNumber,
      timestamp: Date.now()
    };

    this.checkpoints.push(checkpoint);

    // Keep only recent checkpoints (last 100)
    if (this.checkpoints.length > 100) {
      this.checkpoints = this.checkpoints.slice(-100);
    }

    // Call checkpoint callback if set
    if (this.checkpointCallback) {
      this.checkpointCallback(position);
    }
  }

  /**
   * Cleanup resources and reset state
   */
  private cleanup(): void {
    this.memoryUsage = 0;
    this.currentChunkNumber = 0;
  }
}