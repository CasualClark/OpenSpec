/**
 * Performance dashboard generator
 * Creates HTML dashboards for visualizing performance metrics and trends
 */

import { promises as fs } from 'fs';
import { PerformanceReport } from '../../../scripts/performance-test-runner.js';
import { PerformanceBaseline } from './performance-regression-detector.js';

interface DashboardData {
  currentReport: PerformanceReport;
  baseline?: PerformanceBaseline;
  historicalReports?: PerformanceReport[];
  generatedAt: string;
}

export class PerformanceDashboard {
  /**
   * Generate HTML performance dashboard
   */
  async generateDashboard(data: DashboardData, outputPath: string = 'performance-dashboard.html'): Promise<void> {
    const html = this.createDashboardHTML(data);
    await fs.writeFile(outputPath, html);
    console.log(`Performance dashboard generated: ${outputPath}`);
  }

  /**
   * Create dashboard HTML content
   */
  private createDashboardHTML(data: DashboardData): string {
    const { currentReport, baseline, historicalReports, generatedAt } = data;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenSpec Performance Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 700;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 1.1rem;
        }
        
        .timestamp {
            background: rgba(255,255,255,0.1);
            padding: 8px 16px;
            border-radius: 20px;
            display: inline-block;
            margin-top: 15px;
            font-size: 0.9rem;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }
        
