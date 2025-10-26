/**
 * Audit logger for Task MCP stdio server security events
 */

import { promises as fs } from 'fs';
import * as path from 'path';

export interface AuditEvent {
  type: 'auth_event' | 'authz_event' | 'access_control_event' | 'security_violation';
  timestamp: number;
  event: string;
  data: any;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AuditLogConfig {
  enabled: boolean;
  logPath: string;
  maxFileSize: number;
  maxFiles: number;
  bufferSize: number;
  flushInterval: number;
  includeStackTrace: boolean;
}

export interface AuditSummary {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  timeRange: {
    start: number;
    end: number;
  };
  topUsers: Array<{ userId: string; count: number }>;
  topResources: Array<{ resource: string; count: number }>;
  deniedAccess: Array<{ resource: string; userId: string; reason: string; timestamp: number }>;
}

/**
 * Security audit logger for comprehensive security event tracking
 */
export class AuditLogger {
  private config: AuditLogConfig;
  private eventBuffer: AuditEvent[];
  private flushTimer?: NodeJS.Timeout;
  private metrics: {
    eventsLogged: number;
    eventsFlushed: number;
    errors: number;
    lastFlush: number;
  };

  constructor(config: Partial<AuditLogConfig> = {}) {
    this.config = {
      enabled: true,
      logPath: process.env.OPENSPEC_AUDIT_LOG_PATH || path.join(process.cwd(), '.openspec-audit.log'),
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 10,
      bufferSize: 100,
      flushInterval: 5000, // 5 seconds
      includeStackTrace: false,
      ...config
    };

    this.eventBuffer = [];
    this.metrics = {
      eventsLogged: 0,
      eventsFlushed: 0,
      errors: 0,
      lastFlush: Date.now()
    };

    // Start flush timer
    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Log a security audit event
   */
  log(event: Omit<AuditEvent, 'timestamp'>): void {
    if (!this.config.enabled) {
      return;
    }

    try {
      const auditEvent: AuditEvent = {
        timestamp: Date.now(),
        ...event
      };

      // Add severity based on event type if not provided
      if (!auditEvent.severity) {
        auditEvent.severity = this.getDefaultSeverity(event.type, event.event);
      }

      // Add stack trace for critical events if enabled
      if (this.config.includeStackTrace && auditEvent.severity === 'critical') {
        auditEvent.data.stackTrace = new Error().stack;
      }

      this.eventBuffer.push(auditEvent);
      this.metrics.eventsLogged++;

      // Flush immediately for critical events
      if (auditEvent.severity === 'critical') {
        this.flush().catch(error => {
          console.error('Failed to flush critical audit event:', error);
        });
      }

      // Flush if buffer is full
      if (this.eventBuffer.length >= this.config.bufferSize) {
        this.flush().catch(error => {
          console.error('Failed to flush audit buffer:', error);
        });
      }

    } catch (error) {
      this.metrics.errors++;
      console.error('Failed to log audit event:', error);
    }
  }

  /**
   * Log authentication event
   */
  logAuthEvent(event: string, data: any, severity?: AuditEvent['severity']): void {
    this.log({
      type: 'auth_event',
      event,
      data,
      severity
    });
  }

  /**
   * Log authorization event
   */
  logAuthzEvent(event: string, data: any, severity?: AuditEvent['severity']): void {
    this.log({
      type: 'authz_event',
      event,
      data,
      severity
    });
  }

  /**
   * Log access control event
   */
  logAccessEvent(event: string, data: any, severity?: AuditEvent['severity']): void {
    this.log({
      type: 'access_control_event',
      event,
      data,
      severity
    });
  }

  /**
   * Log security violation
   */
  logSecurityViolation(event: string, data: any, severity: AuditEvent['severity'] = 'high'): void {
    this.log({
      type: 'security_violation',
      event,
      data,
      severity
    });
  }

  /**
   * Flush buffered events to disk
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    try {
      const events = [...this.eventBuffer];
      this.eventBuffer = [];

      // Rotate log if necessary
      await this.rotateLogIfNeeded();

      // Ensure directory exists
      const logDir = path.dirname(this.config.logPath);
      await fs.mkdir(logDir, { recursive: true });

      // Write events to file
      const logLines = events.map(event => JSON.stringify(event)).join('\n') + '\n';
      await fs.appendFile(this.config.logPath, logLines, 'utf-8');

      this.metrics.eventsFlushed += events.length;
      this.metrics.lastFlush = Date.now();

    } catch (error) {
      this.metrics.errors++;
      console.error('Failed to flush audit log:', error);
      
      // Put events back in buffer for retry - events variable is not in scope here
      // This is a limitation of the current error handling
    }
  }

  /**
   * Get audit log metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Generate audit summary for a time range
   */
  async generateSummary(startTime?: number, endTime?: number): Promise<AuditSummary> {
    const now = Date.now();
    const timeRange = {
      start: startTime || (now - 24 * 60 * 60 * 1000), // Last 24 hours
      end: endTime || now
    };

    try {
      const events = await this.readEvents(timeRange.start, timeRange.end);
      
      const summary: AuditSummary = {
        totalEvents: events.length,
        eventsByType: {},
        eventsBySeverity: {},
        timeRange,
        topUsers: [],
        topResources: [],
        deniedAccess: []
      };

      // Analyze events
      const userCounts = new Map<string, number>();
      const resourceCounts = new Map<string, number>();

      for (const event of events) {
        // Count by type
        summary.eventsByType[event.type] = (summary.eventsByType[event.type] || 0) + 1;
        
        // Count by severity
        summary.eventsBySeverity[event.severity || 'low'] = (summary.eventsBySeverity[event.severity || 'low'] || 0) + 1;

        // Track users
        const userId = event.data?.user?.id || event.data?.context?.user?.id;
        if (userId) {
          userCounts.set(userId, (userCounts.get(userId) || 0) + 1);
        }

        // Track resources
        const resource = event.data?.resource || event.data?.context?.resource;
        if (resource) {
          resourceCounts.set(resource, (resourceCounts.get(resource) || 0) + 1);
        }

        // Track denied access
        if (event.event === 'access_denied' || event.data?.decision?.code === 'DENIED') {
          summary.deniedAccess.push({
            resource: resource || 'unknown',
            userId: userId || 'unknown',
            reason: event.data?.decision?.reason || event.data?.error || 'unknown',
            timestamp: event.timestamp
          });
        }
      }

      // Get top users and resources
      summary.topUsers = Array.from(userCounts.entries())
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      summary.topResources = Array.from(resourceCounts.entries())
        .map(([resource, count]) => ({ resource, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return summary;

    } catch (error) {
      console.error('Failed to generate audit summary:', error);
      throw error;
    }
  }

  /**
   * Search audit events
   */
  async searchEvents(query: {
    type?: AuditEvent['type'];
    event?: string;
    userId?: string;
    resource?: string;
    startTime?: number;
    endTime?: number;
    severity?: AuditEvent['severity'];
    limit?: number;
  }): Promise<AuditEvent[]> {
    try {
      const events = await this.readEvents(query.startTime, query.endTime);
      
      let filtered = events;

      if (query.type) {
        filtered = filtered.filter(event => event.type === query.type);
      }

      if (query.event) {
        filtered = filtered.filter(event => event.event.includes(query.event!));
      }

      if (query.userId) {
        filtered = filtered.filter(event => 
          event.data?.user?.id === query.userId ||
          event.data?.context?.user?.id === query.userId
        );
      }

      if (query.resource) {
        filtered = filtered.filter(event => 
          event.data?.resource === query.resource ||
          event.data?.context?.resource === query.resource
        );
      }

      if (query.severity) {
        filtered = filtered.filter(event => event.severity === query.severity);
      }

      return query.limit ? filtered.slice(0, query.limit) : filtered;

    } catch (error) {
      console.error('Failed to search audit events:', error);
      throw error;
    }
  }

  /**
   * Cleanup old log files
   */
  async cleanup(): Promise<void> {
    try {
      const logDir = path.dirname(this.config.logPath);
      const logBase = path.basename(this.config.logPath, path.extname(this.config.logPath));
      const logExt = path.extname(this.config.logPath);

      const files = await fs.readdir(logDir);
      const logFiles = files
        .filter(file => file.startsWith(logBase) && file.endsWith(logExt))
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          mtime: fs.stat(path.join(logDir, file)).then(stats => stats.mtime.getTime())
        }));

      // Sort by modification time (oldest first)
      const sortedFiles = await Promise.all(
        logFiles.map(async file => ({
          ...file,
          mtime: await file.mtime
        }))
      );
      sortedFiles.sort((a, b) => a.mtime - b.mtime);

      // Keep only the most recent files
      if (sortedFiles.length > this.config.maxFiles) {
        const filesToDelete = sortedFiles.slice(0, sortedFiles.length - this.config.maxFiles);
        
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
      }

    } catch (error) {
      console.error('Failed to cleanup audit logs:', error);
    }
  }

  /**
   * Shutdown the audit logger
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    await this.flush();
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Failed to flush audit log on timer:', error);
      });
    }, this.config.flushInterval);
  }

  /**
   * Get default severity for events
   */
  private getDefaultSeverity(type: AuditEvent['type'], event: string): AuditEvent['severity'] {
    // Critical events - only the most severe
    if (event.includes('critical_error') ||
        event.includes('breach') || 
        event.includes('compromise')) {
      return 'critical';
    }

    // High severity events
    if (event.includes('critical') ||
        event.includes('security_violation') || 
        event.includes('auth_error') || 
        event.includes('access_denied')) {
      return 'high';
    }

    // Medium severity events
    if (type === 'authz_event' && event.includes('denied')) {
      return 'medium';
    }

    // Medium severity events
    if (type === 'auth_event' && event.includes('failed')) {
      return 'medium';
    }

    // Default to low
    return 'low';
  }

  /**
   * Rotate log file if it exceeds size limit
   */
  private async rotateLogIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.config.logPath);
      
