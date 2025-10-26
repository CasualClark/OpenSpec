# Phase 3 Performance Test Environment

This document describes the comprehensive test environment created for Phase 3 performance validation of OpenSpec. The environment provides all necessary tools, data, and infrastructure to validate performance requirements.

## Overview

The Phase 3 test environment includes:

1. **Test Data Generator** - Creates realistic test repositories with 1000+ changes
2. **Large File Generation** - Produces test files in 10MB, 50MB, and 100MB sizes
3. **Performance Monitoring** - Real-time monitoring infrastructure
4. **CI/CD Pipeline** - Automated validation pipeline
5. **Benchmark Data Generator** - Specialized data for different performance scenarios

## Quick Start

### 1. Generate Test Environment

```bash
# Build the project first
pnpm run build

# Generate the complete test environment
node --expose-gc dist/scripts/test-data-generator.js
```

This will create:
- `./test-environment/` - Main test directory
- `./test-environment/phase3-performance-test-repo/` - Test repository
- `./test-environment/test-files/` - Large test files
- `./test-environment/metadata/` - Test metadata and indexes

### 2. Run Performance Tests

```bash
# Run all Phase 3 performance tests
pnpm test:performance

# Run specific test categories
pnpm test pagination.performance.test.ts
pnpm test streaming.performance.test.ts

# Run with monitoring
NODE_OPTIONS=--expose-gc node --expose-gc dist/scripts/performance-monitor.js &
```

### 3. Generate Benchmark Data

```bash
# Generate specialized benchmark scenarios
node --expose-gc dist/scripts/benchmark-data-generator.js
```

## Components

### Test Data Generator (`scripts/test-data-generator.ts`)

Generates comprehensive test data including:

#### Repository Structure
- **1200+ Changes**: Simulated OpenSpec changes with realistic metadata
- **Change Types**: Proposals, specs, tasks, and deltas
- **Status Distribution**: Draft, active, completed, archived
- **Priority Levels**: Low, medium, high, critical
- **File Attachments**: Multiple files per change with varied content

#### Large Test Files
- **10MB File**: Medium-sized test file
- **50MB File**: Large test file
- **100MB File**: Extra-large test file
- **Varied Content**: JSON, text, binary, and mixed content

#### Metadata and Indexes
- **Change Index**: Summary of all generated changes
- **File Manifest**: List of large files with checksums
- **Benchmark Scripts**: Ready-to-run test scripts

#### Configuration
```typescript
const config = {
  changeCount: 1200,              // Number of changes to generate
  largeFileSizes: [
    10 * 1024 * 1024,            // 10MB
    50 * 1024 * 1024,            // 50MB
    100 * 1024 * 1024            // 100MB
  ],
  outputDir: './test-environment',
  repoName: 'phase3-performance-test-repo'
};
```

### Performance Monitor (`scripts/performance-monitor.ts`)

Provides real-time performance monitoring:

#### Metrics Collected
- **CPU Usage**: Process and system CPU utilization
- **Memory Usage**: Heap, external, and system memory
- **Event Loop Lag**: Response time measurements
- **Custom Metrics**: Application-specific performance data

#### Alerting System
- **Memory Alerts**: High memory usage warnings
- **CPU Alerts**: High CPU utilization warnings
- **Response Time Alerts**: Slow operation detection
- **Severity Levels**: Low, medium, high, critical

#### Usage
```bash
# Start monitoring
node --expose-gc dist/scripts/performance-monitor.js

# Monitor with custom configuration
node -e "
import { PerformanceMonitor } from './dist/scripts/performance-monitor.js';
const monitor = new PerformanceMonitor({
  interval: 2000,
  alertThresholds: {
    memoryUsage: 80,
    cpuUsage: 75,
    responseTime: 1000
  }
});
monitor.start();
"
```

### CI/CD Pipeline (`.github/workflows/phase3-performance.yml`)

Automated performance validation pipeline:

#### Pipeline Stages
1. **Setup Test Environment**: Generate test data and verify
2. **Pagination Performance**: Test pagination with 1000+ changes
3. **Streaming Performance**: Test large file streaming
4. **Load Testing**: Test concurrent operations
5. **Performance Monitoring**: Monitor during operations
6. **Comprehensive Analysis**: Generate detailed reports
7. **Performance Gate**: Validate against thresholds

