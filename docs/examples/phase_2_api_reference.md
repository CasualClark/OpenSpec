# Phase 2 API Reference

_Enhanced compute_receipt(), Structural Validator, and Error Handling_

Last updated: 2025-10-24

## Table of Contents

1. [Enhanced compute_receipt() API](#enhanced-compute_receipt-api)
2. [Change Structure Validator API](#change-structure-validator-api)
3. [Error Code Reference](#error-code-reference)
4. [Integration Examples](#integration-examples)
5. [Migration Guide from Phase 1](#migration-guide-from-phase-1)

---

## Enhanced compute_receipt() API

The enhanced `compute_receipt()` function generates comprehensive receipts for archived changes with git integration, test results, and tool version tracking.

### Function Signature

```typescript
private async computeReceipt(changeRoot: string, slug: string): Promise<Receipt>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `changeRoot` | `string` | Absolute path to the change directory |
| `slug` | `string` | Change slug identifier |

### Return Type

```typescript
interface Receipt {
  slug: string;                    // Change identifier
  commits: string[];               // Git commit hashes related to change
  gitRange?: string;               // Git range descriptor (e.g., "last-5")
  filesTouched: string[];          // List of files modified by change
  tests: {                         // Test results summary
    added: number;                 // Number of new test files
    updated: number;               // Number of modified test files
    passed: boolean;               // Whether tests passed
  };
  archivedAt: string;              // ISO timestamp of archive operation
  actor: {                         // Actor information
    type: 'process';               // Actor type
    name: string;                  // Process identifier (pid-hostname)
    model: 'task-mcp-server';      // Model identifier
  };
  toolVersions: Record<string, string>; // Tool version mapping
}
```

### Key Features

#### 1. Git Integration

The receipt automatically collects git information:

```typescript
// Git commits related to the change
const commits = await execFileAsync('git', ['log', '--oneline', '--max-count=10', '--', changeRoot]);

// Git range for commit tracking
const commitCount = await execFileAsync('git', ['rev-list', '--count', 'HEAD', '--', changeRoot]);
const gitRange = commitCount > 0 ? `last-${commitCount}` : undefined;

// Files touched by the change
const filesTouched = await execFileAsync('git', ['ls-files', changeRoot]);
```

#### 2. Test Framework Integration

Real test results from the project's test framework:

```typescript
// Run test coverage to get comprehensive test data
const { stdout } = await execFileAsync('pnpm', ['run', 'test:coverage', '--', '--reporter=json']);

// Check if tests pass
await execFileAsync('pnpm', ['run', 'test', '--', '--run', '--reporter=basic']);

// Count test files added/modified
const testFiles = await this.countTestFiles(changeRoot);
```

#### 3. Tool Version Detection

Automatic detection of tool versions:

```typescript
const toolVersions = {
  taskMcp: process.env.TASK_MCP_VERSION || '1.0.0',
  openspecCli: await this.getOpenSpecVersion(),
  'change.archive': '1.0.0'
};
```

#### 4. Error Resilience

Graceful handling of external tool failures:

```typescript
try {
  // Git operations
  const commits = await execFileAsync('git', ['log', ...]);
} catch (gitError) {
  this.logger('warn', `Git operations failed: ${gitError.message}`);
  // Continue with empty data - don't fail the archive operation
  commits = [];
}
```

### Usage Example

```typescript
// In change-archive tool
const receipt = await this.computeReceipt(canonicalChangeRoot, input.slug);

// Write receipt to file
await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));

// Return in tool response
return this.success(`Archive completed. Receipt: ${JSON.stringify(receipt, null, 2)}`);
```

---

## Change Structure Validator API

The `ChangeStructureValidator` provides comprehensive validation of OpenSpec change structure with security integration and detailed error reporting.

### Class Definition

```typescript
export class ChangeStructureValidator {
  static async validate(
    changePath: string,
    options?: ChangeStructureValidationOptions
  ): Promise<ChangeStructureValidationResult>
  
  static getErrorHint(errorCode: ChangeStructureErrorCode): string
}
```

### Validation Options

```typescript
interface ChangeStructureValidationOptions {
  maxFileSize?: number;           // Maximum file size (default: 1MB)
  validateOptional?: boolean;     // Validate optional directories (default: true)
  securityChecks?: boolean;       // Perform security checks (default: true)
  customRules?: Array<(content: string, filePath: string) => ChangeStructureValidationError[]>;
  context?: 'tool' | 'resource' | 'cli' | 'server' | 'core';
}
```

### Validation Result

```typescript
interface ChangeStructureValidationResult {
  isValid: boolean;               // Overall validation status
  errors: ChangeStructureValidationError[];  // Critical validation errors
  warnings: ChangeStructureValidationError[]; // Non-critical issues
  summary: {                     // Validation summary
    totalFiles: number;
    validFiles: number;
    requiredFiles: string[];
    optionalFiles: string[];
  };
}
```

### Error Structure

```typescript
interface ChangeStructureValidationError {
  code: ChangeStructureErrorCode;  // Error code identifier
  message: string;                  // Human-readable error message
  path?: string;                    // File path where error occurred
  hint: string;                     // Actionable hint for resolution
  severity: 'low' | 'medium' | 'high' | 'critical';
}
```

### Required Files Validation

The validator ensures these required files exist:

```typescript
private static readonly REQUIRED_FILES = ['proposal.md', 'tasks.md'];

// Validation logic
for (const file of REQUIRED_FILES) {
  const filePath = path.join(changePath, file);
  try {
    await fs.access(filePath);
    // Validate content structure
    await this.validateFileContent(filePath, file);
  } catch (error) {
    errors.push({
      code: file === 'proposal.md' ? 
        ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_MISSING : 
        ChangeStructureErrorCode.EBADSHAPE_TASKS_MISSING,
      message: `Required file missing: ${file}`,
      path: filePath,
      hint: `Create ${file} with appropriate content`,
      severity: 'critical'
    });
  }
}
```

### Optional Directory Validation

When `validateOptional: true`, validates these directories:

```typescript
private static readonly OPTIONAL_DIRECTORIES = ['specs', 'tests', 'docs'];

// Optional validation with warnings instead of errors
if (options.validateOptional) {
  for (const dir of OPTIONAL_DIRECTORIES) {
    const dirPath = path.join(changePath, dir);
    // Check existence and validate structure
  }
}
```

### Security Integration

Built-in security checks using existing security framework:

```typescript
// Path traversal protection
const realTargetPath = await fs.realpath(resolvedTarget);
const realBasePath = await fs.realpath(resolvedBase);
if (!realTargetPath.startsWith(realBasePath)) {
  errors.push({
    code: ChangeStructureErrorCode.EBADSHAPE_PATH_TRAVERSAL,
    message: 'Path traversal detected',
    hint: 'Use safe file paths without traversal',
    severity: 'critical'
  });
}

// Content sanitization
const sanitized = InputSanitizer.sanitize(content, {
  maxLength: options.maxFileSize,
  allowedChars: /^[\s\S]*$/  // Allow all content for analysis
});

if (!sanitized.isSafe) {
  errors.push({
    code: ChangeStructureErrorCode.EBADSHAPE_SECURITY_VIOLATION,
    message: 'Security issues detected in content',
    hint: 'Remove or sanitize security-sensitive content',
    severity: 'critical'
  });
}
```

### Custom Validation Rules

Extensible validation with custom rules:

```typescript
const customRule = (content: string, filePath: string) => {
  const errors: ChangeStructureValidationError[] = [];
  
  // Example: Check for TODO comments in final content
  if (content.includes('TODO:') && filePath.endsWith('.md')) {
    errors.push({
      code: 'CUSTOM_TODO_FOUND',
      message: 'TODO comments found in final content',
      path: filePath,
      hint: 'Remove TODO comments before archiving',
      severity: 'medium'
    });
  }
  
  return errors;
};

const result = await ChangeStructureValidator.validate('/path/to/change', {
  customRules: [customRule]
});
```

### Usage Examples

#### Basic Validation

```typescript
import { ChangeStructureValidator } from './stdio/validation/change-structure-validator.js';

const result = await ChangeStructureValidator.validate('/path/to/change');

if (result.isValid) {
  console.log('Change structure is valid');
} else {
  console.error('Validation failed:');
  result.errors.forEach(err => {
    console.error(`${err.code}: ${err.message}`);
    console.log(`Hint: ${err.hint}`);
  });
}
```

#### Integration with change-archive Tool

```typescript
// In change-archive tool execution
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

// Log warnings for informational purposes
if (structureValidation.warnings.length > 0) {
  const warningMessages = structureValidation.warnings.map(w => 
    `${w.code}: ${w.message}`
  ).join('; ');
  
  this.logger('warn', `Validation warnings: ${warningMessages}`);
}
```

---

## Error Code Reference

Comprehensive error codes for change structure validation and archive operations.

### EBADSHAPE_* Error Codes

#### File Existence Errors

| Error Code | Severity | Message | Hint |
|------------|----------|---------|------|
| `EBADSHAPE_PROPOSAL_MISSING` | critical | proposal.md file is missing | Create proposal.md with change description and rationale |
| `EBADSHAPE_TASKS_MISSING` | critical | tasks.md file is missing | Create tasks.md with implementation tasks |
| `EBADSHAPE_SPECS_MISSING` | high | specs/ directory is missing | Create specs/ directory with specification files |
| `EBADSHAPE_DIRECTORY_INVALID` | critical | Change path is not a valid directory | Ensure path points to a valid directory |

#### Content Validation Errors

| Error Code | Severity | Message | Hint |
|------------|----------|---------|------|
| `EBADSHAPE_PROPOSAL_INVALID` | medium | Proposal structure or content issues | Fix proposal structure and content |
| `EBADSHAPE_TASKS_INVALID` | medium | Tasks structure or format issues | Fix tasks structure and ensure proper format |
| `EBADSHAPE_SPECS_INVALID` | low | Specs directory content issues | Fix specs directory structure and content |
| `EBADSHAPE_CONTENT_EMPTY` | medium | File is empty | Add meaningful content to the file |
| `EBADSHAPE_CONTENT_BINARY` | high | Binary content detected in text file | Ensure file contains valid text content |
| `EBADSHAPE_TASKS_NO_STRUCTURE` | medium | Tasks have no recognizable list format | Add tasks in proper markdown list format |
| `EBADSHAPE_DELTA_INVALID` | medium | Delta file format or syntax errors | Fix delta file format and syntax |

#### Security Errors

| Error Code | Severity | Message | Hint |
|------------|----------|---------|------|
| `EBADSHAPE_SECURITY_VIOLATION` | critical | Security issues detected (XSS, injection, etc.) | Remove or sanitize security-sensitive content |
| `EBADSHAPE_PATH_TRAVERSAL` | critical | Path traversal attempts detected | Use safe file paths without traversal |
| `EBADSHAPE_SIZE_EXCEEDED` | high | File exceeds size limits | Reduce file size or increase limits |

#### System Errors

| Error Code | Severity | Message | Hint |
|------------|----------|---------|------|
| `EBADSHAPE_IO_ERROR` | high | File system I/O errors | Check file system permissions and disk space |
| `EBADSHAPE_PERMISSION_DENIED` | high | Permission/access denied errors | Check file permissions and user access |
| `EBADSHAPE_UNKNOWN_ERROR` | medium | Unexpected validation errors | Report issue with system details |

### EARCHIVED Error Codes

#### Archive Operation Errors

| Error Code | Severity | Message | Hint |
|------------|----------|---------|------|
| `EARCHIVED_ALREADY_ARCHIVED` | low | Change is already archived | Use existing receipt or specify different change |
| `EARCHIVED_LOCK_FAILED` | high | Failed to acquire change lock | Check if change is being processed by another process |
| `EARCHIVED_VALIDATION_FAILED` | high | Change structure validation failed | Fix validation errors before archiving |
| `EARCHIVED_COMMAND_FAILED` | critical | Archive command execution failed | Check OpenSpec CLI installation and configuration |
| `EARCHIVED_RECEIPT_FAILED` | medium | Failed to generate receipt | Check git repository status and permissions |

### Error Handling Patterns

#### Structured Error Responses

```typescript
// Tool error response with structured error information
return this.error(`Change structure validation failed: ${errorMessages}`);

// Error with context and sanitization
const sanitized = ErrorSanitizer.sanitize(error, {
  context: 'tool',
  userType: 'user',
  logDetails: true
});
return this.error(sanitized.message);
```

#### Error Recovery Strategies

```typescript
// Graceful degradation for non-critical errors
try {
  const receipt = await this.computeReceipt(changeRoot, slug);
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));
} catch (receiptError) {
  this.logger('warn', `Receipt generation failed: ${receiptError.message}`);
  // Don't fail the archive operation - receipt is informational
}

// Continue with default values when external tools fail
let commits: string[] = [];
try {
  commits = await this.getGitCommits(changeRoot);
} catch (gitError) {
  this.logger('warn', `Git operations failed: ${gitError.message}`);
  commits = []; // Continue with empty data
}
```

### Troubleshooting Guide

#### Common EBADSHAPE_* Issues

1. **Missing Required Files**
   ```
   EBADSHAPE_PROPOSAL_MISSING: proposal.md file is missing
   ```
   **Solution**: Create `proposal.md` with change description
   ```bash
   echo "# Change Proposal\n\nDescribe your change here" > openspec/changes/your-slug/proposal.md
   ```

2. **Security Violations**
   ```
   EBADSHAPE_SECURITY_VIOLATION: Security issues detected in content
   ```
   **Solution**: Remove or sanitize problematic content
   ```bash
   # Check for XSS patterns
   grep -r "<script" openspec/changes/your-slug/
   # Remove or escape HTML content
   ```

3. **Path Traversal Attempts**
   ```
   EBADSHAPE_PATH_TRAVERSAL: Path traversal detected
   ```
   **Solution**: Use proper file paths without `../` sequences

#### Common EARCHIVED_* Issues

1. **Already Archived**
   ```
   EARCHIVED_ALREADY_ARCHIVED: Change is already archived
   ```
   **Solution**: Check existing receipt or use different slug
   ```bash
   cat openspec/changes/your-slug/receipt.json
   ```

2. **Lock Failed**
   ```
   EARCHIVED_LOCK_FAILED: Failed to acquire change lock
   ```
   **Solution**: Wait for other process or remove stale lock
   ```bash
   # Check lock status
   cat openspec/changes/your-slug/.lock
   # Remove stale lock if needed
   rm openspec/changes/your-slug/.lock
   ```

3. **Validation Failed**
   ```
   EARCHIVED_VALIDATION_FAILED: Change structure validation failed
   ```
   **Solution**: Fix all validation errors before archiving
   ```bash
   # Run validation manually
   openspec validate your-slug
   ```

---

## Integration Examples

### 1. CLI Integration

#### Basic Archive with Validation

```bash
# Archive a change with automatic validation
openspec archive add-user-authentication

# Output includes receipt information
Archive completed successfully.
Receipt:
{
  "slug": "add-user-authentication",
  "commits": ["abc123", "def456"],
  "filesTouched": ["src/auth/user.ts", "test/auth.test.ts"],
  "tests": {
    "added": 2,
    "updated": 1,
    "passed": true
  },
  "archivedAt": "2025-10-24T10:30:00.000Z",
  "actor": {
    "type": "process",
    "name": "pid-12345@hostname",
    "model": "task-mcp-server"
  },
  "toolVersions": {
    "taskMcp": "2.1.0",
    "openspecCli": "0.13.0",
    "change.archive": "1.0.0"
  }
}
```

#### Validation-Only Mode

```bash
# Validate change structure without archiving
openspec validate add-user-authentication

# Output shows validation results
Validation Results:
✓ proposal.md exists and is valid
✓ tasks.md exists and is valid
✓ specs/ directory structure is correct
⚠ No tests/ directory found (optional)
⚠ TODO comments found in proposal.md

Overall Status: VALID (with warnings)
```

### 2. Task MCP Integration

#### change.archive Tool Call

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "change.archive",
    "arguments": {
      "slug": "add-user-authentication"
    }
  }
}
```

#### Success Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Successfully archived change \"add-user-authentication\".\n\nArchive Details:\n- API Version: 1.0\n- Slug: add-user-authentication\n- Archived: true\n- Already Archived: false\n- Receipt Path: openspec/changes/add-user-authentication/receipt.json\n\nReceipt Summary:\n- Commits: 2\n- Files Touched: 3\n- Tests Added: 2\n- Tests Updated: 1\n- Tests Passed: true\n- Archived At: 2025-10-24T10:30:00.000Z"
      }
    ],
    "isError": false
  }
}
```

#### Error Response with Validation Details

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Change structure validation failed: EBADSHAPE_PROPOSAL_MISSING: proposal.md file is missing (Create proposal.md with change description and rationale); EBADSHAPE_TASKS_MISSING: tasks.md file is missing (Create tasks.md with implementation tasks)"
      }
    ],
    "isError": true
  }
}
```

