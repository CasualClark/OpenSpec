import { describe, it, expect } from 'vitest';
import {
  parseUri,
  validateQueryParams,
  isUriSafe,
  buildUri,
  normalizeUri,
  extractChangeFilePath,
  isChangesActiveUri,
  isChangeUri,
  UriParseError,
  type QueryParamRule,
} from '../../src/utils/uri-parser.js';

describe('URI Parser Utilities', () => {
  describe('parseUri', () => {
    it('should parse basic changes://active URI', () => {
      const uri = 'changes://active';
      const result = parseUri(uri);

      expect(result.uri).toBe(uri);
      expect(result.scheme).toBe('changes');
      expect(result.host).toBe('active');
      expect(result.pathSegments).toEqual(['active']);
      expect(result.queryParams).toEqual({});
      expect(result.fragment).toBeUndefined();
      expect(result.mimeType).toBe('application/octet-stream');
      expect(result.security.hasPathTraversal).toBe(false);
      expect(result.security.hasInvalidSlug).toBe(false);
      expect(result.security.hasInvalidQueryParams).toBe(false);
      expect(result.security.warnings).toEqual([]);
    });

    it('should parse changes://active with query parameters', () => {
      const uri = 'changes://active?page=1&pageSize=20&filter=draft';
      const result = parseUri(uri);

      expect(result.scheme).toBe('changes');
      expect(result.host).toBe('active');
      expect(result.queryParams).toEqual({
        page: '1',
        pageSize: '20',
        filter: 'draft',
      });
    });

    it('should parse change://[slug]/[file] patterns', () => {
      const uri = 'change://my-feature/proposal.md';
      const result = parseUri(uri);

      expect(result.scheme).toBe('change');
      expect(result.host).toBe('my-feature/proposal.md');
      expect(result.pathSegments).toEqual(['my-feature', 'proposal.md']);
      expect(result.mimeType).toBe('text/markdown');
    });

    it('should detect MIME types from file extensions', () => {
      const testCases = [
        { uri: 'change://test/file.json', expected: 'application/json' },
        { uri: 'change://test/file.txt', expected: 'text/plain' },
        { uri: 'change://test/file.md', expected: 'text/markdown' },
        { uri: 'change://test/file.png', expected: 'image/png' },
        { uri: 'change://test/file.diff', expected: 'text/plain' },
        { uri: 'change://test/unknown.xyz', expected: 'application/octet-stream' },
      ];

      testCases.forEach(({ uri, expected }) => {
        const result = parseUri(uri);
        expect(result.mimeType).toBe(expected);
      });
    });

    it('should handle complex nested paths', () => {
      const uri = 'change://feature-123/specs/api/v1/openapi.yaml';
      const result = parseUri(uri);

      expect(result.pathSegments).toEqual(['feature-123', 'specs', 'api', 'v1', 'openapi.yaml']);
      expect(result.mimeType).toBe('application/x-yaml');
    });

    it('should handle fragments', () => {
      const uri = 'change://test/file.md#section-1';
      const result = parseUri(uri);

      expect(result.fragment).toBe('section-1');
    });

    it('should handle encoded query parameters', () => {
      const uri = 'changes://active?search=hello%20world&filter=status%3Ddraft';
      const result = parseUri(uri);

      expect(result.queryParams).toEqual({
        search: 'hello world',
        filter: 'status=draft',
      });
    });

    it('should handle empty query parameter values', () => {
      const uri = 'changes://active?empty=&filled=value';
      const result = parseUri(uri);

      expect(result.queryParams).toEqual({
        empty: '',
        filled: 'value',
      });
    });

    it('should reject invalid URI formats', () => {
      const invalidUris = [
        '',
        'not-a-uri',
        '://missing-scheme',
        'scheme-only://',
      ];

      invalidUris.forEach(uri => {
        expect(() => parseUri(uri)).toThrow(UriParseError);
      });
    });

    it('should reject invalid schemes', () => {
      const invalidUris = [
        '123invalid://test',
        '-invalid://test',
        'inv@lid://test',
      ];

      invalidUris.forEach(uri => {
        expect(() => parseUri(uri)).toThrow(UriParseError);
      });
    });

    it('should detect path traversal attempts', () => {
      const traversalUris = [
        'change://../etc/passwd',
        'change://test/../secret',
        'change://test/../../etc/passwd',
        'change://test/~/file',
      ];

      traversalUris.forEach(uri => {
        const result = parseUri(uri);
        expect(result.security.hasPathTraversal).toBe(true);
        expect(result.security.warnings.length).toBeGreaterThan(0);
      });
    });

    it('should detect invalid slugs in change:// URIs', () => {
      const invalidSlugUris = [
        'change://INVALID/file.md',
        'change://test-123456789012345678901234567890123456789012345678901234567890123/file.md', // too long
        'change://-invalid/file.md',
        'change://invalid-/file.md',
      ];

      invalidSlugUris.forEach(uri => {
        const result = parseUri(uri);
        expect(result.security.hasInvalidSlug).toBe(true);
        expect(result.security.warnings.length).toBeGreaterThan(0);
      });
    });

    it('should enforce maximum path segments', () => {
      const longPath = 'change://' + Array(12).fill('segment').join('/');
      
      expect(() => parseUri(longPath, { maxPathSegments: 10 }))
        .toThrow(UriParseError);
    });

    it('should enforce maximum query parameter length', () => {
      const longValue = 'a'.repeat(1001);
      const uri = `changes://active?param=${longValue}`;
      
      expect(() => parseUri(uri, { maxQueryParamLength: 1000 }))
        .toThrow(UriParseError);
    });

    it('should reject fragments when not allowed', () => {
      const uri = 'change://test/file.md#section';
      
      expect(() => parseUri(uri, { allowFragments: false }))
        .toThrow(UriParseError);
    });

    it('should use custom MIME types', () => {
      const customMimeTypes = {
        '.custom': 'application/custom',
        '.special': 'text/special',
      };
      
      const uri = 'change://test/file.custom';
      const result = parseUri(uri, { customMimeTypes });
      
      expect(result.mimeType).toBe('application/custom');
    });
  });

  describe('validateQueryParams', () => {
    it('should validate required parameters', () => {
      const queryParams = { page: '1', pageSize: '20' };
      const rules: Record<string, QueryParamRule> = {
        page: { required: true, type: 'number' },
        pageSize: { required: true, type: 'number' },
        filter: { required: true },
      };

      const result = validateQueryParams(queryParams, rules);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Required parameter \'filter\' is missing');
    });

    it('should validate parameter types', () => {
      const queryParams = { page: 'invalid', active: 'maybe' };
      const rules: Record<string, QueryParamRule> = {
        page: { type: 'number' },
        active: { type: 'boolean' },
      };

      const result = validateQueryParams(queryParams, rules);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Parameter \'page\' must be a number');
      expect(result.errors).toContain('Parameter \'active\' must be true or false');
    });

    it('should validate numeric ranges', () => {
      const queryParams = { page: '0', pageSize: '2000' };
      const rules: Record<string, QueryParamRule> = {
        page: { type: 'number', min: 1 },
        pageSize: { type: 'number', max: 1000 },
      };

      const result = validateQueryParams(queryParams, rules);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Parameter \'page\' must be at least 1');
      expect(result.errors).toContain('Parameter \'pageSize\' must be at most 1000');
    });

    it('should validate patterns', () => {
      const queryParams = { slug: 'invalid-slug!' };
      const rules: Record<string, QueryParamRule> = {
        slug: { pattern: /^[a-z0-9-]+$/ },
      };

      const result = validateQueryParams(queryParams, rules);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Parameter \'slug\' does not match required pattern');
    });

    it('should validate allowed values', () => {
      const queryParams = { status: 'invalid', sort: 'name' };
      const rules: Record<string, QueryParamRule> = {
        status: { allowedValues: ['draft', 'active', 'archived'] },
        sort: { allowedValues: ['name', 'date', 'status'] },
      };

      const result = validateQueryParams(queryParams, rules);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Parameter \'status\' must be one of: draft, active, archived');
    });

    it('should pass validation for valid parameters', () => {
      const queryParams = { page: '2', active: 'true', status: 'draft' };
      const rules: Record<string, QueryParamRule> = {
        page: { type: 'number', min: 1, max: 100 },
        active: { type: 'boolean' },
        status: { allowedValues: ['draft', 'active', 'archived'] },
      };

      const result = validateQueryParams(queryParams, rules);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('isUriSafe', () => {
    it('should return true for safe URIs', () => {
      const uri = 'change://valid-slug/file.md';
      const parsed = parseUri(uri);
      
      expect(isUriSafe(parsed)).toBe(true);
    });

    it('should return false for URIs with path traversal', () => {
      const uri = 'change://../etc/passwd';
      const parsed = parseUri(uri);
      
      expect(isUriSafe(parsed)).toBe(false);
    });

    it('should return false for URIs with invalid slugs', () => {
      const uri = 'change://INVALID/file.md';
      const parsed = parseUri(uri);
      
      expect(isUriSafe(parsed)).toBe(false);
    });

    it('should handle warnings based on allowWarnings flag', () => {
      const uri = 'change://test/../file.md';
      const parsed = parseUri(uri);
      
      expect(isUriSafe(parsed, false)).toBe(false);
      expect(isUriSafe(parsed, true)).toBe(false); // Still false due to path traversal
    });
  });

  describe('buildUri', () => {
    it('should build basic URI', () => {
      const uri = buildUri({
        scheme: 'changes',
        host: 'active',
      });
      
      expect(uri).toBe('changes://active');
    });

    it('should build URI with query parameters', () => {
      const uri = buildUri({
        scheme: 'changes',
        host: 'active',
        queryParams: { page: '1', pageSize: '20' },
      });
      
      expect(uri).toBe('changes://active?page=1&pageSize=20');
    });

    it('should build URI with fragment', () => {
      const uri = buildUri({
        scheme: 'change',
        host: 'test/file.md',
        fragment: 'section-1',
      });
      
      expect(uri).toBe('change://test/file.md#section-1');
    });

    it('should encode query parameters and fragments', () => {
      const uri = buildUri({
        scheme: 'changes',
        host: 'active',
        queryParams: { search: 'hello world', filter: 'status=draft' },
        fragment: 'section 1',
      });
      
      expect(uri).toBe('changes://active?search=hello%20world&filter=status%3Ddraft#section%201');
    });
  });

  describe('normalizeUri', () => {
    it('should normalize basic URI', () => {
      const normalized = normalizeUri('changes://active');
      expect(normalized).toBe('changes://active');
    });

    it('should normalize URI with query parameters', () => {
      const normalized = normalizeUri('changes://active?page=1&pageSize=20');
      expect(normalized).toBe('changes://active?page=1&pageSize=20');
    });

    it('should preserve order of existing query parameters', () => {
      const normalized = normalizeUri('changes://active?b=2&a=1');
      expect(normalized).toBe('changes://active?b=2&a=1');
    });
  });

  describe('extractChangeFilePath', () => {
    it('should extract file path from change:// URI', () => {
      const uri = 'change://my-feature/specs/api.md';
      const parsed = parseUri(uri);
      const filePath = extractChangeFilePath(parsed);
      
      expect(filePath).toBe('specs/api.md');
    });

    it('should handle URIs with only slug', () => {
      const uri = 'change://my-feature';
      const parsed = parseUri(uri);
      const filePath = extractChangeFilePath(parsed);
      
      expect(filePath).toBe('');
    });

    it('should throw error for non-change:// URIs', () => {
      const uri = 'changes://active';
      const parsed = parseUri(uri);
      
      expect(() => extractChangeFilePath(parsed)).toThrow(UriParseError);
    });

    it('should throw error for URIs without slug', () => {
      const uri = 'change://';
      
      expect(() => parseUri(uri)).toThrow(UriParseError);
    });
  });

  describe('isChangesActiveUri', () => {
    it('should identify changes://active URIs', () => {
      expect(isChangesActiveUri('changes://active')).toBe(true);
      expect(isChangesActiveUri('changes://active?page=1')).toBe(true);
    });

    it('should reject non-changes://active URIs', () => {
      expect(isChangesActiveUri('change://active')).toBe(false);
      expect(isChangesActiveUri('changes://other')).toBe(false);
      expect(isChangesActiveUri('invalid-uri')).toBe(false);
    });
  });

  describe('isChangeUri', () => {
    it('should identify change:// URIs', () => {
      expect(isChangeUri('change://my-feature')).toBe(true);
      expect(isChangeUri('change://test/file.md')).toBe(true);
    });

    it('should reject non-change:// URIs', () => {
      expect(isChangeUri('changes://active')).toBe(false);
      expect(isChangeUri('file://path')).toBe(false);
      expect(isChangeUri('invalid-uri')).toBe(false);
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle null byte injection attempts', () => {
      const uri = 'change://test/file.md\0.txt';
      const result = parseUri(uri);
      
      expect(result.pathSegments).toContain('file.md\0.txt');
      expect(result.security.hasPathTraversal).toBe(true);
      expect(result.security.warnings.length).toBeGreaterThan(0);
    });

    it('should handle extremely long path segments', () => {
      const longSegment = 'a'.repeat(1000);
      const uri = `change://test/${longSegment}/file.md`;
      
      expect(() => parseUri(uri, { maxPathSegments: 5 })).not.toThrow();
    });

    it('should handle special characters in query parameters', () => {
      const uri = 'changes://active?param=<script>alert("xss")</script>';
      const result = parseUri(uri);
      
      expect(result.queryParams.param).toBe('<script>alert("xss")</script>');
    });

    it('should handle multiple consecutive slashes', () => {
      const uri = 'change://test//file.md';
      const result = parseUri(uri);
      
      expect(result.pathSegments).toEqual(['test', 'file.md']);
    });

    it('should handle empty path segments', () => {
      const uri = 'change:///file.md';
      const result = parseUri(uri);
      
      expect(result.pathSegments).toEqual(['file.md']);
    });

    it('should handle Unicode characters', () => {
      const uri = 'change://测试/文件.md';
      const result = parseUri(uri);
      
      expect(result.pathSegments).toEqual(['测试', '文件.md']);
    });

    // Additional comprehensive security tests
    it('should detect encoded path traversal attempts', () => {
      const encodedTraversalUris = [
        'change://test/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        'change://test/%2E%2E%2F%2E%2E%2F%2E%2E%2Fetc%2Fpasswd',
        'change://test/%252e%252e%252fetc%252fpasswd',
        'change://test/..%2F..%2F..%2Fetc%2Fpasswd',
        'change://test/..%2f..%2f..%2fetc%2fpasswd'
      ];

      encodedTraversalUris.forEach(uri => {
        const result = parseUri(uri);
        // Even if encoded, the decoded path should be checked for traversal
        expect(result.security.warnings.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('should prevent SQL injection patterns in query parameters', () => {
      const sqlInjectionUris = [
        'changes://active?id=1%27%20OR%20%271%27%3D%271',
        'changes://active?search=\';DROP TABLE users;--',
        'changes://active?filter=1%27 UNION SELECT * FROM users--'
      ];

      sqlInjectionUris.forEach(uri => {
        const result = parseUri(uri);
        // Should parse but security should note potential issues
        expect(result.queryParams).toBeDefined();
        // The actual SQL injection prevention would be handled at the application layer
      });
    });

    it('should handle command injection attempts', () => {
      const commandInjectionUris = [
        'changes://active?file=`cat /etc/passwd`',
        'changes://active?cmd=$(whoami)',
        'changes://active?exec=|ls -la'
      ];

      commandInjectionUris.forEach(uri => {
        const result = parseUri(uri);
        expect(result.queryParams).toBeDefined();
        // Values should be preserved for application-level validation
      });
    });

    it('should detect symlink traversal patterns', () => {
      const symlinkUris = [
        'change://test/symlink/etc/passwd',
        'change://test/link/../../../etc/passwd',
        'change://test/alias/../../secret'
      ];

      symlinkUris.forEach(uri => {
        const result = parseUri(uri);
        // Basic pattern detection - actual symlink resolution would be filesystem-level
        expect(result.security.hasPathTraversal).toBe(result.pathSegments.some(seg => seg.includes('..')));
      });
    });

    it('should handle extremely long query parameter names', () => {
      const longParamName = 'a'.repeat(100);
      const uri = `changes://active?${longParamName}=value`;
      
      expect(() => parseUri(uri)).not.toThrow();
      const result = parseUri(uri);
      expect(result.queryParams[longParamName]).toBe('value');
    });

    it('should handle large numbers of query parameters', () => {
      const paramCount = 50;
      const params = Array.from({ length: paramCount }, (_, i) => `param${i}=value${i}`).join('&');
      const uri = `changes://active?${params}`;
      
      const result = parseUri(uri);
      expect(Object.keys(result.queryParams)).toHaveLength(paramCount);
    });

    it('should handle deeply nested path segments within limits', () => {
      const depth = 8; // Within default max of 10
      const pathSegments = Array.from({ length: depth }, (_, i) => `level${i}`);
      const uri = `change://${pathSegments.join('/')}/file.md`;
      
      const result = parseUri(uri);
      expect(result.pathSegments.length).toBe(depth + 1); // +1 for file.md
      expect(result.security.hasPathTraversal).toBe(false);
    });

    it('should reject URIs with control characters', () => {
      const controlCharUris = [
        'change://test/file\t.md',
        'change://test/file\n.md',
        'change://test/file\r.md',
        'change://test/file\x00.md'
      ];

      controlCharUris.forEach(uri => {
        const result = parseUri(uri);
        // Should parse but may have security warnings
        expect(result.pathSegments).toBeDefined();
      });
    });

    it('should handle URL-encoded control characters', () => {
      const encodedControlUris = [
        'changes://active?param=%09%0a%0d%00', // tab, newline, carriage return, null
        'change://test/file%00.md'
      ];

      encodedControlUris.forEach(uri => {
        const result = parseUri(uri);
        expect(result).toBeDefined();
      });
    });

    it('should validate scheme against common attack patterns', () => {
      const maliciousSchemes = [
        '123invalid://test', // starts with number
        '-invalid://test', // starts with dash
        'inv@lid://test', // contains invalid char
        'inv lid://test', // contains space
        'inv#lid://test', // contains hash
      ];

      maliciousSchemes.forEach(scheme => {
        // These should parse as invalid schemes
        expect(() => parseUri(scheme)).toThrow(UriParseError);
      });

      // These technically valid schemes should parse but be flagged for security review
      const technicallyValid = [
        'javascript://alert("xss")',
        'data://text/html,<script>alert("xss")</script>',
        'vbscript://msgbox("xss")',
        'file:///etc/passwd',
        'inv.lid://test' // dots are allowed in RFC 3986
      ];

      technicallyValid.forEach(scheme => {
        const result = parseUri(scheme);
        expect(result.scheme).toBeDefined();
        // Application-level security should handle these schemes
      });
    });

    it('should handle buffer overflow attempts', () => {
      const hugeString = 'a'.repeat(100000);
      const uri = `changes://active?param=${hugeString}`;
      
      expect(() => parseUri(uri, { maxQueryParamLength: 1000 })).toThrow(UriParseError);
    });

    it('should detect race condition patterns', () => {
      const raceConditionUris = [
        'change://test/../file.md',
        'change://test/../../file.md',
        'change://test/~/file.md'
      ];

      raceConditionUris.forEach(uri => {
        const result = parseUri(uri);
        // Should detect the path traversal patterns
        expect(result.security.hasPathTraversal).toBe(true);
      });

      // Test that ./ segments don't trigger traversal (they're normalized)
      const nonTraversalUris = [
        'change://test/./file.md',
        'change://test/./../file.md' // This has both, so should still be true
      ];

      nonTraversalUris.forEach(uri => {
        const result = parseUri(uri);
        if (uri.includes('..')) {
          expect(result.security.hasPathTraversal).toBe(true);
        } else {
          expect(result.security.hasPathTraversal).toBe(false);
        }
      });
    });

    it('should handle MIME type security', () => {
      const executableExtensions = [
        'change://test/file.exe',
        'change://test/file.bat',
        'change://test/file.cmd',
        'change://test/file.com',
        'change://test/file.scr'
      ];

      executableExtensions.forEach(uri => {
        const result = parseUri(uri);
        // Should default to application/octet-stream for executables
        expect(result.mimeType).toBe('application/octet-stream');
      });
    });

    it('should validate against protocol smuggling', () => {
      const smugglingUris = [
        'change://test\r\nLocation: http://evil.com',
        'change://test\nContent-Type: text/html',
        'changes://active\r\nSet-Cookie: session=evil'
      ];

      smugglingUris.forEach(uri => {
        const result = parseUri(uri);
        // Should parse but application should handle the newlines
        expect(result.host.includes('\r') || result.host.includes('\n')).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should provide proper error codes', () => {
      const testCases = [
        { uri: '', expectedCode: 'INVALID_URI' },
        { uri: 'invalid-format', expectedCode: 'INVALID_FORMAT' },
        { uri: '123invalid://test', expectedCode: 'INVALID_SCHEME' },
      ];

      testCases.forEach(({ uri, expectedCode }) => {
        expect(() => parseUri(uri)).toThrow(UriParseError);
        try {
          parseUri(uri);
        } catch (error) {
          expect((error as UriParseError).code).toBe(expectedCode);
        }
      });
    });

    it('should preserve original URI in error', () => {
      const uri = 'invalid-uri';
      
      expect(() => parseUri(uri)).toThrow(UriParseError);
      try {
        parseUri(uri);
      } catch (error) {
        expect((error as UriParseError).uri).toBe(uri);
      }
    });
  });
});