#### Configuration Options
```yaml
# Manual dispatch with custom parameters
test_type: 'all'                    # all, pagination, streaming, load, monitoring
change_count: '1200'                # Number of changes
file_sizes: '10,50,100'             # File sizes in MB
```

#### Performance Gates
- **Pagination**: <200ms for 1000+ changes
- **Streaming**: <50MB memory for 100MB files
- **Load Testing**: <500ms average response time
- **Memory**: <85% memory usage threshold

### Benchmark Data Generator (`scripts/benchmark-data-generator.ts`)

Creates specialized test scenarios:

#### Scenario Types
1. **High-Volume Pagination**: 5000+ items with various page sizes
2. **Large File Streaming**: Multiple file sizes with chunk variations
3. **High Concurrency**: Up to 100 simultaneous operations
4. **Memory Pressure**: Various data types and memory levels
5. **Edge Cases**: Unusual data structures and conditions

#### Generated Data
- **Scenario-Specific Files**: Tailored test data for each scenario
- **Test Configurations**: Expected results and thresholds
- **Runner Scripts**: Automated test execution scripts
- **Master Index**: Complete scenario catalog

#### Usage
```bash
# Generate all benchmark scenarios
node --expose-gc dist/scripts/benchmark-data-generator.js

# Run specific scenario
cd benchmark-data/runners
node run-high-volume-pagination.js
```

## Performance Requirements

### Pagination Requirements
| Metric | Requirement | Target |
|--------|-------------|--------|
| Execution Time | <200ms for 1000+ changes | ✅ 200ms |
| Memory Usage | <50MB peak | ✅ 50MB |
| Throughput | >5000 items/second | ✅ 5000/s |

### Streaming Requirements
| Metric | Requirement | Target |
|--------|-------------|--------|
| Memory Usage | <50MB for 100MB files | ✅ 50MB |
| Memory Growth | <20MB during streaming | ✅ 20MB |
| Throughput | >10MB/second | ✅ 10MB/s |

### Concurrency Requirements
| Metric | Requirement | Target |
|--------|-------------|--------|
| Concurrent Requests | 10 simultaneous | ✅ 10 |
| Response Time | <500ms average | ✅ 500ms |
| Success Rate | 100% under load | ✅ 100% |

## Test Execution

### Local Development

#### Full Test Suite
```bash
# Run all performance tests
pnpm test:performance

# Generate and view report
pnpm test:performance:report
```

#### Individual Categories
```bash
# Pagination tests
pnpm test pagination.performance.test.ts

# Streaming tests
pnpm test streaming.performance.test.ts

# With coverage
pnpm test:coverage test/performance/
```

#### Monitoring During Tests
```bash
# Start monitoring in background
NODE_OPTIONS=--expose-gc node --expose-gc dist/scripts/performance-monitor.js &
MONITOR_PID=$!

# Run tests
pnpm test:performance

# Stop monitoring
kill $MONITOR_PID
```

### CI/CD Integration

#### Pull Request Validation
The pipeline automatically runs on pull requests and validates:
- All performance requirements
- Regression detection against baselines
- Performance gate enforcement

#### Manual Execution
```yaml
# GitHub Actions workflow dispatch
name: Phase 3 Performance Validation
on:
  workflow_dispatch:
    inputs:
      test_type: all
      change_count: 1200
      file_sizes: 10,50,100
```

#### Environment Variables
```bash
NODE_OPTIONS=--expose-gc              # Enable garbage collection
PHASE3_TEST_TIMEOUT=1800000           # 30 minutes
PERFORMANCE_THRESHOLD_CPU=80          # 80% CPU threshold
PERFORMANCE_THRESHOLD_MEMORY=85      # 85% memory threshold
```

## Results and Reporting

### Performance Dashboard
Generated HTML dashboard includes:
- **Real-time Metrics**: Current performance data
- **Historical Trends**: Performance over time
- **Interactive Charts**: Visual performance analysis
- **Detailed Reports**: Granular test results