### 3. Resource Provider Integration

#### Receipt Resource Access

```typescript
// Access receipt via resource provider
const receiptResource = await resources.read({
  uri: "receipt://add-user-authentication"
});

const receipt = JSON.parse(receiptResource.contents[0].text);
console.log(`Change archived at: ${receipt.archivedAt}`);
console.log(`Tests passed: ${receipt.tests.passed}`);
```

#### Change Status with Receipt Information

```typescript
// Changes collection includes receipt status
const changesResource = await resources.read({
  uri: "changes://active"
});

const changes = JSON.parse(changesResource.contents[0].text);
const archivedChanges = changes.changes.filter(change => change.hasReceipt);

console.log(`Archived changes: ${archivedChanges.length}`);
```

### 4. Custom Integration Scripts

#### Batch Archive Script

```typescript
#!/usr/bin/env node

import { ChangeArchiveTool } from './src/stdio/tools/change-archive.js';
import { createSecurityContext } from './src/stdio/factory.js';

async function batchArchive(slugs: string[]) {
  const security = createSecurityContext(process.cwd());
  const tool = new ChangeArchiveTool(security, console.log);
  
  for (const slug of slugs) {
    try {
      console.log(`Archiving ${slug}...`);
      const result = await tool.execute({ slug });
      
      if (result.isError) {
        console.error(`Failed to archive ${slug}: ${result.content[0].text}`);
      } else {
        console.log(`✓ Archived ${slug}`);
      }
    } catch (error) {
      console.error(`Error archiving ${slug}:`, error.message);
    }
  }
}

// Usage: node batch-archive.js slug1 slug2 slug3
batchArchive(process.argv.slice(2));
```

