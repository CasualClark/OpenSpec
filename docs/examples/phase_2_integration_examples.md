# Phase 2 Integration Examples

_Practical examples for developers integrating with enhanced receipt generation, structural validation, and error handling_

Last updated: 2025-10-24

## Table of Contents

1. [Quick Start Examples](#quick-start-examples)
2. [CLI Integration Patterns](#cli-integration-patterns)
3. [Task MCP Integration](#task-mcp-integration)
4. [Custom Tool Development](#custom-tool-development)
5. [CI/CD Integration](#cicd-integration)
6. [IDE Plugin Development](#ide-plugin-development)
7. [Monitoring and Observability](#monitoring-and-observability)

---

## Quick Start Examples

### Basic Archive with Receipt

```bash
# Archive a change and get enhanced receipt
openspec archive add-user-authentication

# View the generated receipt
cat openspec/changes/add-user-authentication/receipt.json

# Check validation status before archiving
openspec validate add-user-authentication
```

### Programmatic Usage

```typescript
import { ChangeArchiveTool } from '@openspec/task-mcp';
import { createSecurityContext } from '@openspec/task-mcp';

async function archiveChange(slug: string) {
  const security = createSecurityContext(process.cwd());
  const tool = new ChangeArchiveTool(security, console.log);
  
  const result = await tool.execute({ slug });
  
  if (result.isError) {
    // Handle validation errors
    if (result.content[0].text.includes('EBADSHAPE_')) {
      console.error('Structure validation failed');
      // Extract specific error for programmatic handling
    }
    return null;
  }
  
  // Extract receipt from success response
  const receiptMatch = result.content[0].text.match(/Receipt Summary:[\s\S]*?(?=\n\n|$)/);
  return receiptMatch ? receiptMatch[0] : null;
}
```

---

## CLI Integration Patterns

### 1. Pre-commit Hook Integration

```bash
#!/bin/sh
# .git/hooks/pre-commit

# Validate all staged changes
STAGED_CHANGES=$(git diff --cached --name-only --diff-filter=ACM | grep "openspec/changes/")

if [ -n "$STAGED_CHANGES" ]; then
  echo "Validating OpenSpec changes..."
  
  for change_path in $STAGED_CHANGES; do
    if [ -d "$change_path" ]; then
      slug=$(basename "$change_path")
      echo "Validating $slug..."
      
      if ! openspec validate "$slug"; then
        echo "Validation failed for $slug. Commit aborted."
        exit 1
      fi
    fi
  done
  
  echo "All changes validated successfully."
fi

exit 0
```

### 2. Release Automation Script

```typescript
#!/usr/bin/env node
// scripts/release-changes.js

import { execSync } from 'child_process';
import { ChangeArchiveTool } from '../src/stdio/tools/change-archive.js';
import { createSecurityContext } from '../src/stdio/factory.js';

async function releaseReadyChanges() {
  const security = createSecurityContext(process.cwd());
  const tool = new ChangeArchiveTool(security, console.log);
  
  // Get all active changes
  const changes = execSync('openspec list --active', { encoding: 'utf-8' });
  const changeList = JSON.parse(changes);
  
  const results = [];
  
  for (const change of changeList.changes) {
    if (change.status === 'complete') {
      console.log(`Archiving ${change.slug}...`);
      
      try {
        const result = await tool.execute({ slug: change.slug });
        
        if (!result.isError) {
          results.push({
            slug: change.slug,
            status: 'archived',
            receipt: extractReceipt(result.content[0].text)
          });
        } else {
          results.push({
            slug: change.slug,
            status: 'failed',
            error: result.content[0].text
          });
        }
      } catch (error) {
        results.push({
          slug: change.slug,
          status: 'error',
          error: error.message
        });
      }
    }
  }
  
  // Generate release report
  console.log('\nRelease Summary:');
  results.forEach(result => {
    console.log(`${result.slug}: ${result.status}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  });
  
  return results;
}

function extractReceipt(responseText) {
  const receiptMatch = responseText.match(/\{[\s\S]*\}/);
  return receiptMatch ? JSON.parse(receiptMatch[0]) : null;
}

releaseReadyChanges().catch(console.error);
```

### 3. Batch Validation Tool

```typescript
#!/usr/bin/env node
// scripts/validate-all.js

import { ChangeStructureValidator } from '../src/stdio/validation/change-structure-validator.js';
import { promises as fs } from 'fs';
import path from 'path';

class ValidationReporter {
  constructor() {
    this.results = {
      total: 0,
      valid: 0,
      invalid: 0,
      warnings: 0,
      errors: [],
      warnings: []
    };
  }
  
  async validateDirectory(changesDir) {
    const entries = await fs.readdir(changesDir, { withFileTypes: true });
    const directories = entries.filter(entry => entry.isDirectory());
    
    this.results.total = directories.length;
    
    for (const dir of directories) {
      const changePath = path.join(changesDir, dir.name);
      await this.validateChange(dir.name, changePath);
    }
    
    this.printReport();
  }
  
  async validateChange(slug, changePath) {
    console.log(`Validating ${slug}...`);
    
    try {
      const result = await ChangeStructureValidator.validate(changePath, {
        securityChecks: true,
        validateOptional: true
      });
      
      if (result.isValid) {
        this.results.valid++;
        console.log(`✓ ${slug} is valid`);
      } else {
        this.results.invalid++;
        console.log(`✗ ${slug} has errors`);
        
        result.errors.forEach(error => {
          this.results.errors.push({ slug, ...error });
          console.log(`  ${error.code}: ${error.message}`);
        });
      }
      
      if (result.warnings.length > 0) {
        this.results.warnings += result.warnings.length;
        result.warnings.forEach(warning => {
          this.results.warnings.push({ slug, ...warning });
          console.log(`  ⚠ ${warning.code}: ${warning.message}`);
        });
      }
      
    } catch (error) {
      this.results.invalid++;
      this.results.errors.push({
        slug,
        code: 'VALIDATION_ERROR',
        message: error.message,
        severity: 'high'
      });
      console.log(`✗ ${slug}: Validation error - ${error.message}`);
    }
  }
  
  printReport() {
    console.log('\n' + '='.repeat(50));
    console.log('VALIDATION REPORT');
    console.log('='.repeat(50));
    console.log(`Total changes: ${this.results.total}`);
    console.log(`Valid: ${this.results.valid}`);
    console.log(`Invalid: ${this.results.invalid}`);
    console.log(`Total warnings: ${this.results.warnings}`);
    
    if (this.results.errors.length > 0) {
      console.log('\nERRORS:');
      this.results.errors.forEach(error => {
        console.log(`  ${error.slug}: ${error.code} - ${error.message}`);
        console.log(`    Hint: ${error.hint}`);
      });
    }
    
    if (this.results.warnings.length > 0) {
      console.log('\nWARNINGS:');
      this.results.warnings.forEach(warning => {
        console.log(`  ${warning.slug}: ${warning.code} - ${warning.message}`);
      });
    }
    
    console.log('\n' + '='.repeat(50));
  }
}

// Usage
const reporter = new ValidationReporter();
reporter.validateDirectory('openspec/changes').catch(console.error);
```

---

## Task MCP Integration

### 1. Custom Tool with Receipt Integration

```typescript
import { BaseTool } from './base.js';
import { ChangeStructureValidator } from '../validation/change-structure-validator.js';
import { ToolResult } from '../types/index.js';

export class CustomArchiveTool extends BaseTool {
  readonly definition = {
    name: 'custom.archive',
    description: 'Enhanced archive with custom validation and reporting',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        skipValidation: { type: 'boolean', default: false },
        customRules: { type: 'array', items: { type: 'string' } }
      },
      required: ['slug']
    }
  };

  async execute(input): Promise<ToolResult> {
    try {
      // Custom validation if requested
      if (!input.skipValidation) {
        const validationResult = await this.customValidate(input.slug, input.customRules);
        if (!validationResult.isValid) {
          return this.error(`Custom validation failed: ${this.formatErrors(validationResult.errors)}`);
        }
      }
      
      // Delegate to standard archive tool
      const archiveTool = new ChangeArchiveTool(this.security, this.logger);
      const result = await archiveTool.execute({ slug: input.slug });
      
      if (result.isError) {
        return result;
      }
      
      // Add custom reporting
      const enhancedResponse = this.enhanceResponse(result.content[0].text, input.slug);
      
      return this.success(enhancedResponse);
      
    } catch (error) {
      return this.error(`Custom archive failed: ${error.message}`);
    }
  }
  
  async customValidate(slug, customRules) {
    const changePath = path.join(this.security.sandboxRoot, 'openspec/changes', slug);
    
    // Base validation
    const baseResult = await ChangeStructureValidator.validate(changePath, {
      securityChecks: true,
      validateOptional: true
    });
    
    // Add custom rules
    if (customRules && customRules.includes('no-todos')) {
      const noTodosRule = (content, filePath) => {
        if (content.includes('TODO:') && filePath.endsWith('.md')) {
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
      
      const customResult = await ChangeStructureValidator.validate(changePath, {
        customRules: [noTodosRule]
      });
      
      // Merge results
      baseResult.errors.push(...customResult.errors);
      baseResult.warnings.push(...customResult.warnings);
    }
    
    return baseResult;
  }
  
  enhanceResponse(responseText, slug) {
    const timestamp = new Date().toISOString();
    return `${responseText}\n\nCustom Enhancement:\n- Processed at: ${timestamp}\n- Tool: custom.archive\n- Slug: ${slug}`;
  }
  
  formatErrors(errors) {
    return errors.map(err => `${err.code}: ${err.message}`).join('; ');
  }
}
```

### 2. Resource Provider for Receipts

```typescript
import { BaseResourceProvider } from '../base.js';
import { promises as fs } from 'fs';
import path from 'path';

export class ReceiptResourceProvider extends BaseResourceProvider {
  readonly definition = {
    name: 'receipt',
    description: 'Access to change receipts and metadata',
    uriPattern: 'receipt://([^/]+)',
    examples: ['receipt://add-user-authentication', 'receipt://feature-123']
  };

  async list() {
    const changesDir = path.join(this.security.sandboxRoot, 'openspec/changes');
    
    try {
      const entries = await fs.readdir(changesDir, { withFileTypes: true });
      const receipts = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const receiptPath = path.join(changesDir, entry.name, 'receipt.json');
          
          try {
            await fs.access(receiptPath);
            const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf-8'));
            
            receipts.push({
              uri: `receipt://${entry.name}`,
              name: entry.name,
              description: `Receipt for ${entry.name}`,
              metadata: {
                archivedAt: receipt.archivedAt,
                commitsCount: receipt.commits?.length || 0,
                testsPassed: receipt.tests?.passed || false,
                toolVersions: receipt.toolVersions
              }
            });
          } catch {
            // No receipt exists, skip
          }
        }
      }
      
      return receipts;
    } catch (error) {
      throw new Error(`Failed to list receipts: ${error.message}`);
    }
  }

  async read(uri) {
    const match = uri.match(/^receipt:\/\/([^\/]+)$/);
    if (!match) {
      throw new Error(`Invalid receipt URI: ${uri}`);
    }
    
    const slug = match[1];
    const receiptPath = path.join(
      this.security.sandboxRoot,
      'openspec/changes',
      slug,
      'receipt.json'
    );
    
    try {
      const content = await fs.readFile(receiptPath, 'utf-8');
      const receipt = JSON.parse(content);
      
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(receipt, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to read receipt for ${slug}: ${error.message}`);
    }
  }
}
```

### 3. Enhanced Change Resource with Receipt Integration

```typescript
export class EnhancedChangeResourceProvider extends BaseResourceProvider {
  readonly definition = {
    name: 'change-enhanced',
    description: 'Enhanced change information with receipt data',
    uriPattern: 'change-enhanced://([^/]+)',
    examples: ['change-enhanced://add-user-authentication']
  };

  async read(uri) {
    const match = uri.match(/^change-enhanced:\/\/([^\/]+)$/);
    if (!match) {
      throw new Error(`Invalid enhanced change URI: ${uri}`);
    }
    
    const slug = match[1];
    const changePath = path.join(this.security.sandboxRoot, 'openspec/changes', slug);
    
    try {
      // Gather all change information
      const [proposal, tasks, receipt, validation] = await Promise.allSettled([
        this.readFile(path.join(changePath, 'proposal.md')),
        this.readFile(path.join(changePath, 'tasks.md')),
        this.readFile(path.join(changePath, 'receipt.json')),
        ChangeStructureValidator.validate(changePath)
      ]);
      
      const changeData = {
        slug,
        proposal: proposal.status === 'fulfilled' ? proposal.value : null,
        tasks: tasks.status === 'fulfilled' ? tasks.value : null,
        receipt: receipt.status === 'fulfilled' ? JSON.parse(receipt.value) : null,
        validation: validation.status === 'fulfilled' ? validation.value : null,
        status: this.determineStatus(receipt, validation)
      };
      
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(changeData, null, 2)
        }]
      };
      
    } catch (error) {
      throw new Error(`Failed to read enhanced change data for ${slug}: ${error.message}`);
    }
  }
  
  determineStatus(receiptResult, validationResult) {
    if (receiptResult.status === 'fulfilled' && receiptResult.value) {
      return 'archived';
    }
    
    if (validationResult.status === 'fulfilled' && validationResult.value?.isValid) {
      return 'ready';
    }
    
    if (validationResult.status === 'fulfilled' && !validationResult.value?.isValid) {
      return 'invalid';
    }
    
    return 'unknown';
  }
  
  async readFile(filePath) {
    return await fs.readFile(filePath, 'utf-8');
  }
}
```

---

## Custom Tool Development

### 1. Validation Tool with Custom Rules

```typescript
export class ValidationTool extends BaseTool {
  readonly definition = {
    name: 'change.validate',
    description: 'Validate change structure with custom rules and detailed reporting',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        rules: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              pattern: { type: 'string' },
              severity: { enum: ['low', 'medium', 'high', 'critical'] },
              message: { type: 'string' },
              hint: { type: 'string' }
            }
          }
        },
        format: { enum: ['json', 'text', 'markdown'], default: 'text' }
      },
      required: ['slug']
    }
  };

  async execute(input): Promise<ToolResult> {
    try {
      const changePath = path.join(this.security.sandboxRoot, 'openspec/changes', input.slug);
      
      // Base validation
      const baseResult = await ChangeStructureValidator.validate(changePath, {
        securityChecks: true,
        validateOptional: true,
        customRules: this.buildCustomRules(input.rules || [])
      });
      
      // Format output
      const formattedOutput = this.formatValidationResult(baseResult, input.format);
      
      return baseResult.isValid ? 
        this.success(formattedOutput) : 
        this.error(formattedOutput);
        
    } catch (error) {
      return this.error(`Validation failed: ${error.message}`);
    }
  }
  
  buildCustomRules(rulesConfig) {
    return rulesConfig.map(rule => {
      const regex = new RegExp(rule.pattern);
      
      return (content, filePath) => {
        const matches = content.match(regex);
        if (matches) {
          return [{
            code: `CUSTOM_${rule.name.toUpperCase()}`,
            message: rule.message || `Custom rule violation: ${rule.name}`,
            path: filePath,
            hint: rule.hint || `Fix: ${rule.name}`,
            severity: rule.severity || 'medium'
          }];
        }
        return [];
      };
    });
  }
  
  formatValidationResult(result, format) {
    switch (format) {
      case 'json':
        return JSON.stringify(result, null, 2);
        
      case 'markdown':
        return this.formatAsMarkdown(result);
        
      case 'text':
      default:
        return this.formatAsText(result);
    }
  }
  
  formatAsMarkdown(result) {
    let markdown = `# Validation Result\n\n`;
    markdown += `**Status:** ${result.isValid ? '✅ Valid' : '❌ Invalid'}\n\n`;
    
    if (result.errors.length > 0) {
      markdown += `## Errors (${result.errors.length})\n\n`;
      result.errors.forEach(error => {
        markdown += `- **${error.code}** (${error.severity}): ${error.message}\n`;
        markdown += `  - Path: ${error.path}\n`;
        markdown += `  - Hint: ${error.hint}\n\n`;
      });
    }
    
    if (result.warnings.length > 0) {
      markdown += `## Warnings (${result.warnings.length})\n\n`;
      result.warnings.forEach(warning => {
        markdown += `- **${warning.code}** (${warning.severity}): ${warning.message}\n`;
        markdown += `  - Path: ${warning.path}\n`;
        markdown += `  - Hint: ${warning.hint}\n\n`;
      });
    }
    
    markdown += `## Summary\n\n`;
    markdown += `- Total files: ${result.summary.totalFiles}\n`;
    markdown += `- Valid files: ${result.summary.validFiles}\n`;
    markdown += `- Required files: ${result.summary.requiredFiles.join(', ')}\n`;
    markdown += `- Optional files: ${result.summary.optionalFiles.join(', ')}\n`;
    
    return markdown;
  }
  
  formatAsText(result) {
    let text = `Validation Result: ${result.isValid ? 'VALID' : 'INVALID'}\n`;
    text += `${'='.repeat(50)}\n\n`;
    
    if (result.errors.length > 0) {
      text += `ERRORS (${result.errors.length}):\n`;
      result.errors.forEach(error => {
        text += `  ${error.code}: ${error.message}\n`;
        text += `    Path: ${error.path}\n`;
        text += `    Hint: ${error.hint}\n`;
        text += `    Severity: ${error.severity}\n\n`;
      });
    }
    
    if (result.warnings.length > 0) {
      text += `WARNINGS (${result.warnings.length}):\n`;
      result.warnings.forEach(warning => {
        text += `  ${warning.code}: ${warning.message}\n`;
        text += `    Path: ${warning.path}\n`;
        text += `    Hint: ${warning.hint}\n`;
        text += `    Severity: ${warning.severity}\n\n`;
      });
    }
    
    text += `SUMMARY:\n`;
    text += `  Total files: ${result.summary.totalFiles}\n`;
    text += `  Valid files: ${result.summary.validFiles}\n`;
    text += `  Required files: ${result.summary.requiredFiles.join(', ')}\n`;
    text += `  Optional files: ${result.summary.optionalFiles.join(', ')}\n`;
    
    return text;
  }
}
```

### 2. Receipt Analysis Tool

```typescript
export class ReceiptAnalysisTool extends BaseTool {
  readonly definition = {
    name: 'receipt.analyze',
    description: 'Analyze change receipts for insights and metrics',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        analysis: { 
          type: 'array',
          items: { 
            enum: ['commits', 'files', 'tests', 'timeline', 'performance'] 
          },
          default: ['commits', 'files', 'tests']
        },
        compare: { type: 'string' }, // Compare with another receipt
        format: { enum: ['json', 'text'], default: 'text' }
      },
      required: ['slug']
    }
  };

  async execute(input): Promise<ToolResult> {
    try {
      const receipt = await this.loadReceipt(input.slug);
      const compareReceipt = input.compare ? await this.loadReceipt(input.compare) : null;
      
      const analysis = await this.performAnalysis(receipt, compareReceipt, input.analysis);
      
      const formatted = this.formatAnalysis(analysis, input.format);
      
      return this.success(formatted);
      
    } catch (error) {
      return this.error(`Receipt analysis failed: ${error.message}`);
    }
  }
  
  async loadReceipt(slug) {
    const receiptPath = path.join(
      this.security.sandboxRoot,
      'openspec/changes',
      slug,
      'receipt.json'
    );
    
    const content = await fs.readFile(receiptPath, 'utf-8');
    return JSON.parse(content);
  }
  
  async performAnalysis(receipt, compareReceipt, analysisTypes) {
    const results = {};
    
    for (const type of analysisTypes) {
      switch (type) {
        case 'commits':
          results.commits = this.analyzeCommits(receipt, compareReceipt);
          break;
        case 'files':
          results.files = this.analyzeFiles(receipt, compareReceipt);
          break;
        case 'tests':
          results.tests = this.analyzeTests(receipt, compareReceipt);
          break;
        case 'timeline':
          results.timeline = this.analyzeTimeline(receipt, compareReceipt);
          break;
        case 'performance':
          results.performance = this.analyzePerformance(receipt, compareReceipt);
          break;
      }
    }
    
    return results;
  }
  
  analyzeCommits(receipt, compareReceipt) {
    const analysis = {
      totalCommits: receipt.commits?.length || 0,
      commitRange: receipt.gitRange,
      commitDensity: 0
    };
    
    if (compareReceipt) {
      analysis.comparison = {
        previousCommits: compareReceipt.commits?.length || 0,
        difference: analysis.totalCommits - (compareReceipt.commits?.length || 0),
        trend: analysis.totalCommits > (compareReceipt.commits?.length || 0) ? 'increasing' : 'decreasing'
      };
    }
    
    // Calculate commit density (commits per file touched)
    if (receipt.filesTouched && receipt.filesTouched.length > 0) {
      analysis.commitDensity = analysis.totalCommits / receipt.filesTouched.length;
    }
    
    return analysis;
  }
  
  analyzeFiles(receipt, compareReceipt) {
    const analysis = {
      totalFiles: receipt.filesTouched?.length || 0,
      fileTypes: this.categorizeFiles(receipt.filesTouched || []),
      largestChange: null,
      testFiles: 0
    };
    
    // Categorize files by type
    analysis.fileTypes = Object.entries(analysis.fileTypes)
      .sort(([,a], [,b]) => b - a)
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
    
    // Count test files
    analysis.testFiles = (receipt.filesTouched || [])
      .filter(file => file.includes('.test.') || file.includes('.spec.')).length;
    
    if (compareReceipt) {
      analysis.comparison = {
        previousFiles: compareReceipt.filesTouched?.length || 0,
        fileDifference: analysis.totalFiles - (compareReceipt.filesTouched?.length || 0),
        typeChanges: this.compareFileTypes(analysis.fileTypes, this.categorizeFiles(compareReceipt.filesTouched || []))
      };
    }
    
    return analysis;
  }
  
  analyzeTests(receipt, compareReceipt) {
    const analysis = {
      testsAdded: receipt.tests?.added || 0,
      testsUpdated: receipt.tests?.updated || 0,
      testsPassed: receipt.tests?.passed || false,
      testCoverage: 'unknown',
      testRatio: 0
    };
    
    // Calculate test ratio (test files / total files)
    const totalFiles = receipt.filesTouched?.length || 0;
    const testFiles = (receipt.filesTouched || [])
      .filter(file => file.includes('.test.') || file.includes('.spec.')).length;
    
    if (totalFiles > 0) {
      analysis.testRatio = testFiles / totalFiles;
    }
    
    if (compareReceipt) {
      analysis.comparison = {
        previousTestsAdded: compareReceipt.tests?.added || 0,
        previousTestsUpdated: compareReceipt.tests?.updated || 0,
        previousTestsPassed: compareReceipt.tests?.passed || false,
        testImprovement: analysis.testsAdded > (compareReceipt.tests?.added || 0)
      };
    }
    
    return analysis;
  }
  
  analyzeTimeline(receipt, compareReceipt) {
    const analysis = {
      archivedAt: receipt.archivedAt,
      archiveDate: new Date(receipt.archivedAt),
      timeSinceArchive: this.getTimeSince(receipt.archivedAt),
      actorInfo: receipt.actor
    };
    
    if (compareReceipt) {
      analysis.comparison = {
        previousArchiveDate: new Date(compareReceipt.archivedAt),
        timeDifference: this.getTimeDifference(receipt.archivedAt, compareReceipt.archivedAt),
        frequency: this.calculateFrequency(receipt.archivedAt, compareReceipt.archivedAt)
      };
    }
    
    return analysis;
  }
  
  analyzePerformance(receipt, compareReceipt) {
    const analysis = {
      toolVersions: receipt.toolVersions,
      versionChanges: {},
      performanceMetrics: {
        commitEfficiency: 0,
        fileEfficiency: 0,
        testEfficiency: 0
      }
    };
    
    // Calculate efficiency metrics
    const totalCommits = receipt.commits?.length || 0;
    const totalFiles = receipt.filesTouched?.length || 0;
    const totalTests = (receipt.tests?.added || 0) + (receipt.tests?.updated || 0);
    
    if (totalCommits > 0) {
      analysis.performanceMetrics.commitEfficiency = totalFiles / totalCommits;
    }
    
    if (totalFiles > 0) {
      analysis.performanceMetrics.fileEfficiency = totalTests / totalFiles;
    }
    
    if (totalTests > 0) {
      analysis.performanceMetrics.testEfficiency = (receipt.tests?.passed ? 1 : 0);
    }
    
    if (compareReceipt) {
      analysis.comparison = {
        versionChanges: this.compareVersions(receipt.toolVersions, compareReceipt.toolVersions),
        performanceChanges: this.comparePerformance(analysis.performanceMetrics, this.calculatePerformanceMetrics(compareReceipt))
      };
    }
    
    return analysis;
  }
  
  categorizeFiles(files) {
    const categories = {};
    
    files.forEach(file => {
      let category = 'other';
      
      if (file.includes('/src/')) category = 'source';
      else if (file.includes('/test/') || file.includes('.test.') || file.includes('.spec.')) category = 'test';
      else if (file.includes('/docs/')) category = 'documentation';
      else if (file.includes('/config/')) category = 'configuration';
      else if (file.includes('package.json') || file.includes('tsconfig.json')) category = 'build';
      else if (file.includes('.md')) category = 'markdown';
      
      categories[category] = (categories[category] || 0) + 1;
    });
    
    return categories;
  }
  
  getTimeSince(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diff = now - past;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return { days, hours, total: diff };
  }
  
  formatAnalysis(analysis, format) {
    if (format === 'json') {
      return JSON.stringify(analysis, null, 2);
    }
    
    // Text format
    let text = 'Receipt Analysis Report\n';
    text += '='.repeat(50) + '\n\n';
    
    Object.entries(analysis).forEach(([type, data]) => {
      text += `${type.toUpperCase()} ANALYSIS:\n`;
      text += '-'.repeat(30) + '\n';
      text += this.formatAnalysisSection(type, data);
      text += '\n';
    });
    
    return text;
  }
  
  formatAnalysisSection(type, data) {
    switch (type) {
      case 'commits':
        return `Total Commits: ${data.totalCommits}\n` +
               `Commit Range: ${data.commitRange || 'N/A'}\n` +
               `Commit Density: ${data.commitDensity.toFixed(2)} commits/file\n`;
               
      case 'files':
        let fileText = `Total Files: ${data.totalFiles}\n` +
                      `Test Files: ${data.testFiles}\n\n` +
                      `File Types:\n`;
        Object.entries(data.fileTypes).forEach(([type, count]) => {
          fileText += `  ${type}: ${count}\n`;
        });
        return fileText;
        
      case 'tests':
        return `Tests Added: ${data.testsAdded}\n` +
               `Tests Updated: ${data.testsUpdated}\n` +
               `Tests Passed: ${data.testsPassed ? 'Yes' : 'No'}\n` +
               `Test Ratio: ${(data.testRatio * 100).toFixed(1)}%\n`;
               
      default:
        return JSON.stringify(data, null, 2);
    }
  }
}
```

---

## CI/CD Integration

### 1. GitHub Actions Workflow

```yaml
# .github/workflows/openspec-validation.yml
name: OpenSpec Change Validation

on:
  push:
    paths:
      - 'openspec/changes/**'
  pull_request:
    paths:
      - 'openspec/changes/**'

jobs:
  validate-changes:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
      with:
        fetch-depth: 0
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Install OpenSpec CLI
      run: npm install -g @openspec/openspec-cli
    
    - name: Validate OpenSpec changes
      run: |
        # Find all changed OpenSpec directories
        CHANGED_DIRS=$(git diff --name-only ${{ github.event.before }} ${{ github.sha }} | grep "openspec/changes/" | cut -d'/' -f3 | sort -u)
        
        if [ -n "$CHANGED_DIRS" ]; then
          echo "Validating changes: $CHANGED_DIRS"
          
          for dir in $CHANGED_DIRS; do
            if [ -d "openspec/changes/$dir" ]; then
              echo "Validating $dir..."
              
              # Run structure validation
              if ! openspec validate "$dir"; then
                echo "Validation failed for $dir"
                exit 1
              fi
              
              # Run tests if they exist
              if [ -d "openspec/changes/$dir/tests" ]; then
                echo "Running tests for $dir..."
                npm test -- openspec/changes/$dir
              fi
            fi
          done
          
          echo "All changes validated successfully!"
        else
          echo "No OpenSpec changes to validate"
        fi
    
    - name: Generate validation report
      if: always()
      run: |
        node scripts/generate-validation-report.js > validation-report.md
        
    - name: Upload validation report
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: validation-report
        path: validation-report.md
    
    - name: Comment PR with validation results
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v6
      with:
        script: |
          const fs = require('fs');
          
          if (fs.existsSync('validation-report.md')) {
            const report = fs.readFileSync('validation-report.md', 'utf8');
            
            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## OpenSpec Validation Results\n\n${report}`
            });
          }