        .summary-card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            text-align: center;
            transition: transform 0.2s;
        }
        
        .summary-card:hover {
            transform: translateY(-5px);
        }
        
        .summary-card h3 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 1.1rem;
        }
        
        .summary-card .value {
            font-size: 2.5rem;
            font-weight: 700;
            margin: 10px 0;
        }
        
        .summary-card .unit {
            color: #7f8c8d;
            font-size: 0.9rem;
        }
        
        .success { color: #27ae60; }
        .danger { color: #e74c3c; }
        .warning { color: #f39c12; }
        .info { color: #3498db; }
        
        .charts-section {
            padding: 30px;
        }
        
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 30px;
            margin-top: 20px;
        }
        
        .chart-card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .chart-card h3 {
            color: #2c3e50;
            margin-bottom: 20px;
            font-size: 1.3rem;
        }
        
        .chart-container {
            position: relative;
            height: 300px;
        }
        
        .test-results {
            padding: 30px;
        }
        
        .test-results h2 {
            color: #2c3e50;
            margin-bottom: 20px;
            font-size: 1.5rem;
        }
        
        .test-item {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .test-item.passed {
            border-left: 4px solid #27ae60;
        }
        
        .test-item.failed {
            border-left: 4px solid #e74c3c;
        }
        
        .test-name {
            font-weight: 600;
            color: #2c3e50;
        }
        
        .test-metrics {
            display: flex;
            gap: 20px;
            align-items: center;
        }
        
        .metric {
            text-align: center;
        }
        
        .metric-value {
            font-weight: 700;
            color: #2c3e50;
        }
        
        .metric-label {
            font-size: 0.8rem;
            color: #7f8c8d;
        }
        
        .status-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-badge.passed {
            background: #d4edda;
            color: #155724;
        }
        
        .status-badge.failed {
            background: #f8d7da;
            color: #721c24;
        }
        
        .environment-info {
            background: #ecf0f1;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 30px;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }
        
        .environment-info h3 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        
        .environment-info p {
            margin: 5px 0;
        }
        
        @media (max-width: 768px) {
            .charts-grid {
                grid-template-columns: 1fr;
            }
            
            .summary-grid {
                grid-template-columns: 1fr;
            }
            
            .test-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 15px;
            }
            
            .test-metrics {
                width: 100%;
                justify-content: space-between;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 OpenSpec Performance Dashboard</h1>
            <p>Real-time performance monitoring and analysis</p>
            <div class="timestamp">Generated: ${new Date(generatedAt).toLocaleString()}</div>
        </div>
        
        <div class="summary-grid">
            <div class="summary-card">
                <h3>Total Tests</h3>
                <div class="value info">${currentReport.totalTests}</div>
                <div class="unit">tests run</div>
            </div>
            
            <div class="summary-card">
                <h3>Success Rate</h3>
                <div class="value ${currentReport.failedTests === 0 ? 'success' : 'danger'}">
                    ${((currentReport.passedTests / currentReport.totalTests) * 100).toFixed(1)}%
                </div>
                <div class="unit">${currentReport.passedTests}/${currentReport.totalTests} passed</div>
            </div>
            
            <div class="summary-card">
                <h3>Total Execution Time</h3>
                <div class="value info">${(currentReport.totalExecutionTime / 1000).toFixed(2)}</div>
                <div class="unit">seconds</div>
            </div>
            
            <div class="summary-card">
                <h3>Environment</h3>
                <div class="value" style="font-size: 1.2rem;">${currentReport.platform}</div>
                <div class="unit">${currentReport.nodeVersion}</div>
            </div>
        </div>
        
        <div class="environment-info">
            <h3>🖥️ Environment Details</h3>
            <p><strong>Node.js:</strong> ${currentReport.nodeVersion}</p>
            <p><strong>Platform:</strong> ${currentReport.platform}</p>
            <p><strong>Test Timestamp:</strong> ${new Date(currentReport.timestamp).toLocaleString()}</p>
            ${baseline ? `<p><strong>Baseline Timestamp:</strong> ${new Date(baseline.timestamp).toLocaleString()}</p>` : ''}
        </div>
        
        <div class="charts-section">
            <h2 style="color: #2c3e50; margin-bottom: 10px;">📊 Performance Metrics</h2>
            
            <div class="charts-grid">
                <div class="chart-card">
                    <h3>Execution Time by Test</h3>
                    <div class="chart-container">
                        <canvas id="executionTimeChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-card">
                    <h3>Memory Usage by Test</h3>
                    <div class="chart-container">
                        <canvas id="memoryChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-card">
                    <h3>Throughput (Items/Second)</h3>
                    <div class="chart-container">
                        <canvas id="throughputChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-card">
                    <h3>Test Success Rate</h3>
                    <div class="chart-container">
                        <canvas id="successRateChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="test-results">
            <h2>📋 Detailed Test Results</h2>
            
            ${currentReport.results.map(result => `
                <div class="test-item ${result.passed ? 'passed' : 'failed'}">
                    <div>
                        <div class="test-name">${result.name}</div>
                        ${result.error ? `<div style="color: #e74c3c; font-size: 0.9rem; margin-top: 5px;">${result.error}</div>` : ''}
                    </div>
                    <div class="test-metrics">
                        ${result.executionTime > 0 ? `
                            <div class="metric">
                                <div class="metric-value">${result.executionTime.toFixed(2)}ms</div>
                                <div class="metric-label">Time</div>
                            </div>
                        ` : ''}
                        
                        ${result.memoryUsage > 0 ? `
                            <div class="metric">
                                <div class="metric-value">${(result.memoryUsage / 1024 / 1024).toFixed(2)}MB</div>
                                <div class="metric-label">Memory</div>
                            </div>
                        ` : ''}
                        
                        ${result.metrics?.itemsPerSecond ? `
                            <div class="metric">
                                <div class="metric-value">${result.metrics.itemsPerSecond.toFixed(0)}</div>
                                <div class="metric-label">Items/sec</div>
                            </div>
                        ` : ''}
                        
                        <div class="status-badge ${result.passed ? 'passed' : 'failed'}">
                            ${result.passed ? 'Passed' : 'Failed'}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
    
    <script>
        // Chart data
        const testData = ${JSON.stringify(currentReport.results)};
        const baselineData = ${baseline ? JSON.stringify(baseline) : 'null'};
        
        // Prepare chart data
        const testNames = testData.map(test => test.name.replace(/-/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase()));
        const executionTimes = testData.map(test => test.executionTime || 0);
        const memoryUsage = testData.map(test => test.memoryUsage / 1024 / 1024 || 0); // Convert to MB
        const throughput = testData.map(test => test.metrics?.itemsPerSecond || 0);
        const successRates = testData.map(test => test.passed ? 100 : 0);
        
        // Chart configuration
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        };
        
        // Execution Time Chart
        new Chart(document.getElementById('executionTimeChart'), {
            type: 'bar',
            data: {
                labels: testNames,
                datasets: [{
                    label: 'Execution Time (ms)',
                    data: executionTimes,
                    backgroundColor: executionTimes.map(time => time > 200 ? '#e74c3c' : '#3498db'),
                    borderColor: executionTimes.map(time => time > 200 ? '#c0392b' : '#2980b9'),
                    borderWidth: 1
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
                    y: {
                        ...chartOptions.scales.y,
                        title: {
                            display: true,
                            text: 'Time (ms)'
                        }
                    }
                }
            }
        });
        
        // Memory Usage Chart
        new Chart(document.getElementById('memoryChart'), {
            type: 'bar',
            data: {
                labels: testNames,
                datasets: [{
                    label: 'Memory Usage (MB)',
                    data: memoryUsage,
                    backgroundColor: memoryUsage.map(mem => mem > 50 ? '#e74c3c' : '#27ae60'),
                    borderColor: memoryUsage.map(mem => mem > 50 ? '#c0392b' : '#229954'),
                    borderWidth: 1
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
                    y: {
                        ...chartOptions.scales.y,
                        title: {
                            display: true,
                            text: 'Memory (MB)'
                        }
                    }
                }
            }
        });
        
        // Throughput Chart
        new Chart(document.getElementById('throughputChart'), {
            type: 'bar',
            data: {
                labels: testNames,
                datasets: [{
                    label: 'Items per Second',
                    data: throughput,
                    backgroundColor: '#f39c12',
                    borderColor: '#e67e22',
                    borderWidth: 1
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
                    y: {
                        ...chartOptions.scales.y,
                        title: {
                            display: true,
                            text: 'Items/Second'
                        }
                    }
                }
            }
        });
        
        // Success Rate Chart
        new Chart(document.getElementById('successRateChart'), {
            type: 'doughnut',
            data: {
                labels: ['Passed', 'Failed'],
                datasets: [{
                    data: [
                        testData.filter(test => test.passed).length,
                        testData.filter(test => !test.passed).length
                    ],
                    backgroundColor: ['#27ae60', '#e74c3c'],
                    borderColor: ['#229954', '#c0392b'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
        
        // Auto-refresh every 5 minutes
        setTimeout(() => {
            console.log('Dashboard auto-refresh enabled');
        }, 300000);
    </script>
</body>
</html>`;
  }

  /**
   * Generate performance trends dashboard with historical data
   */
  async generateTrendsDashboard(
    historicalReports: PerformanceReport[],
    outputPath: string = 'performance-trends.html'
  ): Promise<void> {
    if (historicalReports.length === 0) {
      console.log('No historical data available for trends dashboard');
      return;
    }

    const html = this.createTrendsHTML(historicalReports);
    await fs.writeFile(outputPath, html);
    console.log(`Performance trends dashboard generated: ${outputPath}`);
  }

  /**
   * Create trends dashboard HTML
   */
  private createTrendsHTML(reports: PerformanceReport[]): string {
    const sortedReports = reports.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const timestamps = sortedReports.map(report => 
      new Date(report.timestamp).toLocaleDateString()
    );

    const executionTimes = sortedReports.map(report => report.totalExecutionTime / 1000);
    const successRates = sortedReports.map(report => 
      (report.passedTests / report.totalTests) * 100
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenSpec Performance Trends</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .trends-section {
            padding: 30px;
        }
        
        .trend-card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        
        .trend-card h3 {
            color: #2c3e50;
            margin-bottom: 20px;
        }
        
        .chart-container {
            position: relative;
            height: 400px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: #2c3e50;
        }
        
        .stat-label {
            color: #7f8c8d;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📈 Performance Trends Analysis</h1>
            <p>Historical performance data and trends</p>
        </div>
        
        <div class="trends-section">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${reports.length}</div>
                    <div class="stat-label">Total Reports</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${(executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length).toFixed(2)}s</div>
                    <div class="stat-label">Avg Execution Time</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${(successRates.reduce((a, b) => a + b, 0) / successRates.length).toFixed(1)}%</div>
                    <div class="stat-label">Avg Success Rate</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${new Date(reports[0].timestamp).toLocaleDateString()}</div>
                    <div class="stat-label">Date Range</div>
                </div>
            </div>
            
            <div class="trend-card">
                <h3>Execution Time Trends</h3>
                <div class="chart-container">
                    <canvas id="executionTimeTrend"></canvas>
                </div>
            </div>
            
            <div class="trend-card">
                <h3>Success Rate Trends</h3>
                <div class="chart-container">
                    <canvas id="successRateTrend"></canvas>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const timestamps = ${JSON.stringify(timestamps)};
        const executionTimes = ${JSON.stringify(executionTimes)};
        const successRates = ${JSON.stringify(successRates)};
        
        // Execution Time Trend
        new Chart(document.getElementById('executionTimeTrend'), {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [{
                    label: 'Execution Time (seconds)',
                    data: executionTimes,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Time (seconds)'
                        }
                    }
                }
            }
        });
        
        // Success Rate Trend
        new Chart(document.getElementById('successRateTrend'), {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [{
                    label: 'Success Rate (%)',
                    data: successRates,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Success Rate (%)'
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;
  }
}