#### Validation Report Generator

```typescript
#!/usr/bin/env node

import { ChangeStructureValidator } from './src/stdio/validation/change-structure-validator.js';
import { promises as fs } from 'fs';

async function generateValidationReport(changeDir: string) {
  const changes = await fs.readdir(changeDir);
  const report = {
    total: changes.length,
    valid: 0,
    invalid: 0,
    errors: [] as any[],
    warnings: [] as any[]
  };

  for (const slug of changes) {
    const changePath = `${changeDir}/${slug}`;
    const stat = await fs.stat(changePath);
    
    if (!stat.isDirectory()) continue;

    const result = await ChangeStructureValidator.validate(changePath);
    
    if (result.isValid) {
      report.valid++;
    } else {
      report.invalid++;
      report.errors.push(...result.errors.map(err => ({ ...err, slug })));
    }
    
    report.warnings.push(...result.warnings.map(err => ({ ...err, slug })));
  }

  console.log(`Validation Report for ${changeDir}`);
  console.log(`Total changes: ${report.total}`);
  console.log(`Valid: ${report.valid}`);
  console.log(`Invalid: ${report.invalid}`);
  
  if (report.errors.length > 0) {
    console.log('\nErrors:');
    report.errors.forEach(err => {
      console.log(`  ${err.slug}: ${err.code} - ${err.message}`);
    });
  }
  
  if (report.warnings.length > 0) {
    console.log('\nWarnings:');
    report.warnings.forEach(warn => {
      console.log(`  ${warn.slug}: ${warn.code} - ${warn.message}`);
    });
  }
}

generateValidationReport('openspec/changes');
```

