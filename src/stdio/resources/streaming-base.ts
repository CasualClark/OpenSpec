/**
 * Enhanced base resource provider with streaming support
 */

import { BaseResourceProvider } from './base.js';
import { ResourceContent, SecurityContext } from '../types/index.js';
import { StreamingReader, StreamingConfig, StreamingProgress } from './streaming-reader.js';

export abstract class StreamingBaseResourceProvider extends BaseResourceProvider {
  protected streamingReader: StreamingReader;

  constructor(
    security: SecurityContext,
    logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void,
    streamingConfig?: StreamingConfig,
    accessControl?: any
  ) {
    super(security, logger, accessControl);
    this.streamingReader = new StreamingReader(security, logger, streamingConfig);
  }

  /**
   * Read a file with streaming support and progress feedback
   */
  protected async readFileWithStreaming(
    filePath: string,
    mimeType?: string,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<ResourceContent> {
    const result = await this.streamingReader.readFile(filePath, onProgress);
    
    if (!result.validation.isValid) {
      throw new Error(`Failed to read file: ${result.validation.errors.map(e => e.message).join(', ')}`);
    }

    // Log streaming statistics
    this.logger('info', `File read completed: ${result.usedStreaming ? 'streaming' : 'buffered'} mode, ` +
      `${result.progress.bytesRead} bytes in ${result.processingTime}ms, ` +
      `peak memory: ${this.streamingReader.getMemoryStats().peak} bytes`);

    return this.success(result.content, mimeType);
  }

  /**
   * Read a file with automatic fallback to streaming for large files
   */
  protected async readFileAuto(filePath: string, mimeType?: string): Promise<ResourceContent> {
    return this.readFileWithStreaming(filePath, mimeType);
  }

  /**
   * Get memory usage statistics
   */
  protected getMemoryStats() {
    return this.streamingReader.getMemoryStats();
  }

  /**
   * Reset memory tracking
   */
  protected resetMemoryTracking() {
    this.streamingReader.resetMemoryTracking();
  }
}