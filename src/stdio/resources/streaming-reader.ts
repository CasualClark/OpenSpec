/**
 * Memory-efficient streaming reader for large files in MCP stdio server
 */

import { createReadStream, stat } from 'fs';
import { promisify } from 'util';
import { SecurityContext, ValidationResult } from '../types/index.js';
import { SandboxManager } from '../security/sandbox.js';
import { InputSanitizer } from '../security/input-sanitizer.js';

const statAsync = promisify(stat);

/**
 * Configuration for streaming operations
 */
export interface StreamingConfig {
  /** Chunk size in bytes (default: 64KB) */
  chunkSize?: number;
  /** Maximum memory usage in bytes (default: 50MB) */
  maxMemoryUsage?: number;
  /** File size threshold for streaming (default: 10MB) */
  streamingThreshold?: number;
  /** Progress callback interval (default: every 5 chunks) */
  progressInterval?: number;
}

/**
 * Progress information for streaming operations
 */
export interface StreamingProgress {
  /** Current bytes read */
  bytesRead: number;
  /** Total file size */
  totalBytes: number;
  /** Percentage complete (0-100) */
  percentage: number;
  /** Current chunk number */
  chunkNumber: number;
  /** Total estimated chunks */
  totalChunks: number;
  /** Memory usage in bytes */
  memoryUsage: number;
}

/**
 * Streaming result with metadata
 */
export interface StreamingResult {
  /** Streamed content (concatenated chunks) */
  content: string;
  /** Final validation result */
  validation: ValidationResult;
  /** Progress information */
  progress: StreamingProgress;
  /** Whether streaming was used */
  usedStreaming: boolean;
  /** Total processing time in milliseconds */
  processingTime: number;
}

/**
 * Memory-efficient streaming reader with security validation
 */
export class StreamingReader {
  private config: Required<StreamingConfig>;
  private memoryUsage: number = 0;
  private peakMemoryUsage: number = 0;

  constructor(
    private security: SecurityContext,
    private logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void,
    config: StreamingConfig = {}
  ) {
    this.config = {
      chunkSize: config.chunkSize || 64 * 1024, // 64KB
      maxMemoryUsage: config.maxMemoryUsage || 50 * 1024 * 1024, // 50MB
      streamingThreshold: config.streamingThreshold || 10 * 1024 * 1024, // 10MB
      progressInterval: config.progressInterval || 5
    };
  }