### 5. IDE Integration

#### VS Code Extension Integration

```typescript
// VS Code command for change validation
vscode.commands.registerCommand('openspec.validateChange', async () => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;
  
  const changePath = path.join(workspaceFolder.uri.fsPath, 'openspec/changes');
  const result = await ChangeStructureValidator.validate(changePath);
  
  if (result.isValid) {
    vscode.window.showInformationMessage('Change structure is valid');
  } else {
    const errorMessage = result.errors.map(err => err.message).join('\n');
    vscode.window.showErrorMessage(`Validation failed:\n${errorMessage}`);
  }
});

// VS Code command for archive with receipt
vscode.commands.registerCommand('openspec.archiveChange', async () => {
  const slug = await vscode.window.showInputBox({
    prompt: 'Enter change slug to archive'
  });
  
  if (!slug) return;
  
  // Call change.archive tool via MCP client
  const result = await mcpClient.call('change.archive', { slug });
  
  if (result.isError) {
    vscode.window.showErrorMessage(result.content[0].text);
  } else {
    vscode.window.showInformationMessage(`Successfully archived ${slug}`);
    
    // Show receipt details
    const receiptMatch = result.content[0].text.match(/Receipt Summary:[\s\S]*?(?=\n\n|$)/);
    if (receiptMatch) {
      vscode.window.showInformationMessage(receiptMatch[0]);
    }
  }
});
```

