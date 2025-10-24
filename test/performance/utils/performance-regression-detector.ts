/**
 * Performance regression detection system
 * Compares current performance against historical baselines and detects regressions
 */

import { promises as fs } from 'fs';
import { PerformanceReport } from '../../../scripts/performance-test-runner.js';

interface PerformanceBaseline {
  timestamp: string;
  metrics: {
    paginationPerformance: {
      averageExecutionTime: number;
      averageMemoryUsage: number;
      itemsPerSecond: number;
    };
    streamingPerformance: {
      averageExecutionTime: number;
      averageMemoryUsage: number;
      itemsPerSecond: number;
    };
    concurrencyPerformance: {
      averageExecutionTime: number;
      maxExecutionTime: number;
    };
    memoryEfficiency: {
      memoryGrowth: number;
    };
  };
  environment: {
    nodeVersion: string;
    platform: string;
  };
}

interface RegressionResult {
  detected: boolean;
  severity: 'minor' | 'major' | 'critical';
  regressions: Array<{
    category: string;
    metric: string;
    baseline: number;
    current: number;
    percentageChange: number;
    threshold: number;
  }>;
  improvements: Array<{
    category: string;
    metric: string;
    baseline: number;
    current: number;
    percentageChange: number;
  }>;
  summary: string;
}

interface RegressionThresholds {
  executionTimeRegression: number; // Percentage increase considered regression
  memoryUsageRegression: number; // Percentage increase considered regression
  throughputRegression: number; // Percentage decrease considered regression
  criticalThreshold: number; // Percentage change considered critical
  majorThreshold: number; // Percentage change considered major
}

export { PerformanceBaseline };
export class PerformanceRegressionDetector {
  private baselineFile: string = 'performance-baseline.json';
  private thresholds: RegressionThresholds;

  constructor(thresholds?: Partial<RegressionThresholds>) {
    this.thresholds = {
      executionTimeRegression: 15, // 15% increase
      memoryUsageRegression: 20, // 20% increase
      throughputRegression: 10, // 10% decrease
      criticalThreshold: 50, // 50% change
      majorThreshold: 25, // 25% change
      ...thresholds
    };
  }

  /**
   * Load performance baseline from file
   */
  async loadBaseline(): Promise<PerformanceBaseline | null> {
    try {
      const data = await fs.readFile(this.baselineFile, 'utf-8');
      return JSON.parse(data) as PerformanceBaseline;
    } catch (error) {
      console.log(`No baseline file found at ${this.baselineFile}`);
      return null;
    }
  }

  /**
   * Save performance baseline to file
   */
  async saveBaseline(report: PerformanceReport): Promise<void> {
    const baseline = this.extractBaselineFromReport(report);
    await fs.writeFile(this.baselineFile, JSON.stringify(baseline, null, 2));
    console.log(`Performance baseline saved to ${this.baselineFile}`);
  }

  /**
   * Detect performance regressions by comparing current report to baseline
   */
  async detectRegressions(currentReport: PerformanceReport): Promise<RegressionResult> {
    const baseline = await this.loadBaseline();
    
    if (!baseline) {
      return {
        detected: false,
        severity: 'minor',
        regressions: [],
        improvements: [],
        summary: 'No baseline available for comparison'
      };
    }

    const regressions: RegressionResult['regressions'] = [];
    const improvements: RegressionResult['improvements'] = [];

    // Check pagination performance
    const paginationResult = currentReport.results.find(r => r.name.includes('pagination'));
    if (paginationResult && paginationResult.metrics) {
      this.compareMetric(
        'pagination',
        'executionTime',
        baseline.metrics.paginationPerformance.averageExecutionTime,
        paginationResult.metrics.executionTime,
        regressions,
        improvements,
        true // Higher is worse
      );

      this.compareMetric(
        'pagination',
        'memoryUsage',
        baseline.metrics.paginationPerformance.averageMemoryUsage,
        paginationResult.metrics.memoryUsage,
        regressions,
        improvements,
        true // Higher is worse
      );

      this.compareMetric(
        'pagination',
        'itemsPerSecond',
        baseline.metrics.paginationPerformance.itemsPerSecond,
        paginationResult.metrics.itemsPerSecond,
        regressions,
        improvements,
        false // Lower is worse
      );
    }

    // Check streaming performance
    const streamingResult = currentReport.results.find(r => r.name.includes('streaming'));
    if (streamingResult && streamingResult.metrics) {
      this.compareMetric(
        'streaming',
        'executionTime',
        baseline.metrics.streamingPerformance.averageExecutionTime,
        streamingResult.metrics.executionTime,
        regressions,
        improvements,
        true // Higher is worse
      );

      this.compareMetric(
        'streaming',
        'memoryUsage',
        baseline.metrics.streamingPerformance.averageMemoryUsage,
        streamingResult.metrics.memoryUsage,
        regressions,
        improvements,
        true // Higher is worse
      );

      this.compareMetric(
        'streaming',
        'itemsPerSecond',
        baseline.metrics.streamingPerformance.itemsPerSecond,
        streamingResult.metrics.itemsPerSecond,
        regressions,
        improvements,
        false // Lower is worse
      );
    }

    // Check concurrency performance
    const concurrencyResult = currentReport.results.find(r => r.name.includes('concurrency'));
    if (concurrencyResult && concurrencyResult.metrics) {
      this.compareMetric(
        'concurrency',
        'averageExecutionTime',
        baseline.metrics.concurrencyPerformance.averageExecutionTime,
        concurrencyResult.metrics.avgTime,
        regressions,
        improvements,
        true // Higher is worse
      );

      this.compareMetric(
        'concurrency',
        'maxExecutionTime',
        baseline.metrics.concurrencyPerformance.maxExecutionTime,
        concurrencyResult.metrics.maxTime,
        regressions,
        improvements,
        true // Higher is worse
      );
    }

    // Check memory efficiency
    const memoryResult = currentReport.results.find(r => r.name.includes('memory'));
    if (memoryResult && memoryResult.metrics) {
      this.compareMetric(
        'memory',
        'memoryGrowth',
        baseline.metrics.memoryEfficiency.memoryGrowth,
        memoryResult.metrics.memoryGrowth,
        regressions,
        improvements,
        true // Higher is worse
      );
    }

    // Determine severity
    const severity = this.calculateSeverity(regressions);
    const detected = regressions.length > 0;

    return {
      detected,
      severity,
      regressions,
      improvements,
      summary: this.generateSummary(regressions, improvements, severity)
    };
  }