```

### 2. Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
        OPENSPEC_VERSION = '0.13.0'
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g n'
                sh "n ${NODE_VERSION}"
                sh 'npm install -g @openspec/openspec-cli@${OPENSPEC_VERSION}'
                sh 'npm ci'
            }
        }
        
        stage('Detect Changes') {
            steps {
                script {
                    // Get list of changed OpenSpec directories
                    CHANGED_DIRS = sh(
                        script: '''
                            git diff --name-only HEAD~1 HEAD | 
                            grep "openspec/changes/" | 
                            cut -d'/' -f3 | 
                            sort -u || true
                        ''',
                        returnStdout: true
                    ).trim()
                    
                    if (CHANGED_DIRS) {
                        echo "Detected OpenSpec changes: ${CHANGED_DIRS}"
                        env.CHANGED_DIRS = CHANGED_DIRS
                    } else {
                        echo "No OpenSpec changes detected"
                        env.CHANGED_DIRS = ''
                    }
                }
            }
        }
        
        stage('Validate Changes') {
            when {
                expression { env.CHANGED_DIRS }
            }
            steps {
                script {
                    def dirs = env.CHANGED_DIRS.split('\n')
                    
                    dirs.each { dir ->
                        echo "Validating change: ${dir}"
                        
                        // Structure validation
                        sh """
                            if ! openspec validate '${dir}'; then
                                echo "Validation failed for ${dir}"
                                exit 1
                            fi
                        """
                        
                        // Run tests if available
                        sh """
                            if [ -d "openspec/changes/${dir}/tests" ]; then
                                echo "Running tests for ${dir}"
                                npm test -- openspec/changes/${dir}
                            fi
                        """
                    }
                }
            }
        }
        
        stage('Generate Report') {
            steps {
                sh 'node scripts/generate-validation-report.js > validation-report.txt'
                archiveArtifacts artifacts: 'validation-report.txt', allowEmptyArchive: true
            }
        }
    }
    
    post {
        always {
            script {
                if (fileExists('validation-report.txt')) {
                    def report = readFile('validation-report.txt')
                    echo "Validation Report:\n${report}"
                }
            }
        }
        
        success {
            echo 'OpenSpec validation completed successfully'
        }
        
        failure {
            echo 'OpenSpec validation failed'
            emailext (
                subject: "OpenSpec Validation Failed: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: "OpenSpec validation failed for changes: ${env.CHANGED_DIRS}",
                to: "${env.CHANGE_AUTHOR_EMAIL}"
            )
        }
    }
}
```