---

## Migration Guide from Phase 1

### Overview

Phase 2 introduces enhanced receipt generation, structural validation, and comprehensive error handling. This guide helps you migrate from Phase 1 to Phase 2 seamlessly.

### Breaking Changes

#### 1. Enhanced Receipt Schema

**Phase 1 Receipt:**
```json
{
  "slug": "feature-name",
  "archivedAt": "2025-10-24T10:00:00.000Z",
  "toolVersions": {
    "change.archive": "1.0.0"
  }
}
```

**Phase 2 Receipt:**
```json
{
  "slug": "feature-name",
  "commits": ["abc123", "def456"],
  "gitRange": "last-2",
  "filesTouched": ["src/feature.ts", "test/feature.test.ts"],
  "tests": {
    "added": 1,
    "updated": 0,
    "passed": true
  },
  "archivedAt": "2025-10-24T10:00:00.000Z",
  "actor": {
    "type": "process",
    "name": "pid-12345@hostname",
    "model": "task-mcp-server"
  },
  "toolVersions": {
    "taskMcp": "2.1.0",
    "openspecCli": "0.13.0",
    "change.archive": "1.0.0"
  }
}
```

**Migration Impact:**
- Existing receipt files remain compatible
- New receipts include additional fields
- Client code should handle optional fields gracefully

