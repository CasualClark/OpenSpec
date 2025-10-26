/**
 * Health check registry for managing and executing health checks
 */

import { HealthCheckDefinition, HealthCheckResult, HealthCheckConfig, HealthCheckSummary } from './types';

export class HealthCheckRegistry {
  private checks = new Map<string, HealthCheckDefinition>();
  private cache = new Map<string, { result: HealthCheckResult; timestamp: number }>();
  private config: Required<HealthCheckConfig>;

  constructor(config: HealthCheckConfig = {}) {
    this.config = {
      timeout: config.timeout || 5000,
      cacheTimeout: config.cacheTimeout || 30000,
      enableCaching: config.enableCaching ?? true,
      gracePeriod: config.gracePeriod || 10000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
    };
  }

  /**
   * Register a new health check
   */
  register(name: string, definition: HealthCheckDefinition): void {
    this.checks.set(name, {
      ...definition,
      enabled: definition.enabled ?? true,
    });
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Enable a health check
   */
  enableCheck(name: string): boolean {
    const check = this.checks.get(name);
    if (check) {
      check.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a health check
   */
  disableCheck(name: string): boolean {
    const check = this.checks.get(name);
    if (check) {
      check.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Run a specific health check
   */
  async runCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    if (!check.enabled) {
      return {
        status: 'warn',
        message: `Health check '${name}' is disabled`,
        timestamp: new Date().toISOString(),
        duration: 0,
      };
    }

    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.cache.get(name);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
        return cached.result;
      }
    }

    const startTime = Date.now();
    let lastError: Error | undefined;

    // Run with retries
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.runWithTimeout(check.check, check.timeout);
        const duration = Date.now() - startTime;
        
        const healthResult: HealthCheckResult = {
          ...result,
          timestamp: new Date().toISOString(),
          duration,
        };

        // Cache the result
        if (this.config.enableCaching) {
          this.cache.set(name, { result: healthResult, timestamp: Date.now() });
        }

        return healthResult;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    // All retries failed
    const duration = Date.now() - startTime;
    const result: HealthCheckResult = {
      status: 'fail',
      message: `Health check failed after ${this.config.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
      timestamp: new Date().toISOString(),
      duration,
    };

    // Cache failure result
    if (this.config.enableCaching) {
      this.cache.set(name, { result, timestamp: Date.now() });
    }

    return result;
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};
    
    const promises = Array.from(this.checks.entries()).map(async ([name, check]) => {
      try {
        results[name] = await this.runCheck(name);
      } catch (error) {
        results[name] = {
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          duration: 0,
        };
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Run only critical health checks (for readiness)
   */
  async runReadinessChecks(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};
    
    const criticalChecks = Array.from(this.checks.entries())
      .filter(([, check]) => check.critical && check.enabled);

    const promises = criticalChecks.map(async ([name, check]) => {
      try {
        results[name] = await this.runCheck(name);
      } catch (error) {
        results[name] = {
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          duration: 0,
        };
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Get all registered health checks
   */
  getAllChecks(): HealthCheckSummary[] {
    const summaries: HealthCheckSummary[] = [];
    
    for (const [name, check] of this.checks.entries()) {
      const cached = this.cache.get(name);
      summaries.push({
        name,
        status: cached?.result.status || 'warn',
        lastCheck: cached?.result.timestamp || new Date().toISOString(),
        duration: cached?.result.duration || 0,
        timeout: check.timeout,
        interval: check.interval,
        critical: check.critical,
        enabled: check.enabled ?? true,
        message: cached?.result.message || 'Not yet executed',
        details: cached?.result.details,
      });
    }

    return summaries;
  }

  /**
   * Clear the cache for a specific check or all checks
   */
  clearCache(name?: string): void {
    if (name) {
      this.cache.delete(name);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Run a function with a timeout
   */
  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Health check timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Get configuration
   */
  getConfig(): Required<HealthCheckConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}