### 3. GitLab CI/CD

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - test
  - report

variables:
  NODE_VERSION: "18"
  OPENSPEC_VERSION: "0.13.0"

.validate_changes:
  stage: validate
  image: node:${NODE_VERSION}
  before_script:
    - npm install -g @openspec/openspec-cli@${OPENSPEC_VERSION}
    - npm ci
  script:
    - |
      # Find all changed OpenSpec directories
      CHANGED_DIRS=$(git diff --name-only $CI_COMMIT_BEFORE_SHA $CI_COMMIT_SHA | 
                    grep "openspec/changes/" | 
                    cut -d'/' -f3 | 
                    sort -u)
      
      if [ -n "$CHANGED_DIRS" ]; then
        echo "Validating changes: $CHANGED_DIRS"
        
        for dir in $CHANGED_DIRS; do
          if [ -d "openspec/changes/$dir" ]; then
            echo "Validating $dir..."
            
            # Structure validation
            if ! openspec validate "$dir"; then
              echo "Validation failed for $dir"
              exit 1
            fi
            
            # Store validated directories for test stage
            echo "$dir" >> validated_changes.txt
          fi
        done
        
        echo "All changes validated successfully!"
      else
        echo "No OpenSpec changes to validate"
      fi
  artifacts:
    paths:
      - validated_changes.txt
    expire_in: 1 hour

