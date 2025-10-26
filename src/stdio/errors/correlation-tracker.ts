/**
 * Correlation ID tracking for error handling and debugging
 */

/**
 * Correlation ID generator and tracker
 */
export class CorrelationTracker {
  private static readonly CORRELATION_PREFIX = 'openspec';
  private static readonly ID_LENGTH = 16;
  private static readonly TIMESTAMP_LENGTH = 8;
  
  /**
   * Generate a unique correlation ID
   * Format: openspec_timestamp_random
   */
  static generateId(): string {
    const timestamp = Date.now().toString(36).padStart(this.TIMESTAMP_LENGTH, '0');
    const random = this.generateRandomString(this.ID_LENGTH);
    return `${this.CORRELATION_PREFIX}_${timestamp}_${random}`;
  }

  /**
   * Generate a correlation ID with a specific prefix
   */
  static generateIdWithPrefix(prefix: string): string {
    const timestamp = Date.now().toString(36).padStart(this.TIMESTAMP_LENGTH, '0');
    const random = this.generateRandomString(this.ID_LENGTH);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Generate a correlation ID for a specific operation
   */
  static generateForOperation(operation: string): string {
    return this.generateIdWithPrefix(`${this.CORRELATION_PREFIX}_${operation}`);
  }

  /**
   * Extract timestamp from correlation ID
   */
  static extractTimestamp(correlationId: string): number | null {
    try {
      const parts = correlationId.split('_');
      if (parts.length >= 3) {
        const timestampPart = parts[parts.length - 2];
        return parseInt(timestampPart, 36);
      }
    } catch {
      // Invalid format
    }
    return null;
  }

  /**
   * Check if correlation ID is valid OpenSpec format
   */
  static isValid(correlationId: string): boolean {
    if (!correlationId || typeof correlationId !== 'string') {
      return false;
    }

    const parts = correlationId.split('_');
    return parts.length >= 3 && 
           parts[0] === this.CORRELATION_PREFIX &&
           parts[parts.length - 2].length >= this.TIMESTAMP_LENGTH &&
           parts[parts.length - 1].length >= this.ID_LENGTH;
  }

  /**
   * Generate random string
   */
  private static generateRandomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  /**
   * Get age of correlation ID in milliseconds
   */
  static getAge(correlationId: string): number | null {
    const timestamp = this.extractTimestamp(correlationId);
    return timestamp ? Date.now() - timestamp : null;
  }

  /**
   * Format correlation ID for display
   */
  static format(correlationId: string): string {
    if (!this.isValid(correlationId)) {
      return correlationId;
    }

    const parts = correlationId.split('_');
    const timestamp = parts[parts.length - 2];
    const random = parts[parts.length - 1];
    
    return `${parts[0]}_${parts[1]}_${timestamp}_${random.substring(0, 8)}...`;
  }
}

/**
 * Context manager for tracking correlation IDs across operations
 */
export class CorrelationContext {
  private static currentId: string | null = null;
  private static context: Map<string, any> = new Map();

  /**
   * Set current correlation ID
   */
  static setCurrent(id: string): void {
    this.currentId = id;
  }

  /**
   * Get current correlation ID
   */
  static getCurrent(): string | null {
    return this.currentId;
  }

  /**
   * Clear current correlation ID
   */
  static clear(): void {
    this.currentId = null;
    this.context.clear();
  }

  /**
   * Add context data for current correlation ID
   */
  static addContext(key: string, value: any): void {
    if (this.currentId) {
      this.context.set(`${this.currentId}:${key}`, value);
    }
  }

  /**
   * Get context data for current correlation ID
   */
  static getContext(key: string): any {
    if (this.currentId) {
      return this.context.get(`${this.currentId}:${key}`);
    }
    return null;
  }

  /**
   * Get all context data for current correlation ID
   */
  static getAllContext(): Record<string, any> {
    if (!this.currentId) {
      return {};
    }

    const result: Record<string, any> = {};
    const prefix = `${this.currentId}:`;
    
    this.context.forEach((value, fullKey) => {
      if (fullKey.startsWith(prefix)) {
        const key = fullKey.substring(prefix.length);
        result[key] = value;
      }
    });
    
    return result;
  }

  /**
   * Clear context data for current correlation ID
   */
  static clearContext(): void {
    if (this.currentId) {
      const prefix = `${this.currentId}:`;
      const keysToDelete: string[] = [];
      
      const allKeys = Array.from(this.context.keys());
      for (const key of allKeys) {
        if (key.startsWith(prefix)) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        this.context.delete(key);
      }
    }
  }

  /**
   * Execute function with correlation ID context
   */
  static async withContext<T>(
    correlationId: string,
    fn: () => T | Promise<T>
  ): Promise<T> {
    const previousId = this.currentId;
    const previousContext = new Map(this.context);
    
    try {
      this.currentId = correlationId;
      const result = await fn();
      return result;
    } finally {
      this.currentId = previousId;
      this.context = previousContext;
    }
  }
}