# URI Parser Utilities Documentation

## Overview

The URI Parser utilities provide comprehensive parsing and validation for MCP (Model Context Protocol) resource URIs with built-in security features. This module handles the specific URI patterns used in OpenSpec for accessing changes and resources.

## Features

- **URI Parsing**: Parse `changes://active` and `change://[slug]/[file]` patterns
- **Query Parameter Validation**: Validate and sanitize query parameters with configurable rules
- **Path Traversal Protection**: Detect and prevent directory traversal attacks
- **MIME Type Detection**: Automatically detect MIME types from file extensions
- **Security Validation**: Comprehensive security checks with detailed warnings
- **Error Handling**: Structured error reporting with specific error codes

## Installation

```typescript
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
  type ParsedUri,
  type QueryParamRule,
  type UriParserConfig,
} from './src/utils/uri-parser.js';
```

## Core Functions

### `parseUri(uri, config?)`

Parses a URI string into structured components with security validation.

**Parameters:**
- `uri: string` - The URI to parse
- `config?: UriParserConfig` - Optional configuration options

**Returns:** `ParsedUri` - Parsed URI components

**Example:**
```typescript
const parsed = parseUri('changes://active?page=1&pageSize=20');
console.log(parsed.scheme); // 'changes'
console.log(parsed.host); // 'active'
console.log(parsed.queryParams); // { page: '1', pageSize: '20' }
```

### `validateQueryParams(queryParams, rules)`

Validates query parameters against defined rules.

**Parameters:**
- `queryParams: Record<string, string>` - Query parameters to validate
- `rules: Record<string, QueryParamRule>` - Validation rules

**Returns:** `{ isValid: boolean; errors: string[] }`

**Example:**
```typescript
const rules = {
  page: { type: 'number', min: 1, max: 100 },
  status: { allowedValues: ['draft', 'active'] }
};

const validation = validateQueryParams({ page: '1', status: 'draft' }, rules);
console.log(validation.isValid); // true
```

### `isUriSafe(parsedUri, allowWarnings?)`

Checks if a parsed URI is considered safe based on security validation.

**Parameters:**
- `parsedUri: ParsedUri` - Parsed URI to check
- `allowWarnings?: boolean` - Whether to allow URIs with warnings (default: false)

**Returns:** `boolean`

### `buildUri(components)`

Builds a URI string from components.

**Parameters:**
- `components: { scheme: string; host: string; queryParams?: Record<string, string>; fragment?: string }`

**Returns:** `string`

**Example:**
```typescript
const uri = buildUri({
  scheme: 'changes',
  host: 'active',
  queryParams: { page: '1', pageSize: '20' }
});
// Result: 'changes://active?page=1&pageSize=20'
```

## URI Patterns

### changes://active

Used to list active changes with optional pagination and filtering.

**Examples:**
- `changes://active` - List all active changes
- `changes://active?page=1&pageSize=20` - Paginated results
- `changes://active?filter=draft&sort=date` - Filtered and sorted results

**Supported Query Parameters:**
- `page` (number, min: 1, max: 1000) - Page number
- `pageSize` (number, min: 1, max: 100) - Items per page
- `filter` (string, allowed: ['draft', 'active', 'archived', 'all']) - Status filter
- `sort` (string, allowed: ['name', 'date', 'status']) - Sort field
- `search` (string, pattern: /^[a-zA-Z0-9\s\-_.]+$/) - Search term

### change://[slug]/[file]

Used to access specific change resources and files.

**Examples:**
- `change://my-feature` - Change metadata
- `change://my-feature/proposal.md` - Specific file
- `change://my-feature/specs/api.yaml#section` - With fragment

**Security Features:**
- Slug validation using existing `validate_slug()` function
- Path traversal detection and prevention
- File extension sanitization

## Security Features

### Path Traversal Protection

Detects and prevents various path traversal attempts:

```typescript
// These will be flagged as unsafe:
change://../etc/passwd
change://test/../../secret
change://test/~/file
change://test/file.md\0.txt
```

### Slug Validation

Validates change slugs against the established pattern:
- Starts and ends with lowercase letter or digit
- Contains 1-62 characters of lowercase letters, digits, or hyphens
- Total length: 3-64 characters

### Query Parameter Validation

Comprehensive validation rules:
- Type checking (string, number, boolean)
- Range validation for numbers
- Pattern matching with regex
- Allowed values enumeration
- Required parameter enforcement