.test_changes:
  stage: test
  image: node:${NODE_VERSION}
  dependencies:
    - validate_changes
  script:
    - |
      if [ -f "validated_changes.txt" ]; then
        while IFS= read -r dir; do
          echo "Testing $dir..."
          
          # Run tests if they exist
          if [ -d "openspec/changes/$dir/tests" ]; then
            echo "Running tests for $dir"
            npm test -- openspec/changes/$dir
          else
            echo "No tests found for $dir"
          fi
        done < validated_changes.txt
      else
        echo "No changes to test"
      fi
  artifacts:
    reports:
      junit: test-results.xml
    paths:
      - test-results.xml
    expire_in: 1 hour

.generate_report:
  stage: report
  image: node:${NODE_VERSION}
  dependencies:
    - validate_changes
    - test_changes
  script:
    - node scripts/generate-validation-report.js > validation-report.md
  artifacts:
    paths:
      - validation-report.md
    expire_in: 1 week
  only:
    - merge_requests
    - main
```

---

## IDE Plugin Development

### 1. VS Code Extension

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { OpenSpecClient } from './openspec-client';
import { ValidationProvider } from './validation-provider';
import { ReceiptProvider } from './receipt-provider';

export function activate(context: vscode.ExtensionContext) {
  const client = new OpenSpecClient();
  const validationProvider = new ValidationProvider(client);
  const receiptProvider = new ReceiptProvider(client);
  
  // Register commands
  const validateCommand = vscode.commands.registerCommand('openspec.validateChange', async () => {
    const slug = await vscode.window.showInputBox({
      prompt: 'Enter change slug to validate',
      placeHolder: 'add-user-authentication'
    });
    
    if (slug) {
      await validationProvider.validateChange(slug);
    }
  });
  
  const archiveCommand = vscode.commands.registerCommand('openspec.archiveChange', async () => {
    const slug = await vscode.window.showInputBox({
      prompt: 'Enter change slug to archive',
      placeHolder: 'add-user-authentication'
    });
    
    if (slug) {
      await validationProvider.archiveChange(slug);
    }
  });
  
  const showReceiptCommand = vscode.commands.registerCommand('openspec.showReceipt', async () => {
    const slug = await vscode.window.showInputBox({
      prompt: 'Enter change slug to show receipt',
      placeHolder: 'add-user-authentication'
    });
    
    if (slug) {
      await receiptProvider.showReceipt(slug);
    }
  });
  
  // Register tree view for changes
  const changesProvider = new ChangesTreeProvider(client);
  vscode.window.registerTreeDataProvider('openspec.changes', changesProvider);
  
  // Register diagnostics for validation
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('openspec');
  context.subscriptions.push(diagnosticCollection);
  
  // Watch for changes in OpenSpec directories
  const watcher = vscode.workspace.createFileSystemWatcher('**/openspec/changes/**');
  
  watcher.onDidChange(uri => {
    if (uri.path.endsWith('/proposal.md') || uri.path.endsWith('/tasks.md')) {
      const slug = uri.path.split('/').slice(-2, -1)[0];
      validationProvider.validateChange(slug, true); // Silent validation
    }
  });
  
  context.subscriptions.push(
    validateCommand,
    archiveCommand,
    showReceiptCommand,
    diagnosticCollection,
    watcher
  );
}

class ValidationProvider {
  constructor(private client: OpenSpecClient) {}
  
  async validateChange(slug: string, silent: boolean = false) {
    try {
      const result = await this.client.call('change.validate', { slug });
      
      if (result.isError) {
        if (!silent) {
          vscode.window.showErrorMessage(`Validation failed: ${result.content[0].text}`);
        }
        return false;
      }
      
      if (!silent) {
        vscode.window.showInformationMessage(`Change ${slug} is valid`);
      }
      
      return true;
    } catch (error) {
      if (!silent) {
        vscode.window.showErrorMessage(`Validation error: ${error.message}`);
      }
      return false;
    }
  }
  
  async archiveChange(slug: string) {
    // First validate
    const isValid = await this.validateChange(slug);
    if (!isValid) {
      return;
    }
    
    try {
      const result = await this.client.call('change.archive', { slug });
      
      if (result.isError) {
        vscode.window.showErrorMessage(`Archive failed: ${result.content[0].text}`);
        return;
      }
      
      vscode.window.showInformationMessage(`Successfully archived ${slug}`);
      
      // Show receipt details
      const receiptMatch = result.content[0].text.match(/Receipt Summary:[\s\S]*?(?=\n\n|$)/);
      if (receiptMatch) {
        vscode.window.showInformationMessage(receiptMatch[0]);
      }
      
    } catch (error) {
      vscode.window.showErrorMessage(`Archive error: ${error.message}`);
    }
  }
}

class ReceiptProvider {
  constructor(private client: OpenSpecClient) {}
  
  async showReceipt(slug: string) {
    try {
      const result = await this.client.call('resources.read', {
        uri: `receipt://${slug}`
      });
      
      if (result.isError) {
        vscode.window.showErrorMessage(`Failed to read receipt: ${result.content[0].text}`);
        return;
      }
      
      const receipt = JSON.parse(result.content[0].text);
      
      // Create a new document with the receipt
      const document = await vscode.workspace.openTextDocument({
        content: JSON.stringify(receipt, null, 2),
        language: 'json'
      });
      
      await vscode.window.showTextDocument(document);
      
    } catch (error) {
      vscode.window.showErrorMessage(`Receipt error: ${error.message}`);
    }
  }
}

