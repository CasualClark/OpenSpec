# Change Structure Validator Implementation Summary

## Overview

Implemented a comprehensive change structure validator utility that ensures OpenSpec changes meet required structural and security standards before archiving. The validator integrates seamlessly with the existing security framework and provides detailed error reporting with specific EBADSHAPE_* error codes.

## Files Created/Modified

### New Files
- `src/stdio/validation/change-structure-validator.ts` - Main validator implementation
- `test/stdio/validation/change-structure-validator.test.ts` - Comprehensive unit tests
- `test/stdio/tools/change-archive-validator-integration.test.ts` - Integration tests with change-archive tool

### Modified Files
- `src/stdio/tools/change-archive.ts` - Integrated validator into archive workflow
- `src/stdio/tools/base.ts` - Fixed `isError` property in success/error methods

## Key Features

### 1. Comprehensive Validation
- **Required Files**: Validates existence of `proposal.md` and `tasks.md`
- **Optional Directories**: Validates `specs/`, `tests/`, `docs/` when present
- **Content Structure**: Validates markdown structure and task list formats
- **Delta Files**: Validates JSON/YAML delta files when present

### 2. Security Integration
- **Path Traversal Protection**: Detects and blocks dangerous path patterns
- **Content Sanitization**: Uses `InputSanitizer` to detect XSS, binary content, and other threats
- **Error Sanitization**: Uses `ErrorSanitizer` for secure error reporting
- **Size Limits**: Enforces configurable file size limits (default: 1MB)

### 3. Detailed Error Reporting
- **Specific Error Codes**: All errors use `EBADSHAPE_*` prefix with one-line hints
- **Severity Levels**: Errors classified as low/medium/high/critical
- **Actionable Hints**: Each error includes specific guidance for resolution
- **Multiple Errors**: Reports all validation failures in a single pass

### 4. Flexible Configuration
- **Custom Rules**: Support for user-defined validation functions
- **Security Controls**: Option to disable security checks for trusted environments
- **Optional Validation**: Configurable validation of optional directories
- **Context Awareness**: Adapts behavior based on validation context (archive/open/validate)

## Error Codes

### File Existence Errors
- `EBADSHAPE_PROPOSAL_MISSING` - proposal.md file is missing
- `EBADSHAPE_TASKS_MISSING` - tasks.md file is missing
- `EBADSHAPE_SPECS_MISSING` - specs/ directory is missing (when required)
- `EBADSHAPE_DIRECTORY_INVALID` - Change path is not a valid directory

### Content Validation Errors
- `EBADSHAPE_PROPOSAL_INVALID` - Proposal structure or content issues
- `EBADSHAPE_TASKS_INVALID` - Tasks structure or format issues
- `EBADSHAPE_SPECS_INVALID` - Specs directory content issues
- `EBADSHAPE_CONTENT_EMPTY` - File is empty
- `EBADSHAPE_CONTENT_BINARY` - Binary content detected in text file
- `EBADSHAPE_TASKS_NO_STRUCTURE` - Tasks have no recognizable list format
- `EBADSHAPE_DELTA_INVALID` - Delta file format or syntax errors

### Security Errors
- `EBADSHAPE_SECURITY_VIOLATION` - Security issues detected (XSS, injection, etc.)
- `EBADSHAPE_PATH_TRAVERSAL` - Path traversal attempts detected
- `EBADSHAPE_SIZE_EXCEEDED` - File exceeds size limits

### System Errors
- `EBADSHAPE_IO_ERROR` - File system I/O errors
- `EBADSHAPE_PERMISSION_DENIED` - Permission/access denied errors
- `EBADSHAPE_UNKNOWN_ERROR` - Unexpected validation errors

## Integration with change-archive Tool

The validator is integrated into the `change-archive` tool workflow:

1. **Pre-Archive Validation**: Runs before any archive operations
2. **Error Reporting**: Returns detailed error messages with hints
3. **Warning Logging**: Logs non-critical issues for informational purposes
4. **Graceful Failure**: Prevents archive operations on invalid changes

```typescript
// Integration example
const structureValidation = await ChangeStructureValidator.validate(canonicalChangeRoot, {
  context: 'tool',
  securityChecks: true,
  validateOptional: true
});

if (!structureValidation.isValid) {
  const errorMessages = structureValidation.errors.map(err => 
    `${err.code}: ${err.message} (${err.hint})`
  ).join('; ');
  return this.error(`Change structure validation failed: ${errorMessages}`);
}
```

## Usage Examples

### Basic Validation
```typescript
import { ChangeStructureValidator } from './stdio/validation/change-structure-validator.js';

const result = await ChangeStructureValidator.validate('/path/to/change');

if (result.isValid) {
  console.log('Change structure is valid');
} else {
  result.errors.forEach(err => {
    console.error(`${err.code}: ${err.message}`);
    console.log(`Hint: ${err.hint}`);
  });
}
```

### Custom Validation Rules
```typescript
const customRule = (content: string, filePath: string) => {
  if (content.includes('TODO:')) {
    return [{
      code: 'CUSTOM_TODO_FOUND',
      message: 'TODO comments found in final content',
      path: filePath,
      hint: 'Remove TODO comments before archiving',
      severity: 'medium'
    }];
  }
  return [];
};

const result = await ChangeStructureValidator.validate('/path/to/change', {
  customRules: [customRule]
});
```

### Security-Disabled Validation
```typescript
const result = await ChangeStructureValidator.validate('/path/to/change', {
  securityChecks: false,
  validateOptional: false
});
```

## Testing

### Unit Tests
- **24 comprehensive test cases** covering all validation scenarios
- **Security validation** tests for XSS, binary content, path traversal
- **Edge case handling** for malformed inputs and system errors
- **Performance tests** for large files and many files

### Integration Tests
- **15 integration tests** with change-archive tool
- **End-to-end validation** of archive workflow
- **Error message formatting** verification
- **Security integration** testing

### Demo Script
Run `node demo-validator.mjs` to see the validator in action with:
- Valid change structure
- Missing required files
- Security violations
- Empty files
- Custom validation rules

## Performance Characteristics

- **Efficient**: Single-pass validation with minimal I/O operations
- **Scalable**: Handles large changes (100+ files) efficiently
- **Memory-conscious**: Streams large files and respects size limits
- **Configurable**: Adjustable limits and validation scope

## Security Considerations

- **Defense in Depth**: Multiple layers of security validation
- **Fail-Safe**: Rejects ambiguous inputs rather than risking security issues
- **Information Disclosure**: Sanitized error messages prevent sensitive data leakage
- **Path Security**: Robust traversal protection for all file operations

## Future Enhancements

1. **Schema Validation**: Add JSON schema validation for structured files
2. **Custom Templates**: Support for project-specific validation templates
3. **Parallel Validation**: Optimize with concurrent file processing
4. **Caching**: Cache validation results for unchanged files
5. **Plugin System**: Extensible validation plugin architecture

## Conclusion

The Change Structure Validator provides robust, secure, and comprehensive validation of OpenSpec changes before archiving. It integrates seamlessly with existing security infrastructure, provides actionable error reporting, and maintains high performance for large-scale usage.

The validator successfully prevents malformed or malicious changes from being archived while providing clear guidance for developers to resolve validation issues.