#### 2. Required Structure Validation

**Phase 1:** Basic file existence checks
**Phase 2:** Comprehensive structure validation with security checks

**Migration Impact:**
- Changes that passed Phase 1 validation might fail Phase 2
- Additional security checks may block previously allowed content
- New error codes provide better debugging information

### Migration Steps

#### Step 1: Update Dependencies

```bash
# Update to Phase 2 compatible versions
npm install @openspec/task-mcp@^2.0.0
npm install @openspec/openspec-cli@^0.13.0
```

#### Step 2: Update Tool Configuration

**Phase 1 Configuration:**
```typescript
const tool = new ChangeArchiveTool(security, logger);
```

**Phase 2 Configuration:**
```typescript
const tool = new ChangeArchiveTool(security, logger);
// No configuration changes needed - enhanced features are automatic
```

#### Step 3: Update Error Handling

**Phase 1 Error Handling:**
```typescript
const result = await tool.execute({ slug });
if (result.isError) {
  console.error('Archive failed:', result.content[0].text);
}
```

**Phase 2 Error Handling:**
```typescript
const result = await tool.execute({ slug });
if (result.isError) {
  // Parse structured error information
  const errorText = result.content[0].text;
  
  if (errorText.includes('EBADSHAPE_')) {
    // Handle structure validation errors
    const errorCode = errorText.match(/(EBADSHAPE_[A-Z_]+)/)?.[1];
    const hint = ChangeStructureValidator.getErrorHint(errorCode);
    console.error(`Validation failed: ${errorCode}`);
    console.log(`Hint: ${hint}`);
  } else if (errorText.includes('EARCHIVED_')) {
    // Handle archive operation errors
    console.error('Archive operation failed:', errorText);
  } else {
    console.error('General error:', errorText);
  }
}
```