class ChangesTreeProvider implements vscode.TreeDataProvider<ChangeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChangeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  constructor(private client: OpenSpecClient) {}
  
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
  
  getTreeItem(element: ChangeItem): vscode.TreeItem {
    return element;
  }
  
  getChildren(element?: ChangeItem): Thenable<ChangeItem[]> {
    if (!element) {
      // Root level - show all changes
      return this.getChanges();
    }
    
    return Promise.resolve([]);
  }
  
  private async getChanges(): Promise<ChangeItem[]> {
    try {
      const result = await this.client.call('resources.read', {
        uri: 'changes://active'
      });
      
      if (result.isError) {
        return [];
      }
      
      const changes = JSON.parse(result.content[0].text);
      
      return changes.changes.map(change => {
        const item = new ChangeItem(
          change.slug,
          change.status,
          change.hasLock,
          change.hasReceipt
        );
        
        item.contextValue = change.hasReceipt ? 'archived' : 'active';
        item.command = {
          command: 'openspec.showChangeDetails',
          title: 'Show Details',
          arguments: [change.slug]
        };
        
        return item;
      });
      
    } catch (error) {
      console.error('Failed to get changes:', error);
      return [];
    }
  }
}

class ChangeItem extends vscode.TreeItem {
  constructor(
    public readonly slug: string,
    public readonly status: string,
    public readonly hasLock: boolean,
    public readonly hasReceipt: boolean
  ) {
    super(slug, vscode.TreeItemCollapsibleState.None);
    
    this.tooltip = `${slug} (${status})`;
    this.description = status;
    
    if (this.hasReceipt) {
      this.iconPath = new vscode.ThemeIcon('check');
    } else if (this.hasLock) {
      this.iconPath = new vscode.ThemeIcon('lock');
    } else {
      this.iconPath = new vscode.ThemeIcon('edit');
    }
  }
}
```

### 2. JetBrains IDE Plugin (Kotlin)

```kotlin
// src/main/kotlin/com/openspec/integration/OpenSpecToolWindow.kt
package com.openspec.integration

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBPanel
import java.awt.BorderLayout
import javax.swing.*

class OpenSpecToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentFactory = ContentFactory.getInstance()
        val content = contentFactory.createContent(OpenSpecToolWindow(project).content, "", false)
        toolWindow.contentManager.addContent(content)
    }
}

class OpenSpecToolWindow(private val project: Project) {
    val content: JComponent
    
    private val client = OpenSpecClient(project)
    private val changesList = JBList<ChangeItem>()
    private val validateButton = JButton("Validate")
    private val archiveButton = JButton("Archive")
    private val showReceiptButton = JButton("Show Receipt")
    
    init {
        content = createUI()
        loadChanges()
    }
    
    private fun createUI(): JComponent {
        val panel = JBPanel<JBPanel<*>>(BorderLayout())
        
        // Buttons panel
        val buttonsPanel = JPanel().apply {
            add(validateButton)
            add(archiveButton)
            add(showReceiptButton)
        }
        
        // List panel with scroll
        val scrollPane = JScrollPane(changesList)
        
        panel.add(buttonsPanel, BorderLayout.NORTH)
        panel.add(scrollPane, BorderLayout.CENTER)
        
        // Button actions
        validateButton.addActionListener { validateSelectedChange() }
        archiveButton.addActionListener { archiveSelectedChange() }
        showReceiptButton.addActionListener { showSelectedReceipt() }
        
        return panel
    }
    