  /**
   * Read a file with automatic streaming fallback
   */
  async readFile(
    filePath: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<StreamingResult> {
    const startTime = Date.now();
    
    try {
      // Validate file access through sandbox
      const sandbox = new SandboxManager(this.security);
      const validation = await sandbox.checkFileOperation('read', filePath);
      
      if (!validation.isValid) {
        return {
          content: '',
          validation,
          progress: this.createEmptyProgress(),
          usedStreaming: false,
          processingTime: Date.now() - startTime
        };
      }

      // Get file stats to determine reading strategy
      const fileStats = await statAsync(filePath);
      
      // Check if file exceeds maximum allowed size
      if (fileStats.size > this.security.maxFileSize) {
        return {
          content: '',
          validation: {
            isValid: false,
            errors: [{
              path: filePath,
              message: `File size ${fileStats.size} exceeds maximum ${this.security.maxFileSize}`,
              code: 'FILE_TOO_LARGE'
            }]
          },
          progress: this.createEmptyProgress(),
          usedStreaming: false,
          processingTime: Date.now() - startTime
        };
      }

      // Determine reading strategy based on file size
      if (fileStats.size > this.config.streamingThreshold) {
        this.logger('info', `Using streaming for large file: ${filePath} (${fileStats.size} bytes) > threshold (${this.config.streamingThreshold})`);
        return this.readFileStreaming(filePath, fileStats.size, onProgress, startTime);
      } else {
        this.logger('debug', `Using buffered read for small file: ${filePath} (${fileStats.size} bytes) <= threshold (${this.config.streamingThreshold})`);
        return this.readFileBuffered(filePath, onProgress, startTime);
      }
    } catch (error) {
      this.logger('error', `Failed to read file ${filePath}: ${error}`);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: '',
        validation: {
          isValid: false,
          errors: [{
            path: filePath,
            message: `Read failed: ${errorMessage}`,
            code: errorMessage.includes('ENOENT') ? 'READ_ERROR' : 'READ_ERROR'
          }]
        },
        progress: this.createEmptyProgress(),
        usedStreaming: false,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Read file using streaming for large files
   */
  private async readFileStreaming(
    filePath: string,
    fileSize: number,
    onProgress?: (progress: StreamingProgress) => void,
    startTime?: number
  ): Promise<StreamingResult> {
    const chunks: string[] = [];
    let bytesRead = 0;
    let chunkNumber = 0;
    const totalChunks = Math.ceil(fileSize / this.config.chunkSize);

    try {
      const stream = createReadStream(filePath, {
        highWaterMark: this.config.chunkSize
      });

      for await (const chunk of stream) {
        // Convert Buffer to string if needed
        const chunkStr = chunk instanceof Buffer ? chunk.toString('utf8') : chunk;
        
        // Validate chunk for security - allow actual chunk size plus some margin for encoding
        const sanitized = InputSanitizer.sanitize(chunkStr, {
          maxLength: chunkStr.length + 10, // Allow actual length plus margin
          allowHtml: false
        });

        if (!sanitized.isSafe) {
          this.logger('warn', `Chunk sanitization issues: ${JSON.stringify(sanitized.issues)}`);
        }

        chunks.push(sanitized.sanitized);
        bytesRead += chunkStr.length;
        chunkNumber++;

        // Update memory usage tracking
        this.memoryUsage += chunkStr.length;
        this.peakMemoryUsage = Math.max(this.peakMemoryUsage, this.memoryUsage);

        // Check memory limits
        if (this.memoryUsage > this.config.maxMemoryUsage) {
          throw new Error(`Memory usage exceeded ${this.config.maxMemoryUsage} bytes`);
        }

        // Report progress
        if (chunkNumber % this.config.progressInterval === 0 && onProgress) {
          const progress: StreamingProgress = {
            bytesRead,
            totalBytes: fileSize,
            percentage: Math.round((bytesRead / fileSize) * 100),
            chunkNumber,
            totalChunks,
            memoryUsage: this.memoryUsage
          };
          onProgress(progress);
        }
      }

      const content = chunks.join('');
      const processingTime = Date.now() - (startTime || Date.now());
      
      // Final progress report
      if (onProgress) {
        const finalProgress: StreamingProgress = {
          bytesRead,
          totalBytes: fileSize,
          percentage: 100,
          chunkNumber,
          totalChunks,
          memoryUsage: this.memoryUsage
        };
        onProgress(finalProgress);
      }

      return {
        content,
        validation: { isValid: true, errors: [] },
        progress: {
          bytesRead,
          totalBytes: fileSize,
          percentage: 100,
          chunkNumber,
          totalChunks,
          memoryUsage: this.memoryUsage
        },
        usedStreaming: true,
        processingTime
      };

    } catch (error) {
      this.memoryUsage = 0;
      throw error;
    } finally {
      // Reset memory usage tracking
      this.memoryUsage = 0;
    }
  }

  /**
   * Read file using buffered reading for small files
   */
  private async readFileBuffered(
    filePath: string,
    onProgress?: (progress: StreamingProgress) => void,
    startTime?: number
  ): Promise<StreamingResult> {
    const sandbox = new SandboxManager(this.security);
    const result = await sandbox.readFile(filePath);
    
    if (!result.validation.isValid) {
      return {
        content: '',
        validation: result.validation,
        progress: this.createEmptyProgress(),
        usedStreaming: false,
        processingTime: Date.now() - (startTime || Date.now())
      };
    }

    const content = result.content;
    const processingTime = Date.now() - (startTime || Date.now());
    
    // Report progress for buffered read
    if (onProgress) {
      const progress: StreamingProgress = {
        bytesRead: content.length,
        totalBytes: content.length,
        percentage: 100,
        chunkNumber: 1,
        totalChunks: 1,
        memoryUsage: content.length
      };
      onProgress(progress);
    }

    return {
      content,
      validation: { isValid: true, errors: [] },
      progress: {
        bytesRead: content.length,
        totalBytes: content.length,
        percentage: 100,
        chunkNumber: 1,
        totalChunks: 1,
        memoryUsage: content.length
      },
      usedStreaming: false,
      processingTime
    };
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): { current: number; peak: number; limit: number } {
    return {
      current: this.memoryUsage,
      peak: this.peakMemoryUsage,
      limit: this.config.maxMemoryUsage
    };
  }

  /**
   * Reset memory tracking
   */
  resetMemoryTracking(): void {
    this.memoryUsage = 0;
    this.peakMemoryUsage = 0;
  }

  /**
   * Create empty progress object
   */
  private createEmptyProgress(): StreamingProgress {
    return {
      bytesRead: 0,
      totalBytes: 0,
      percentage: 0,
      chunkNumber: 0,
      totalChunks: 0,
      memoryUsage: 0
    };
  }
}