#### Step 4: Update Receipt Processing

**Phase 1 Receipt Processing:**
```typescript
interface Phase1Receipt {
  slug: string;
  archivedAt: string;
  toolVersions: Record<string, string>;
}
```

**Phase 2 Receipt Processing:**
```typescript
interface Phase2Receipt {
  slug: string;
  commits?: string[];
  gitRange?: string;
  filesTouched?: string[];
  tests?: {
    added: number;
    updated: number;
    passed: boolean;
  };
  archivedAt: string;
  actor?: {
    type: string;
    name: string;
    model: string;
  };
  toolVersions: Record<string, string>;
}

// Backward compatible processing
function processReceipt(receipt: Phase1Receipt | Phase2Receipt) {
  // Common fields (Phase 1 compatible)
  console.log(`Change: ${receipt.slug}`);
  console.log(`Archived: ${receipt.archivedAt}`);
  
  // Phase 2 enhanced fields (with fallbacks)
  if ('commits' in receipt) {
    console.log(`Commits: ${receipt.commits?.length || 0}`);
  }
  
  if ('tests' in receipt) {
    console.log(`Tests passed: ${receipt.tests?.passed ?? 'unknown'}`);
  }
  
  if ('actor' in receipt) {
    console.log(`Archived by: ${receipt.actor?.name}`);
  }
}
```

#### Step 5: Validate Existing Changes

Run validation on existing changes to identify migration issues:

```bash
# Validate all existing changes
for slug in $(ls openspec/changes); do
  echo "Validating $slug..."
  openspec validate "$slug"
done

# Or use batch validation script
node scripts/validate-all-changes.js
```

### Backward Compatibility

#### Receipt Compatibility

- **Reading**: Phase 2 can read Phase 1 receipts
- **Writing**: Phase 2 always writes enhanced receipts
- **Validation**: Existing receipts are not revalidated unless modified

#### API Compatibility

- **Tool Names**: Unchanged (`change.open`, `change.archive`)
- **Input Schemas**: Backward compatible
- **Output Formats**: Enhanced but backward compatible

#### Error Code Compatibility

- **New Codes**: All new codes use `EBADSHAPE_*` or `EARCHIVED_*` prefixes
- **Existing Codes**: No changes to existing error codes
- **Error Messages**: Enhanced with actionable hints

### Testing Migration

#### 1. Test Existing Workflows

```typescript
// Test that existing Phase 1 workflows still work
describe('Phase 1 Compatibility', () => {
  it('should archive changes created in Phase 1', async () => {
    // Use a change created with Phase 1 tools
    const result = await tool.execute({ slug: 'phase1-change' });
    expect(result.isError).toBe(false);
    
    // Verify enhanced receipt is generated
    const receipt = JSON.parse(
      await fs.readFile('openspec/changes/phase1-change/receipt.json', 'utf-8')
    );
    
    expect(receipt).toHaveProperty('commits');
    expect(receipt).toHaveProperty('tests');
    expect(receipt).toHaveProperty('actor');
  });
});
```

