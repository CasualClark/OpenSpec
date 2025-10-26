#!/usr/bin/env node

/**
 * Comprehensive Test Runner for Phase 4 SSE Server
 * Runs unit tests, integration tests, and load tests
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  unitTests: {
    enabled: true,
    command: 'vitest run',
    coverage: true,
    files: [
      'test/routes/*.test.ts',
      'test/security/*.test.ts',
      'test/health/__tests__/*.test.ts'
    ]
  },
  integrationTests: {
    enabled: true,
    command: 'vitest run',
    files: ['test/integration/*.test.ts']
  },
  loadTests: {
    sse: {
      enabled: true,
      script: 'test/load/sse-load-test.js',
      concurrentConnections: 50,
      duration: 60000 // 1 minute for CI
    },
    ndjson: {
      enabled: true,
      script: 'test/load/ndjson-load-test.js',
      requestsPerSecond: 50,
      duration: 60000 // 1 minute for CI
    }
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${title}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

/**
 * Run a command with error handling
 */
function runCommand(command, cwd = process.cwd()) {
  try {
    logInfo(`Running: ${command}`);
    const output = execSync(command, { 
      cwd, 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return { success: true, output };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout || '',
      error: error.stderr || error.message 
    };
  }
}

/**
 * Check if server is running
 */
function checkServerHealth() {
  const result = runCommand('curl -f http://localhost:8443/healthz 2>/dev/null');
  return result.success;
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxAttempts = 30, delay = 2000) {
  logInfo('Waiting for server to be ready...');
  
  for (let i = 0; i < maxAttempts; i++) {
    if (checkServerHealth()) {
      logSuccess('Server is ready!');
      return true;
    }
    
    logInfo(`Attempt ${i + 1}/${maxAttempts}...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  logError('Server failed to start within timeout period');
  return false;
}

/**
 * Run unit tests
 */
async function runUnitTests() {
  logSection('Running Unit Tests');
  
  const config = TEST_CONFIG.unitTests;
  if (!config.enabled) {
    logWarning('Unit tests disabled');
    return true;
  }

  // Build the project first
  const buildResult = runCommand('pnpm build');
  if (!buildResult.success) {
    logError('Build failed');
    console.error(buildResult.error);
    return false;
  }

  // Run tests with coverage if enabled
  const command = config.coverage 
    ? `${config.command} --coverage --reporter=verbose`
    : config.command;

  const result = runCommand(command);
  
  if (result.success) {
    logSuccess('Unit tests passed');
    if (result.output) {
      console.log(result.output);
    }
    return true;
  } else {
    logError('Unit tests failed');
    console.error(result.error);
    return false;
  }
}

/**
 * Run integration tests
 */
async function runIntegrationTests() {
  logSection('Running Integration Tests');
  
  const config = TEST_CONFIG.integrationTests;
  if (!config.enabled) {
    logWarning('Integration tests disabled');
    return true;
  }

  // Check if server is running
  if (!checkServerHealth()) {
    logWarning('Server not running, starting test server...');
    
    // Start server in background
    const serverResult = runCommand('node test-server.mjs', process.cwd());
    if (!serverResult.success) {
      logError('Failed to start test server');
      return false;
    }

    // Wait for server to be ready
    const serverReady = await waitForServer();
    if (!serverReady) {
      logError('Test server failed to start');
      return false;
    }
  }

  const result = runCommand(`${config.command} ${config.files.join(' ')}`);
  
  if (result.success) {
    logSuccess('Integration tests passed');
    if (result.output) {
      console.log(result.output);
    }
    return true;
  } else {
    logError('Integration tests failed');
    console.error(result.error);
    return false;
  }
}

/**
 * Run load tests
 */
async function runLoadTests() {
  logSection('Running Load Tests');
  
  const config = TEST_CONFIG.loadTests;
  let allPassed = true;

  // Check if server is running
  if (!checkServerHealth()) {
    logWarning('Server not running, starting test server...');
    
    const serverResult = runCommand('node test-server.mjs', process.cwd());
    if (!serverResult.success) {
      logError('Failed to start test server');
      return false;
    }

    const serverReady = await waitForServer();
    if (!serverReady) {
      logError('Test server failed to start');
      return false;
    }
  }

  // Run SSE load tests
  if (config.sse.enabled) {
    logInfo('Running SSE load tests...');
    
    const env = {
      ...process.env,
      CONCURRENT_CONNECTIONS: config.sse.concurrentConnections.toString(),
      TEST_DURATION: config.sse.duration.toString()
    };

    const result = runCommand(`node ${config.sse.script}`);
    
    if (result.success) {
      logSuccess('SSE load tests passed');
    } else {
      logError('SSE load tests failed');
      console.error(result.error);
      allPassed = false;
    }
  }

  // Run NDJSON load tests
  if (config.ndjson.enabled) {
    logInfo('Running NDJSON load tests...');
    
    const result = runCommand(`node ${config.ndjson.script}`);
    
    if (result.success) {
      logSuccess('NDJSON load tests passed');
    } else {
      logError('NDJSON load tests failed');
      console.error(result.error);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * Generate test report
 */
function generateTestReport(results) {
  logSection('Test Report Summary');
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  const failedTests = totalTests - passedTests;

  log(`Total Test Suites: ${totalTests}`);
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
  
  console.log('\nDetailed Results:');
  Object.entries(results).forEach(([testName, passed]) => {
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    const color = passed ? 'green' : 'red';
    log(`  ${testName}: ${status}`, color);
  });

  if (failedTests === 0) {
    log('\n🎉 All tests passed!', 'green');
  } else {
    log(`\n💥 ${failedTests} test suite(s) failed!`, 'red');
  }

  return failedTests === 0;
}

/**
 * Main test runner
 */
async function main() {
  log('🚀 Phase 4 SSE Server - Comprehensive Test Runner', 'magenta');
  log(`📅 Started at: ${new Date().toISOString()}\n`);

  const results = {};

  try {
    // Run unit tests
    results.unitTests = await runUnitTests();

    // Run integration tests
    results.integrationTests = await runIntegrationTests();

    // Run load tests
    results.loadTests = await runLoadTests();

    // Generate final report
    const allPassed = generateTestReport(results);

    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    logError(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Phase 4 SSE Server Test Runner

Usage: node run-all-tests.js [options]

Options:
  --help, -h     Show this help message
  --unit-only    Run only unit tests
  --integration-only  Run only integration tests
  --load-only    Run only load tests
  --no-coverage  Skip coverage reporting

Environment Variables:
  SERVER_URL     Server URL for tests (default: http://localhost:8443)
  AUTH_TOKEN     Authentication token for tests
  CONCURRENT_CONNECTIONS  Number of concurrent connections for SSE load tests
  REQUESTS_PER_SECOND  Target RPS for NDJSON load tests
  TEST_DURATION  Duration for load tests in milliseconds
`);
  process.exit(0);
}

// Modify config based on arguments
if (args.includes('--unit-only')) {
  TEST_CONFIG.integrationTests.enabled = false;
  TEST_CONFIG.loadTests.sse.enabled = false;
  TEST_CONFIG.loadTests.ndjson.enabled = false;
}

if (args.includes('--integration-only')) {
  TEST_CONFIG.unitTests.enabled = false;
  TEST_CONFIG.loadTests.sse.enabled = false;
  TEST_CONFIG.loadTests.ndjson.enabled = false;
}

if (args.includes('--load-only')) {
  TEST_CONFIG.unitTests.enabled = false;
  TEST_CONFIG.integrationTests.enabled = false;
}

if (args.includes('--no-coverage')) {
  TEST_CONFIG.unitTests.coverage = false;
}

// Run the tests
main();