    private fun loadChanges() {
        try {
            val changes = client.getChanges()
            changesList.setListData(changes.toTypedArray())
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(
                content,
                "Failed to load changes: ${e.message}",
                "Error",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }
    
    private fun validateSelectedChange() {
        val selected = changesList.selectedValue ?: return
        
        try {
            val result = client.validateChange(selected.slug)
            if (result.success) {
                JOptionPane.showMessageDialog(
                    content,
                    "Change ${selected.slug} is valid",
                    "Validation Success",
                    JOptionPane.INFORMATION_MESSAGE
                )
            } else {
                JOptionPane.showMessageDialog(
                    content,
                    "Validation failed: ${result.error}",
                    "Validation Error",
                    JOptionPane.ERROR_MESSAGE
                )
            }
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(
                content,
                "Validation error: ${e.message}",
                "Error",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }
    
    private fun archiveSelectedChange() {
        val selected = changesList.selectedValue ?: return
        
        // First validate
        val validationResult = client.validateChange(selected.slug)
        if (!validationResult.success) {
            JOptionPane.showMessageDialog(
                content,
                "Cannot archive: Validation failed\n${validationResult.error}",
                "Archive Error",
                JOptionPane.ERROR_MESSAGE
            )
            return
        }
        
        // Confirm archive
        val result = JOptionPane.showConfirmDialog(
            content,
            "Archive change ${selected.slug}?",
            "Confirm Archive",
            JOptionPane.YES_NO_OPTION
        )
        
        if (result == JOptionPane.YES_OPTION) {
            try {
                val archiveResult = client.archiveChange(selected.slug)
                if (archiveResult.success) {
                    JOptionPane.showMessageDialog(
                        content,
                        "Successfully archived ${selected.slug}\n${archiveResult.message}",
                        "Archive Success",
                        JOptionPane.INFORMATION_MESSAGE
                    )
                    loadChanges() // Refresh list
                } else {
                    JOptionPane.showMessageDialog(
                        content,
                        "Archive failed: ${archiveResult.error}",
                        "Archive Error",
                        JOptionPane.ERROR_MESSAGE
                    )
                }
            } catch (e: Exception) {
                JOptionPane.showMessageDialog(
                    content,
                    "Archive error: ${e.message}",
                    "Error",
                    JOptionPane.ERROR_MESSAGE
                )
            }
        }
    }
    
    private fun showSelectedReceipt() {
        val selected = changesList.selectedValue ?: return
        
        try {
            val receipt = client.getReceipt(selected.slug)
            if (receipt != null) {
                // Show receipt in a new dialog
                val receiptDialog = ReceiptDialog(receipt)
                receiptDialog.show()
            } else {
                JOptionPane.showMessageDialog(
                    content,
                    "No receipt found for ${selected.slug}",
                    "Receipt Not Found",
                    JOptionPane.INFORMATION_MESSAGE
                )
            }
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(
                content,
                "Failed to load receipt: ${e.message}",
                "Error",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }
}

data class ChangeItem(
    val slug: String,
    val status: String,
    val hasLock: Boolean,
    val hasReceipt: Boolean
) {
    override fun toString(): String {
        val icon = when {
            hasReceipt -> "✓"
            hasLock -> "🔒"
            else -> "📝"
        }
        return "$icon $slug ($status)"
    }
}
```

---

## Monitoring and Observability

### 1. Metrics Collection

```typescript
// src/monitoring/metrics-collector.ts
export class OpenSpecMetricsCollector {
  private metrics = new Map<string, any>();
  
  // Archive metrics
  async recordArchive(slug: string, duration: number, result: any) {
    const key = `archive.${slug}`;
    this.metrics.set(key, {
      timestamp: new Date().toISOString(),
      duration,
      success: !result.isError,
      error: result.isError ? result.content[0].text : null,
      receiptGenerated: !result.isError && result.content[0].text.includes('Receipt Summary')
    });
  }
  
  // Validation metrics
  async recordValidation(slug: string, duration: number, result: any) {
    const key = `validation.${slug}`;
    this.metrics.set(key, {
      timestamp: new Date().toISOString(),
      duration,
      success: result.isValid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errorCodes: result.errors.map((e: any) => e.code)
    });
  }
  
  // Performance metrics
  getPerformanceMetrics() {
    const archives = Array.from(this.metrics.entries())
      .filter(([key]) => key.startsWith('archive.'))
      .map(([, value]) => value);
    
    const validations = Array.from(this.metrics.entries())
      .filter(([key]) => key.startsWith('validation.'))
      .map(([, value]) => value);
    
    return {
      archives: {
        total: archives.length,
        success: archives.filter(a => a.success).length,
        failure: archives.filter(a => !a.success).length,
        averageDuration: archives.reduce((sum, a) => sum + a.duration, 0) / archives.length,
        receiptGenerationRate: archives.filter(a => a.receiptGenerated).length / archives.length
      },
      validations: {
        total: validations.length,
        success: validations.filter(v => v.success).length,
        failure: validations.filter(v => !v.success).length,
        averageDuration: validations.reduce((sum, v) => sum + v.duration, 0) / validations.length,
        averageErrors: validations.reduce((sum, v) => sum + v.errorCount, 0) / validations.length,
        averageWarnings: validations.reduce((sum, v) => sum + v.warningCount, 0) / validations.length
      }
    };
  }
  
  // Export metrics for monitoring systems
  exportPrometheusMetrics(): string {
    const perf = this.getPerformanceMetrics();
    
    let metrics = '';
    
    // Archive metrics
    metrics += '# HELP openspec_archives_total Total number of archive operations\n';
    metrics += '# TYPE openspec_archives_total counter\n';
    metrics += `openspec_archives_total ${perf.archives.total}\n\n`;
    
    metrics += '# HELP openspec_archives_success_total Total successful archives\n';
    metrics += '# TYPE openspec_archives_success_total counter\n';
    metrics += `openspec_archives_success_total ${perf.archives.success}\n\n`;
    
    metrics += '# HELP openspec_archive_duration_seconds Archive operation duration\n';
    metrics += '# TYPE openspec_archive_duration_seconds histogram\n';
    metrics += `openspec_archive_duration_seconds_sum ${perf.archives.averageDuration * perf.archives.total}\n`;
    metrics += `openspec_archive_duration_seconds_count ${perf.archives.total}\n\n`;
    
    // Validation metrics
    metrics += '# HELP openspec_validations_total Total number of validation operations\n';
    metrics += '# TYPE openspec_validations_total counter\n';
    metrics += `openspec_validations_total ${perf.validations.total}\n\n`;
    
    metrics += '# HELP openspec_validations_success_total Total successful validations\n';
    metrics += '# TYPE openspec_validations_success_total counter\n';
    metrics += `openspec_validations_success_total ${perf.validations.success}\n\n`;
    
    return metrics;
  }
}
```

### 2. Health Check Endpoint

```typescript
// src/monitoring/health-check.ts
export class OpenSpecHealthCheck {
  constructor(
    private metricsCollector: OpenSpecMetricsCollector,
    private security: any
  ) {}
  
  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = await Promise.allSettled([
      this.checkFileSystem(),
      this.checkSecurity(),
      this.checkToolAvailability(),
      this.checkRecentPerformance()
    ]);
    
    const results = checks.map((check, index) => {
      const name = ['filesystem', 'security', 'tools', 'performance'][index];
      
      if (check.status === 'fulfilled') {
        return { name, status: 'healthy', details: check.value };
      } else {
        return { name, status: 'unhealthy', details: check.reason.message };
      }
    });
    
    const overallStatus = results.every(r => r.status === 'healthy') ? 'healthy' : 'degraded';
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results,
      metrics: this.metricsCollector.getPerformanceMetrics()
    };
  }
  
  private async checkFileSystem() {
    const changesDir = path.join(this.security.sandboxRoot, 'openspec/changes');
    
    try {
      await fs.access(changesDir);
      const entries = await fs.readdir(changesDir);
      return { accessible: true, changeCount: entries.length };
    } catch (error) {
      throw new Error(`Filesystem check failed: ${error.message}`);
    }
  }
  
  private async checkSecurity() {
    try {
      // Test security context
      const testPath = path.join(this.security.sandboxRoot, 'test-security');
      const canonical = await canonicalize(testPath);
      
      return { 
        sandboxWorking: true, 
        pathProtectionEnabled: true,
        canonicalPath: canonical 
      };
    } catch (error) {
      throw new Error(`Security check failed: ${error.message}`);
    }
  }
  
  private async checkToolAvailability() {
    try {
      // Test OpenSpec CLI
      const { stdout } = await execFileAsync('openspec', ['--version']);
      
      return { 
        openspecCli: stdout.trim(),
        taskMcpServer: '2.1.0' // From package or environment
      };
    } catch (error) {
      throw new Error(`Tool availability check failed: ${error.message}`);
    }
  }
  
  private async checkRecentPerformance() {
    const metrics = this.metricsCollector.getPerformanceMetrics();
    
    // Check if recent performance is within acceptable bounds
    const archiveAvgAcceptable = metrics.archives.averageDuration < 5000; // 5 seconds
    const validationAvgAcceptable = metrics.validations.averageDuration < 2000; // 2 seconds
    
    return {
      archivePerformanceAcceptable: archiveAvgAcceptable,
      validationPerformanceAcceptable: validationAvgAcceptable,
      archiveAverageDuration: metrics.archives.averageDuration,
      validationAverageDuration: metrics.validations.averageDuration
    };
  }
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Array<{
    name: string;
    status: 'healthy' | 'unhealthy';
    details: any;
  }>;
  metrics: any;
}
```

### 3. Logging Integration

```typescript
// src/monitoring/enhanced-logger.ts
export class EnhancedLogger {
  constructor(
    private baseLogger: Console,
    private metricsCollector: OpenSpecMetricsCollector
  ) {}
  
  logArchiveStart(slug: string) {
    this.baseLogger.info(`Starting archive operation for ${slug}`);
    this.metricsCollector.recordEvent('archive_start', { slug });
  }
  
  logArchiveSuccess(slug: string, duration: number, receipt: any) {
    this.baseLogger.info(`Archive completed for ${slug} in ${duration}ms`);
    this.baseLogger.info(`Receipt: ${JSON.stringify(receipt, null, 2)}`);
    this.metricsCollector.recordEvent('archive_success', { slug, duration });
  }
  
  logArchiveError(slug: string, duration: number, error: string) {
    this.baseLogger.error(`Archive failed for ${slug} after ${duration}ms: ${error}`);
    this.metricsCollector.recordEvent('archive_error', { slug, duration, error });
  }
  
  logValidationStart(slug: string) {
    this.baseLogger.info(`Starting validation for ${slug}`);
    this.metricsCollector.recordEvent('validation_start', { slug });
  }
  
  logValidationResult(slug: string, duration: number, result: any) {
    if (result.isValid) {
      this.baseLogger.info(`Validation passed for ${slug} in ${duration}ms`);
      this.metricsCollector.recordEvent('validation_success', { slug, duration });
    } else {
      this.baseLogger.warn(`Validation failed for ${slug} in ${duration}ms`);
      result.errors.forEach((error: any) => {
        this.baseLogger.warn(`  ${error.code}: ${error.message}`);
      });
      this.metricsCollector.recordEvent('validation_failure', { 
        slug, 
        duration, 
        errorCount: result.errors.length,
        errorCodes: result.errors.map((e: any) => e.code)
      });
    }
  }
  
  logSecurityEvent(event: string, details: any) {
    this.baseLogger.warn(`Security event: ${event}`, details);
    this.metricsCollector.recordEvent('security_event', { event, details });
  }
  
  logPerformanceMetric(operation: string, duration: number, metadata?: any) {
    this.baseLogger.debug(`Performance: ${operation} took ${duration}ms`);
    this.metricsCollector.recordPerformance(operation, duration, metadata);
  }
}
```

---

*Integration Examples completed: 2025-10-24*  
*Next Review: After Phase 3 implementation*