#### 2. Test Error Handling

```typescript
describe('Enhanced Error Handling', () => {
  it('should provide structured error information', async () => {
    const result = await tool.execute({ slug: 'invalid-change' });
    expect(result.isError).toBe(true);
    
    const errorText = result.content[0].text;
    expect(errorText).toMatch(/EBADSHAPE_[A-Z_]+/);
    
    // Extract error code for programmatic handling
    const errorCode = errorText.match(/(EBADSHAPE_[A-Z_]+)/)?.[1];
    expect(errorCode).toBeDefined();
    
    // Verify hint is available
    const hint = ChangeStructureValidator.getErrorHint(errorCode);
    expect(hint).toBeDefined();
  });
});
```

#### 3. Test Performance

```typescript
describe('Performance Impact', () => {
  it('should maintain acceptable performance', async () => {
    const start = Date.now();
    
    const result = await tool.execute({ slug: 'test-change' });
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    expect(result.isError).toBe(false);
  });
});
```

### Rollback Plan

If migration issues arise:

#### 1. Temporary Rollback

```bash
# Use Phase 1 tools temporarily
npm install @openspec/task-mcp@1.0.0
npm install @openspec/openspec-cli@0.12.0

# Continue work while fixing issues
openspec archive change-slug  # Uses Phase 1 behavior
```

#### 2. Gradual Migration

```typescript
// Implement feature flag for gradual migration
const usePhase2Validation = process.env.USE_PHASE2_VALIDATION !== 'false';

if (usePhase2Validation) {
  // Use Phase 2 enhanced validation
  const result = await ChangeStructureValidator.validate(changePath, {
    securityChecks: true,
    validateOptional: true
  });
} else {
  // Fall back to Phase 1 basic validation
  const result = await basicValidation(changePath);
}
```

#### 3. Data Migration

```typescript
// Migrate existing receipts to enhanced format
async function migrateReceipts() {
  const changes = await fs.readdir('openspec/changes');
  
  for (const slug of changes) {
    const receiptPath = `openspec/changes/${slug}/receipt.json`;
    
    try {
      const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf-8'));
      
      // Check if receipt needs migration
      if (!receipt.commits && !receipt.tests) {
        console.log(`Migrating receipt for ${slug}...`);
        
        // Generate enhanced receipt
        const enhancedReceipt = await computeReceipt(`openspec/changes/${slug}`, slug);
        
        // Preserve original archivedAt if present
        if (receipt.archivedAt) {
          enhancedReceipt.archivedAt = receipt.archivedAt;
        }
        
        // Write enhanced receipt
        await fs.writeFile(receiptPath, JSON.stringify(enhancedReceipt, null, 2));
        
        console.log(`✓ Migrated ${slug}`);
      }
    } catch (error) {
      console.error(`Failed to migrate ${slug}:`, error.message);
    }
  }
}
```

### Support and Troubleshooting

#### Common Migration Issues

1. **Validation Failures**
   - **Issue**: Changes that passed Phase 1 validation fail Phase 2
   - **Solution**: Address specific validation errors using the provided hints

2. **Performance Impact**
   - **Issue**: Slower archive operations due to enhanced validation
   - **Solution**: Optimize change structure or disable optional validation

3. **Error Code Changes**
   - **Issue**: Client code doesn't handle new error codes
   - **Solution**: Update error handling to use structured error information

#### Getting Help

- **Documentation**: Refer to this API reference and error code guide
- **Examples**: Check integration examples for common patterns
- **Issues**: Report migration problems with detailed error information
- **Community**: Join discussions for migration best practices

---

*API Reference completed: 2025-10-24*  
*Next Review: After Phase 3 implementation*