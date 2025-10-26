/**
 * Log transports for different output destinations
 */

import { existsSync, createWriteStream, WriteStream } from 'fs';
import { join } from 'path';
import { LogEntry, LogTransport } from './types.js';

/**
 * Console transport for stdout/stderr output
 */
export class ConsoleTransport implements LogTransport {
  name = 'console';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';

  constructor(level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info') {
    this.level = level;
  }

  write(entry: LogEntry): void {
    const message = JSON.stringify(entry);
    
    switch (entry.level) {
      case 'error':
      case 'fatal':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'info':
        console.info(message);
        break;
      default:
        console.log(message);
    }
  }
}

/**
 * File transport with rotation support
 */
export class FileTransport implements LogTransport {
  name = 'file';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  private filePath: string;
  private maxSize: number;
  private maxFiles: number;
  private currentSize: number = 0;
  private writeStream?: WriteStream;

  constructor(
    private config: {
      filePath: string;
      level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
      maxSize?: number;
      maxFiles?: number;
    }
  ) {
    this.level = config.level;
    this.filePath = config.filePath;
    this.maxSize = config.maxSize || 10 * 1024 * 1024; // 10MB default
    this.maxFiles = config.maxFiles || 5;
    
    this.initializeFile();
  }

  private initializeFile(): void {
    // Create directory if it doesn't exist
    const dir = join(this.filePath, '..');
    if (!existsSync(dir)) {
      require('fs').mkdirSync(dir, { recursive: true });
    }

    // Check current file size
    if (existsSync(this.filePath)) {
      const stats = require('fs').statSync(this.filePath);
      this.currentSize = stats.size;
    }

    // Create write stream
    this.writeStream = createWriteStream(this.filePath, { flags: 'a' });
  }

  write(entry: LogEntry): void {
    if (!this.writeStream) return;

    const message = JSON.stringify(entry) + '\n';
    const messageSize = Buffer.byteLength(message, 'utf8');

    // Check if rotation is needed
    if (this.currentSize + messageSize > this.maxSize) {
      this.rotateFile();
    }

    this.writeStream.write(message);
    this.currentSize += messageSize;
  }

  private rotateFile(): void {
    if (this.writeStream) {
      this.writeStream.end();
    }

    // Remove oldest file if we've reached max files
    const oldestFile = `${this.filePath}.${this.maxFiles}`;
    if (existsSync(oldestFile)) {
      require('fs').unlinkSync(oldestFile);
    }

    // Rotate existing files
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const currentFile = `${this.filePath}.${i}`;
      const nextFile = `${this.filePath}.${i + 1}`;
      
      if (existsSync(currentFile)) {
        require('fs').renameSync(currentFile, nextFile);
      }
    }

    // Move current file to .1
    if (existsSync(this.filePath)) {
      require('fs').renameSync(this.filePath, `${this.filePath}.1`);
    }

    // Reset and create new file
    this.currentSize = 0;
    this.initializeFile();
  }

  flush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.writeStream) {
        // WriteStream doesn't have a flush method, so we just resolve
        // The data will be flushed by the OS
        setImmediate(resolve);
      } else {
        resolve();
      }
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.writeStream) {
        this.writeStream.end(() => {
          this.writeStream = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * Buffered transport for high-performance logging
 */
export class BufferedTransport implements LogTransport {
  name = 'buffered';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  private buffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout;
  private underlyingTransport: LogTransport;

  constructor(
    private config: {
      transport: LogTransport;
      bufferSize: number;
      flushIntervalMs: number;
    }
  ) {
    this.underlyingTransport = config.transport;
    this.level = config.transport.level;
    this.flushInterval = setInterval(() => {
      this.flush();
    }, config.flushIntervalMs);

    // Handle process exit
    process.on('exit', () => this.flush());
    process.on('SIGINT', () => this.flush());
    process.on('SIGTERM', () => this.flush());
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.config.bufferSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    // Write all buffered entries
    for (const entry of entries) {
      this.underlyingTransport.write(entry);
    }

    // Flush underlying transport if it supports it
    if (this.underlyingTransport.flush) {
      this.underlyingTransport.flush();
    }
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
    
    if (this.underlyingTransport.close) {
      await this.underlyingTransport.close();
    }
  }
}

/**
 * Multi transport for writing to multiple destinations
 */
export class MultiTransport implements LogTransport {
  name = 'multi';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  private transports: LogTransport[];

  constructor(transports: LogTransport[]) {
    this.transports = transports;
    // Use the most permissive level
    this.level = this.transports.reduce((lowest: 'debug' | 'info' | 'warn' | 'error' | 'fatal', transport) => {
      const levels = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
      const lowestIndex = levels.indexOf(lowest);
      const transportIndex = levels.indexOf(transport.level);
      return transportIndex < lowestIndex ? transport.level : lowest;
    }, 'fatal' as const);
  }

  write(entry: LogEntry): void {
    for (const transport of this.transports) {
      transport.write(entry);
    }
  }

  async flush(): Promise<void> {
    await Promise.all(
      this.transports
        .filter(t => t.flush)
        .map(t => t.flush!())
    );
  }

  close(): Promise<void> {
    return Promise.all(
      this.transports
        .filter(t => t.close)
        .map(t => t.close!())
    ).then(() => {});
  }
}

/**
 * Filter transport that only writes entries matching criteria
 */
export class FilterTransport implements LogTransport {
  name = 'filter';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  private predicate: (entry: LogEntry) => boolean;
  private underlyingTransport: LogTransport;

  constructor(
    predicate: (entry: LogEntry) => boolean,
    transport: LogTransport
  ) {
    this.predicate = predicate;
    this.underlyingTransport = transport;
    this.level = transport.level;
  }

  write(entry: LogEntry): void {
    if (this.predicate(entry)) {
      this.underlyingTransport.write(entry);
    }
  }

  flush(): Promise<void> {
    return this.underlyingTransport.flush?.() || Promise.resolve();
  }

  close(): Promise<void> {
    return this.underlyingTransport.close?.() || Promise.resolve();
  }
}

/**
 * Null transport that discards all log entries
 */
export class NullTransport implements LogTransport {
  name = 'null';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'debug';

  write(entry: LogEntry): void {
    // Discard all log entries
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Async transport for non-blocking logging
 */
export class AsyncTransport implements LogTransport {
  name = 'async';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  private queue: LogEntry[] = [];
  private processing = false;
  private underlyingTransport: LogTransport;

  constructor(transport: LogTransport) {
    this.underlyingTransport = transport;
    this.level = transport.level;
  }

  write(entry: LogEntry): void {
    this.queue.push(entry);
    
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        // Write asynchronously without blocking
        setImmediate(() => {
          this.underlyingTransport.write(entry);
        });
      }
    }

    this.processing = false;
  }

  flush(): Promise<void> {
    return this.underlyingTransport.flush?.() || Promise.resolve();
  }

  close(): Promise<void> {
    return this.underlyingTransport.close?.() || Promise.resolve();
  }
}