  /**
   * Compare a metric against baseline and detect regressions/improvements
   */
  private compareMetric(
    category: string,
    metric: string,
    baseline: number,
    current: number,
    regressions: RegressionResult['regressions'],
    improvements: RegressionResult['improvements'],
    higherIsWorse: boolean
  ): void {
    if (baseline === 0 || current === 0) return;

    const percentageChange = ((current - baseline) / baseline) * 100;
    const absoluteChange = Math.abs(percentageChange);

    // Determine if this is a regression or improvement
    const isRegression = higherIsWorse ? percentageChange > 0 : percentageChange < 0;
    const isImprovement = higherIsWorse ? percentageChange < -5 : percentageChange > 5; // 5% threshold for improvements

    // Check if change exceeds regression threshold
    const threshold = higherIsWorse ? 
      this.thresholds.executionTimeRegression : 
      this.thresholds.throughputRegression;

    if (isRegression && absoluteChange >= threshold) {
      regressions.push({
        category,
        metric,
        baseline,
        current,
        percentageChange,
        threshold
      });
    } else if (isImprovement && absoluteChange >= 5) {
      improvements.push({
        category,
        metric,
        baseline,
        current,
        percentageChange
      });
    }
  }

  /**
   * Calculate regression severity
   */
  private calculateSeverity(regressions: RegressionResult['regressions']): 'minor' | 'major' | 'critical' {
    if (regressions.length === 0) return 'minor';

    const maxChange = Math.max(...regressions.map(r => Math.abs(r.percentageChange)));
    
    if (maxChange >= this.thresholds.criticalThreshold) return 'critical';
    if (maxChange >= this.thresholds.majorThreshold) return 'major';
    return 'minor';
  }

  /**
   * Generate regression summary
   */
  private generateSummary(
    regressions: RegressionResult['regressions'],
    improvements: RegressionResult['improvements'],
    severity: 'minor' | 'major' | 'critical'
  ): string {
    if (regressions.length === 0 && improvements.length === 0) {
      return 'No significant performance changes detected';
    }

    const parts: string[] = [];

    if (regressions.length > 0) {
      parts.push(`${regressions.length} regression(s) detected`);
      
      // Count by severity
      const criticalCount = regressions.filter(r => Math.abs(r.percentageChange) >= this.thresholds.criticalThreshold).length;
      const majorCount = regressions.filter(r => Math.abs(r.percentageChange) >= this.thresholds.majorThreshold && Math.abs(r.percentageChange) < this.thresholds.criticalThreshold).length;
      
      if (criticalCount > 0) parts.push(`${criticalCount} critical`);
      if (majorCount > 0) parts.push(`${majorCount} major`);
    }

    if (improvements.length > 0) {
      parts.push(`${improvements.length} improvement(s)`);
    }

    let summary = parts.join(', ');

    if (severity === 'critical') {
      summary = '🚨 CRITICAL: ' + summary;
    } else if (severity === 'major') {
      summary = '⚠️ MAJOR: ' + summary;
    } else if (regressions.length > 0) {
      summary = '⚠️ MINOR: ' + summary;
    } else {
      summary = '✅ ' + summary;
    }

    return summary;
  }