### Report Structure
```json
{
  "timestamp": "2025-10-24T12:00:00Z",
  "summary": {
    "totalTests": 15,
    "passedTests": 14,
    "failedTests": 1,
    "totalExecutionTime": 4532.50
  },
  "categories": {
    "paginationPerformance": true,
    "streamingPerformance": true,
    "concurrencyPerformance": false,
    "memoryEfficiency": true
  },
  "results": [...]
}
```

### Alert Notifications
- **PR Comments**: Automatic results posting
- **Performance Regressions**: Blocking alerts for failures
- **Trend Analysis**: Historical performance tracking

## Troubleshooting

### Common Issues

#### Memory Monitoring Issues
```bash
# Ensure garbage collection is enabled
export NODE_OPTIONS=--expose-gc
pnpm test:performance
```

#### Test Timeouts
```bash
# Increase timeout for slower systems
VITEST_TEST_TIMEOUT=30000 pnpm test:performance
```

#### Inconsistent Results
- Ensure consistent system load
- Close unnecessary applications
- Use dedicated test environment
- Run multiple iterations

#### CI Failures
- Check resource limits in CI environment
- Verify Node.js version compatibility
- Review system resource constraints

### Debug Mode
```bash
# Enable detailed logging
export DEBUG_PERFORMANCE=true
pnpm test:performance
```

### Performance Profiling
```bash
# Run with Node.js profiler
node --prof dist/scripts/performance-test-runner.js
node --prof-process isolate-*.log > performance-profile.txt
```

## Best Practices

### Running Tests
1. **Environment Setup**: Use `--expose-gc` for accurate memory monitoring
2. **Consistent Hardware**: Run on similar hardware for comparable results
3. **Multiple Runs**: Use multiple iterations for statistical significance
4. **Warm-up Period**: Allow warm-up iterations to stabilize measurements

### Interpreting Results
1. **Look for Trends**: Focus on patterns rather than single runs
2. **Consider Variance**: Account for natural performance variation
3. **Environment Factors**: Consider system load and resource availability
4. **Baseline Comparison**: Always compare against established baselines

### Performance Optimization
1. **Profile First**: Use benchmark results to identify bottlenecks
2. **Iterative Testing**: Test after each optimization
3. **Memory Management**: Monitor for memory leaks and pressure
4. **Concurrency Scaling**: Test with increasing concurrent loads

## Contributing

### Adding New Performance Tests
1. **Create Test File**: Add to `test/performance/` directory
2. **Use Benchmark Framework**: Extend `PerformanceBenchmark` class
3. **Define Thresholds**: Set appropriate performance requirements
4. **Add to CI Runner**: Include in `performance-test-runner.ts`
5. **Update Documentation**: Document new test requirements

### Performance Requirements
When adding new tests, define clear performance requirements:
```typescript
const requirements = {
  maxExecutionTime: 1000,      // 1 second
  maxMemoryUsage: 100 * 1024 * 1024,  // 100MB
  minThroughput: 100,          // 100 items/second
  successRate: 95              // 95% success rate
};
```

### Regression Detection
Update regression thresholds for new metrics:
```typescript
const regressionThresholds = {
  newMetricRegression: 20,     // 20% regression threshold
  newMetricCritical: 60         // 60% critical threshold
};
```

## Future Enhancements

### Planned Features
- **Distributed Testing**: Multi-machine performance testing
- **Real-time Monitoring**: Live performance dashboards
- **Integration Testing**: Performance testing with external services
- **Load Testing**: Higher concurrency and stress testing
- **Comparative Analysis**: Performance comparison across versions

### Integration Opportunities
- **Grafana Dashboards**: Real-time performance visualization
- **Prometheus Metrics**: Performance metric collection
- **Alertmanager Integration**: Automated alerting for regressions
- **Performance Budgets**: Automated performance budget enforcement

## Support

For questions or issues with the Phase 3 performance test environment:

1. **Check Documentation**: Review this document and test files
2. **Review CI Logs**: Check GitHub Actions for detailed error messages
3. **Create Issue**: File an issue with performance test details
4. **Contact Team**: Reach out to the OpenSpec development team

---

*This Phase 3 performance test environment ensures OpenSpec meets all performance requirements and provides early detection of performance regressions before they impact production users.*