## MIME Type Detection

Automatic MIME type detection based on file extensions:

| Extension | MIME Type |
|-----------|------------|
| .md | text/markdown |
| .json | application/json |
| .txt | text/plain |
| .html | text/html |
| .yaml/.yml | application/x-yaml |
| .png | image/png |
| .jpg/.jpeg | image/jpeg |
| .svg | image/svg+xml |
| .diff/.patch | text/plain |

Custom MIME types can be added via configuration:

```typescript
const config = {
  customMimeTypes: {
    '.custom': 'application/custom'
  }
};

const parsed = parseUri('change://test/file.custom', config);
console.log(parsed.mimeType); // 'application/custom'
```

## Error Handling

### UriParseError

Custom error class for URI parsing failures:

```typescript
try {
  parseUri('invalid-uri');
} catch (error) {
  if (error instanceof UriParseError) {
    console.log(error.code); // 'INVALID_FORMAT'
    console.log(error.uri); // 'invalid-uri'
    console.log(error.message); // Detailed error message
  }
}
```

### Error Codes

- `INVALID_URI` - Empty or null URI
- `INVALID_FORMAT` - Malformed URI structure
- `INVALID_SCHEME` - Invalid URI scheme
- `TOO_MANY_SEGMENTS` - Exceeds maximum path segments
- `PARAM_TOO_LONG` - Query parameter value too long
- `FRAGMENT_NOT_ALLOWED` - Fragments not permitted

## Configuration

### UriParserConfig

```typescript
interface UriParserConfig {
  maxPathSegments?: number;        // Default: 10
  maxQueryParamLength?: number;    // Default: 1000
  allowFragments?: boolean;        // Default: true
  customMimeTypes?: Record<string, string>;
}
```

### QueryParamRule

```typescript
interface QueryParamRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: string[];
}
```

## Integration Example

### Resource Provider Integration

```typescript
import { BaseResourceProvider } from './base.js';
import { parseUri, validateQueryParams, isUriSafe } from '../../utils/uri-parser.js';

export class MyResourceProvider extends BaseResourceProvider {
  async read(requestedUri?: string): Promise<ResourceContent> {
    const uri = requestedUri || this.definition.uri;
    
    try {
      const parsed = parseUri(uri);
      
      // Security check
      if (!isUriSafe(parsed)) {
        return this.error(
          `Security violations: ${parsed.security.warnings.join(', ')}`
        );
      }

      // Handle different URI types
      if (parsed.scheme === 'changes') {
        return this.handleChanges(parsed);
      } else if (parsed.scheme === 'change') {
        return this.handleChange(parsed);
      }
      
    } catch (error) {
      return this.error(`Failed to parse URI: ${error.message}`);
    }
  }
}
```

## Testing

Comprehensive test suite covering:

- ✅ Basic URI parsing
- ✅ Query parameter handling
- ✅ Security validation
- ✅ Path traversal detection
- ✅ MIME type detection
- ✅ Error handling
- ✅ Edge cases and Unicode support
- ✅ Performance considerations

Run tests with:
```bash
npm test -- test/utils/uri-parser.test.ts
```

## Performance Considerations

- **Efficient Parsing**: Uses regex patterns optimized for common URI formats
- **Lazy Validation**: Security checks only when needed
- **Memory Efficient**: Minimal object creation during parsing
- **Caching**: MIME type mappings are static for fast lookup

## Security Best Practices

1. **Always validate URIs** before processing
2. **Use `isUriSafe()`** to check for security violations
3. **Validate query parameters** with strict rules
4. **Sanitize file paths** before filesystem access
5. **Handle errors gracefully** without exposing internal details

## Migration Guide

### From Manual Parsing

**Before:**
```typescript
const url = new URL(uri.replace('changes://', 'http://localhost/'));
const page = url.searchParams.get('page');
```

**After:**
```typescript
const parsed = parseUri(uri);
const page = parsed.queryParams.page;
// Plus security validation and error handling
```

### Benefits

- ✅ Built-in security validation
- ✅ Consistent error handling
- ✅ Type safety with TypeScript
- ✅ Comprehensive test coverage
- ✅ Performance optimized
- ✅ Extensible configuration

## Future Enhancements

- [ ] Support for additional URI schemes
- [ ] Advanced caching mechanisms
- [ ] Internationalized domain name support
- [ ] Custom validation rule extensions
- [ ] Performance monitoring and metrics