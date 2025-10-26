/**
 * E2E Test Configuration
 * 
 * Centralized configuration for all end-to-end tests
 */

export const E2E_TEST_CONFIG = {
  // Test environment
  testTimeout: 30000, // 30 seconds for E2E tests
  hookTimeout: 10000,  // 10 seconds for setup/teardown
  
  // Performance thresholds
  performance: {
    serverStartup: {
      average: 2000,  // < 2 seconds average
      maximum: 3000   // < 3 seconds maximum
    },
    toolExecution: {
      average: 500,   // < 500ms average
      errorMaximum: 1000  // < 1 second for errors
    },
    resourceAccess: {
      average: 200,   // < 200ms average
      maximum: 1000   // < 1 second maximum
    }
  },
  
  // Memory thresholds (in bytes)
  memory: {
    normalOperations: 20 * 1024 * 1024,  // < 20MB
    largeOperations: 50 * 1024 * 1024,   // < 50MB
    concurrentOperations: 100 * 1024 * 1024 // < 100MB
  },
  
  // Load testing
  load: {
    concurrentOperations: 20,
    highFrequencyOperations: 100,
    resourceExhaustionThreshold: 100
  },
  
  // Security test data
  security: {
    pathTraversalAttempts: [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32',
      '/etc/shadow',
      'C:\\Windows\\System32',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%2f..%2f..%2fetc%2fpasswd'
    ],
    injectionAttempts: [
      '${process.exit()}',
      '<script>alert("xss")</script>',
      'require("child_process").exec("rm -rf /")',
      'eval("malicious code")',
      'constructor.constructor("return process")().exit()'
    ],
    malformedJsonRpc: [
      null,
      undefined,
      'not json',
      {},
      { jsonrpc: '1.0' },
      { jsonrpc: '2.0', method: 'invalid' },
      { jsonrpc: '2.0', id: 1 },
      { jsonrpc: '2.0', id: 1, method: '', params: null }
    ]
  },
  
  // Test data templates
  templates: {
    feature: {
      title: 'Feature Test Change',
      rationale: 'Implementing a new feature for testing',
      expectedFiles: ['proposal.md', 'tasks.md', 'specs/']
    },
    bugfix: {
      title: 'Bugfix Test Change',
      rationale: 'Fixing a bug for testing',
      expectedFiles: ['proposal.md', 'tasks.md', 'specs/']
    },
    chore: {
      title: 'Chore Test Change',
      rationale: 'Performing maintenance tasks for testing',
      expectedFiles: ['proposal.md', 'tasks.md', 'specs/']
    }
  },
  
  // Resource URI patterns
  resourceUris: {
    changes: 'changes://',
    change: (slug: string) => `proposal://${slug}`,
    proposal: (slug: string) => `proposal://${slug}`,
    tasks: (slug: string) => `tasks://${slug}`,
    delta: (slug: string) => `delta://${slug}`
  },
  
  // Error codes
  errorCodes: {
    invalidParams: -32602,
    internalError: -32603,
    methodNotFound: -32601
  },
  
  // Test slugs generator
  generateSlug: (prefix: string, suffix?: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 11);
    const base = `${prefix}-${timestamp}-${random}`;
    return suffix ? `${base}-${suffix}` : base;
  },
  
  // Large content generator
  generateLargeContent: (size: number = 100000): string => {
    return 'x'.repeat(size);
  }
};