  /**
   * Extract baseline metrics from performance report
   */
  private extractBaselineFromReport(report: PerformanceReport): PerformanceBaseline {
    const baseline: PerformanceBaseline = {
      timestamp: report.timestamp,
      metrics: {
        paginationPerformance: {
          averageExecutionTime: 0,
          averageMemoryUsage: 0,
          itemsPerSecond: 0
        },
        streamingPerformance: {
          averageExecutionTime: 0,
          averageMemoryUsage: 0,
          itemsPerSecond: 0
        },
        concurrencyPerformance: {
          averageExecutionTime: 0,
          maxExecutionTime: 0
        },
        memoryEfficiency: {
          memoryGrowth: 0
        }
      },
      environment: {
        nodeVersion: report.nodeVersion,
        platform: report.platform
      }
    };

    // Extract pagination metrics
    const paginationResult = report.results.find(r => r.name.includes('pagination'));
    if (paginationResult && paginationResult.metrics) {
      baseline.metrics.paginationPerformance = {
        averageExecutionTime: paginationResult.metrics.executionTime || 0,
        averageMemoryUsage: paginationResult.metrics.memoryUsage || 0,
        itemsPerSecond: paginationResult.metrics.itemsPerSecond || 0
      };
    }

    // Extract streaming metrics
    const streamingResult = report.results.find(r => r.name.includes('streaming'));
    if (streamingResult && streamingResult.metrics) {
      baseline.metrics.streamingPerformance = {
        averageExecutionTime: streamingResult.metrics.executionTime || 0,
        averageMemoryUsage: streamingResult.metrics.memoryUsage || 0,
        itemsPerSecond: streamingResult.metrics.itemsPerSecond || 0
      };
    }

    // Extract concurrency metrics
    const concurrencyResult = report.results.find(r => r.name.includes('concurrency'));
    if (concurrencyResult && concurrencyResult.metrics) {
      baseline.metrics.concurrencyPerformance = {
        averageExecutionTime: concurrencyResult.metrics.avgTime || 0,
        maxExecutionTime: concurrencyResult.metrics.maxTime || 0
      };
    }

    // Extract memory efficiency metrics
    const memoryResult = report.results.find(r => r.name.includes('memory'));
    if (memoryResult && memoryResult.metrics) {
      baseline.metrics.memoryEfficiency = {
        memoryGrowth: memoryResult.metrics.memoryGrowth || 0
      };
    }

    return baseline;
  }

  /**
   * Print regression results to console
   */
  printRegressionResults(result: RegressionResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 PERFORMANCE REGRESSION ANALYSIS');
    console.log('='.repeat(60));

    if (result.detected) {
      const icon = result.severity === 'critical' ? '🚨' : result.severity === 'major' ? '⚠️' : '⚠️';
      console.log(`${icon} ${result.severity.toUpperCase()} REGRESSIONS DETECTED`);
      console.log(`Summary: ${result.summary}`);
      
      console.log('\n📉 Regressions:');
      result.regressions.forEach(regression => {
        const direction = regression.percentageChange > 0 ? '📈' : '📉';
        console.log(`  ${direction} ${regression.category}.${regression.metric}: ${regression.baseline.toFixed(2)} → ${regression.current.toFixed(2)} (${regression.percentageChange > 0 ? '+' : ''}${regression.percentageChange.toFixed(1)}%)`);
      });
    } else {
      console.log('✅ No performance regressions detected');
    }

    if (result.improvements.length > 0) {
      console.log('\n📈 Improvements:');
      result.improvements.forEach(improvement => {
        const direction = improvement.percentageChange > 0 ? '📈' : '📉';
        console.log(`  ${direction} ${improvement.category}.${improvement.metric}: ${improvement.baseline.toFixed(2)} → ${improvement.current.toFixed(2)} (${improvement.percentageChange > 0 ? '+' : ''}${improvement.percentageChange.toFixed(1)}%)`);
      });
    }

    console.log('='.repeat(60));
  }

  /**
   * Update baseline if no regressions detected and improvements exist
   */
  async updateBaselineIfNeeded(
    currentReport: PerformanceReport,
    regressionResult: RegressionResult
  ): Promise<boolean> {
    if (regressionResult.detected) {
      console.log('⏭️ Skipping baseline update due to regressions');
      return false;
    }

    if (regressionResult.improvements.length > 0) {
      console.log('🔄 Updating baseline with performance improvements');
      await this.saveBaseline(currentReport);
      return true;
    }

    console.log('⏭️ No significant changes detected, keeping existing baseline');
    return false;
  }
}