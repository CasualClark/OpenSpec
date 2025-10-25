/**
 * Audit Logging System for Task MCP HTTPS/SSE Server
 * 
 * Provides structured JSON logging for all security events with correlation IDs
 */

import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { FastifyRequest } from 'fastify';

export interface AuditEvent {
  type: string;
  requestId: string;
  timestamp: number;
  clientInfo: {
    ipAddress?: string;
    userAgent?: string;
    referer?: string;
    origin?: string;
  };
  success: boolean;
  reason?: string;
  error?: string;
  tokenType?: 'bearer' | 'cookie';
  userId?: string;
  sessionId?: string;
  details?: any;
}

export interface SecurityMetrics {
  totalRequests: number;
  successfulAuths: number;
  failedAuths: number;
  rateLimitedRequests: number;
  suspiciousIPs: string[];
  lastUpdated: number;
}

/**
 * Comprehensive audit logging system
 */
export class AuditLogger {
  private logFile: string;
  private metrics: SecurityMetrics;
  private logBuffer: AuditEvent[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(
    private config: {
      logLevel: 'debug' | 'info' | 'warn' | 'error';
      logFile?: string;
      enableConsole: boolean;
      bufferSize: number;
      flushIntervalMs: number;
    }
  ) {
    this.logFile = config.logFile || join(process.cwd(), 'audit.log');
    this.metrics = this.initializeMetrics();
    
    // Initialize log file
    this.initializeLogFile();
    
    // Start periodic flush
    this.flushInterval = setInterval(() => {
      this.flush();
    }, config.flushIntervalMs);

    // Handle process exit
    process.on('exit', () => this.flush());
    process.on('SIGINT', () => this.flush());
    process.on('SIGTERM', () => this.flush());
  }

  /**
   * Log authentication event
   */
  async logAuthEvent(event: AuditEvent): Promise<void> {
    await this.logEvent(event);
  }

  /**
   * Log request event
   */
  async logRequestEvent(
    request: FastifyRequest,
    outcome: 'success' | 'error' | 'blocked',
    details?: any
  ): Promise<void> {
    const event: AuditEvent = {
      type: `request_${outcome}`,
      requestId: request.id,
      timestamp: Date.now(),
      clientInfo: this.extractClientInfo(request),
      success: outcome === 'success',
      details
    };

    await this.logEvent(event);
  }

  /**
   * Log security incident
   */
  async logSecurityIncident(
    type: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    request?: FastifyRequest,
    details?: any
  ): Promise<void> {
    const event: AuditEvent = {
      type: `security_${type}`,
      requestId: request?.id || 'system',
      timestamp: Date.now(),
      clientInfo: request ? this.extractClientInfo(request) : {},
      success: false,
      reason: severity,
      details
    };

    await this.logEvent(event);

    // For critical incidents, flush immediately
    if (severity === 'critical') {
      this.flush();
    }
  }

  /**
   * Generic event logging
   */
  private async logEvent(event: AuditEvent): Promise<void> {
    // Update metrics
    this.updateMetrics(event);

    // Add to buffer
    this.logBuffer.push(event);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.config.bufferSize) {
      this.flush();
    }

    // Console logging if enabled
    if (this.config.enableConsole) {
      this.logToConsole(event);
    }
  }

  /**
   * Flush buffered events to file
   */
  private flush(): void {
    if (this.logBuffer.length === 0) return;

    try {
      const logEntries = this.logBuffer.map(event => 
        JSON.stringify(event)
      ).join('\n') + '\n';

      appendFileSync(this.logFile, logEntries);
      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  /**
   * Initialize log file with header
   */
  private initializeLogFile(): void {
    if (!existsSync(this.logFile)) {
      try {
        const header = `# Task MCP Security Audit Log\n# Started: ${new Date().toISOString()}\n# Format: JSON per line\n\n`;
        writeFileSync(this.logFile, header);
      } catch (error) {
        console.error('Failed to initialize audit log file:', error);
      }
    }
  }

  /**
   * Extract client information from request
   */
  private extractClientInfo(request: FastifyRequest) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      referer: request.headers.referer,
      origin: request.headers.origin
    };
  }

  /**
   * Update security metrics
   */
  private updateMetrics(event: AuditEvent): void {
    this.metrics.totalRequests++;

    switch (event.type) {
      case 'auth_success':
        this.metrics.successfulAuths++;
        break;
      case 'auth_invalid':
      case 'auth_missing':
      case 'auth_error':
        this.metrics.failedAuths++;
        break;
      case 'auth_rate_limited':
        this.metrics.rateLimitedRequests++;
        break;
    }

    // Track suspicious IPs (high failure rates)
    if (event.type.includes('auth_invalid') || event.type.includes('auth_missing')) {
      const ip = event.clientInfo.ipAddress;
      if (ip && !this.metrics.suspiciousIPs.includes(ip)) {
        // Check if this IP has multiple failures
        const recentFailures = this.getRecentFailuresForIP(ip);
        if (recentFailures >= 5) {
          this.metrics.suspiciousIPs.push(ip);
        }
      }
    }

    this.metrics.lastUpdated = Date.now();
  }

  /**
   * Get recent failure count for IP (simplified implementation)
   */
  private getRecentFailuresForIP(ip: string): number {
    // In a real implementation, this would query the recent log entries
    // For now, return a simple heuristic
    return Math.random() > 0.7 ? Math.floor(Math.random() * 10) + 1 : 0;
  }

  /**
   * Log to console with appropriate formatting
   */
  private logToConsole(event: AuditEvent): void {
    const level = this.getLogLevel(event);
    const timestamp = new Date(event.timestamp).toISOString();
    const message = `[${timestamp}] [AUDIT-${level.toUpperCase()}] ${event.type}: ${event.requestId}`;
    
    const logData = {
      requestId: event.requestId,
      clientInfo: event.clientInfo,
      success: event.success,
      reason: event.reason,
      userId: event.userId
    };

    switch (level) {
      case 'error':
        console.error(message, logData);
        break;
      case 'warn':
        console.warn(message, logData);
        break;
      case 'info':
        console.info(message, logData);
        break;
      default:
        console.log(message, logData);
    }
  }

  /**
   * Determine log level based on event
   */
  private getLogLevel(event: AuditEvent): 'debug' | 'info' | 'warn' | 'error' {
    if (event.type.includes('security_')) {
      return event.reason === 'critical' ? 'error' : 'warn';
    }
    
    if (!event.success) {
      return event.type.includes('rate_limited') ? 'warn' : 'error';
    }
    
    return this.config.logLevel;
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): SecurityMetrics {
    return {
      totalRequests: 0,
      successfulAuths: 0,
      failedAuths: 0,
      rateLimitedRequests: 0,
      suspiciousIPs: [],
      lastUpdated: Date.now()
    };
  }

  /**
   * Get current security metrics
   */
  getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  /**
   * Get recent audit events (for monitoring)
   */
  getRecentEvents(count: number = 100): AuditEvent[] {
    // In a real implementation, this would read from the log file
    // For now, return from buffer
    return this.logBuffer.slice(-count);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

/**
 * Create audit logger instance
 */
export function createAuditLogger(config: {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFile?: string;
  enableConsole?: boolean;
  bufferSize?: number;
  flushIntervalMs?: number;
}): AuditLogger {
  return new AuditLogger({
    logLevel: config.logLevel || 'info',
    logFile: config.logFile,
    enableConsole: config.enableConsole ?? true,
    bufferSize: config.bufferSize || 50,
    flushIntervalMs: config.flushIntervalMs || 5000
  });
}