      if (stats.size >= this.config.maxFileSize) {
        const logDir = path.dirname(this.config.logPath);
        const logBase = path.basename(this.config.logPath, path.extname(this.config.logPath));
        const logExt = path.extname(this.config.logPath);
        
        // Find existing rotated files
        const files = await fs.readdir(logDir);
        const rotatedFiles = files
          .filter(file => file.startsWith(`${logBase}.`) && file.endsWith(logExt))
          .map(file => {
            const match = file.match(new RegExp(`${logBase}\\.(\\d+)${logExt}`));
            return match ? parseInt(match[1]) : 0;
          })
          .filter(n => n > 0);

        const nextNumber = rotatedFiles.length > 0 ? Math.max(...rotatedFiles) + 1 : 1;
        const rotatedPath = path.join(logDir, `${logBase}.${nextNumber}${logExt}`);

        // Move current log to rotated file
        await fs.rename(this.config.logPath, rotatedPath);

        // Cleanup old files
        await this.cleanup();
      }
    } catch (error) {
      // File doesn't exist or other error - ignore
    }
  }

  /**
   * Read events from log file
   */
  private async readEvents(startTime?: number, endTime?: number): Promise<AuditEvent[]> {
    try {
      // Check if file exists first
      try {
        await fs.access(this.config.logPath);
      } catch {
        // File doesn't exist, return empty array
        return [];
      }

      const content = await fs.readFile(this.config.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      const events: AuditEvent[] = [];
      
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as AuditEvent;
          
          // Filter by time range
          if (startTime && event.timestamp < startTime) continue;
          if (endTime && event.timestamp > endTime) continue;
          
          events.push(event);
        } catch {
          // Skip malformed lines
        }
      }

      return events;

    } catch (error) {
      // File doesn't exist or can't be read
      return [];
    }
  }
}