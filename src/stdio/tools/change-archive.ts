/**
 * change.archive tool implementation
 */

import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { z } from 'zod';
import { BaseTool } from './base.js';
import { ToolResult } from '../types/index.js';
import { canonicalize, validate_slug, release_lock } from '../../utils/core-utilities.js';
import { InputSanitizer } from '../security/input-sanitizer.js';
import { ErrorSanitizer } from '../security/error-sanitizer.js';
import { ChangeStructureValidator, ChangeStructureErrorCode } from '../validation/change-structure-validator.js';

const execFileAsync = promisify(execFile);

// Input schema based on change.archive.input.schema.json
const ChangeArchiveInputSchema = z.object({
  slug: z.string()
});

export class ChangeArchiveTool extends BaseTool {
  readonly definition = {
    name: 'change.archive',
    description: 'Archive a completed change following Phase 1 pseudocode',
    inputSchema: ChangeArchiveInputSchema
  };

  async execute(input: z.infer<typeof ChangeArchiveInputSchema>): Promise<ToolResult> {
    try {
      // Enhanced input sanitization
      const sanitizedInput = InputSanitizer.sanitize(input, {
        maxLength: 1000,
        allowedChars: /^[a-z0-9.\-]+$/
      });

      if (!sanitizedInput.isSafe) {
        this.logger('warn', `Input sanitization issues detected: ${JSON.stringify(sanitizedInput.issues)}`);
        
        // Block critical/high severity issues
        const criticalIssues = sanitizedInput.issues.filter(i => 
          i.severity === 'critical' || i.severity === 'high'
        );
        
        if (criticalIssues.length > 0) {
          const error = new Error(`Input contains security threats: ${criticalIssues.map(i => i.message).join(', ')}`);
          const sanitized = ErrorSanitizer.sanitize(error, {
            context: 'tool',
            userType: 'user',
            logDetails: true
          });
          return this.error(sanitized.message);
        }
      }

      // Use sanitized input
      const safeInput = sanitizedInput.sanitized;

      // Input validation
      if (!validate_slug(safeInput.slug)) {
        const error = new Error(`Invalid slug format: ${safeInput.slug}. Must match pattern: ^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }

      // Validate against input schema
      const schemaResult = ChangeArchiveInputSchema.safeParse(safeInput);
      if (!schemaResult.success) {
        const error = new Error(`Input validation failed: ${schemaResult.error.message}`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }

      this.logger('info', `Starting archive process for change: ${safeInput.slug}`);

      // Path security & existence with additional sanitization
      const repoRoot = this.security.sandboxRoot;
      const changesRoot = path.join(repoRoot, 'openspec', 'changes');
      
      // Sanitize path components
      const pathSanitization = InputSanitizer.sanitizePath(safeInput.slug);
      if (!pathSanitization.isSafe) {
        const error = new Error(`Path traversal detected in slug: ${pathSanitization.issues.map(i => i.message).join(', ')}`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }
      
      const changeRoot = path.join(changesRoot, pathSanitization.sanitized);

      // Canonicalize paths for security
      const canonicalChangeRoot = await canonicalize(changeRoot, false);
      const canonicalOpenspecRoot = await canonicalize(path.join(repoRoot, 'openspec'), false);

      // Security: Ensure path stays within openspec/changes directory
      if (!canonicalChangeRoot.startsWith(canonicalOpenspecRoot)) {
        const error = new Error(`Path traversal detected: ${safeInput.slug} escapes openspec directory`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }

      // Verify change directory exists
      try {
        await fs.access(canonicalChangeRoot);
      } catch {
        const error = new Error(`Change "${safeInput.slug}" does not exist`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }

      // Enhanced change structure validation using ChangeStructureValidator
      const structureValidation = await ChangeStructureValidator.validate(canonicalChangeRoot, {
        context: 'tool',
        securityChecks: true,
        validateOptional: true
      });
      
      if (!structureValidation.isValid) {
        // Format error message with specific error codes and hints
        const errorMessages = structureValidation.errors.map(err => 
          `${err.code}: ${err.message} (${err.hint})`
        ).join('; ');
        
        const error = new Error(`Change structure validation failed: ${errorMessages}`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }
      
      // Log warnings for informational purposes
      if (structureValidation.warnings.length > 0) {
        const warningMessages = structureValidation.warnings.map(w => `${w.code}: ${w.message}`).join('; ');
        this.logger('warn', `Change structure validation warnings: ${warningMessages}`);
      }

      // Check if already archived
      const receiptPath = path.join(canonicalChangeRoot, 'receipt.json');
      try {
        await fs.access(receiptPath);
        const receiptContent = await fs.readFile(receiptPath, 'utf-8');
        const receipt = JSON.parse(receiptContent);
        
        // Return success with alreadyArchived: true
        const output = {
          apiVersion: "1.0",
          slug: safeInput.slug,
          archived: true,
          alreadyArchived: true,
          receipt
        };

        return this.success(`Change "${safeInput.slug}" is already archived.

Archive Details:
- Archived at: ${receipt.archivedAt}
- Receipt: ${receiptPath}

No action taken.`);
      } catch {
        // No receipt exists, proceed with archive
      }

      // Archive execution with command sanitization
      this.logger('info', `Executing openspec archive command for: ${safeInput.slug}`);
       
      try {
        const commandArgs = ['archive', safeInput.slug, '--yes'];
        const sanitizedArgs = InputSanitizer.sanitizeCommandArgs(commandArgs);
        
         if (!sanitizedArgs.isSafe) {
           const error = new Error(`Command arguments contain security threats: ${sanitizedArgs.issues.map(i => i.message).join(', ')}`);
           const sanitized = ErrorSanitizer.sanitize(error, {
             context: 'tool',
             userType: 'user',
             logDetails: true
           });
           return this.error(sanitized.message);
         }
        
        const { stdout, stderr } = await execFileAsync('openspec', sanitizedArgs.sanitized, {
          shell: false,
          cwd: repoRoot
        });
        
        if (stderr && stderr.trim()) {
          this.logger('warn', `Archive command stderr: ${stderr}`);
        }
        
        this.logger('info', `Archive command stdout: ${stdout}`);
      } catch (execError: any) {
        this.logger('error', `Archive command failed: ${execError.message}`);
        const error = new Error(`Failed to execute archive command: ${execError.message}`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }

      // Receipt generation
      const receipt = await this.computeReceipt(canonicalChangeRoot, input.slug);
      
      // Write receipt (note: directory may have been moved by archive command)
      try {
        await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));
        this.logger('info', `Receipt written to: ${receiptPath}`);
      } catch (writeError: any) {
        this.logger('warn', `Failed to write receipt to original location (directory may be archived): ${writeError.message}`);
        // Don't fail the operation - the archive command already succeeded
        // The receipt is informational for the response
      }

      // Lock management
      const lockPath = path.join(canonicalChangeRoot, '.lock');
      try {
        await release_lock(lockPath);
        this.logger('info', `Lock released: ${lockPath}`);
      } catch (lockError: any) {
        this.logger('warn', `Lock release failed (may be stale): ${lockError.message}`);
        // Don't fail the operation if lock release fails
      }

      // Output generation
      const output = {
        apiVersion: "1.0",
        slug: safeInput.slug,
        archived: true,
        alreadyArchived: false,
        receipt
      };

      return this.success(`Successfully archived change "${safeInput.slug}".

Archive Details:
- API Version: ${output.apiVersion}
- Slug: ${output.slug}
- Archived: ${output.archived}
- Already Archived: ${output.alreadyArchived}
- Receipt Path: ${receiptPath}

Receipt Summary:
- Commits: ${receipt.commits?.length || 0}
- Files Touched: ${receipt.filesTouched?.length || 0}
- Tests Added: ${receipt.tests?.added || 0}
- Tests Updated: ${receipt.tests?.updated || 0}
- Tests Passed: ${receipt.tests?.passed || false}
- Archived At: ${receipt.archivedAt}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger('error', `change.archive error: ${errorMessage}`);
      const errorToSanitize = error instanceof Error ? error : new Error(String(error));
      const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
        context: 'tool',
        userType: 'user',
        logDetails: true
      });
      return this.error(sanitized.message);
    }
  }

  /**
   * Validates that the change structure is sane and complete
   * @deprecated Use ChangeStructureValidator.validate instead
   */
  private async validateChangeStructure(changeRoot: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const requiredFiles = ['proposal.md', 'tasks.md'];
      
      for (const file of requiredFiles) {
        const filePath = path.join(changeRoot, file);
        try {
          await fs.access(filePath);
        } catch {
          return { valid: false, reason: `Required file missing: ${file}` };
        }
      }

      // Check that specs directory exists (optional but expected)
      const specsDir = path.join(changeRoot, 'specs');
      try {
        const stats = await fs.stat(specsDir);
        if (!stats.isDirectory()) {
          return { valid: false, reason: 'specs path exists but is not a directory' };
        }
      } catch {
        // specs directory is optional
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, reason: `Structure validation error: ${error.message}` };
    }
  }

  /**
   * Compute receipt following receipt.schema.json structure
   */
  private async computeReceipt(changeRoot: string, slug: string): Promise<any> {
    const archivedAt = new Date().toISOString();
    
    // Get git information with robust error handling
    let commits: string[] = [];
    let gitRange: string | undefined;
    let filesTouched: string[] = [];
    
    try {
      // Try to get git commits related to this change
      const { stdout: commitStdout } = await execFileAsync('git', ['log', '--oneline', '--max-count=10', '--', changeRoot], {
        shell: false,
        timeout: 10000
      });
      commits = commitStdout.trim().split('\n').filter(line => line.trim());
      
      // Get git range with proper error handling
      const { stdout: rangeStdout } = await execFileAsync('git', ['rev-list', '--count', 'HEAD', '--', changeRoot], {
        shell: false,
        timeout: 10000
      });
      const commitCount = parseInt(rangeStdout.trim(), 10);
      if (commitCount > 0) {
        gitRange = `last-${commitCount}`;
      }
      
      // Get files touched with timeout
      const { stdout: filesStdout } = await execFileAsync('git', ['ls-files', changeRoot], {
        shell: false,
        timeout: 10000
      });
      filesTouched = filesStdout.trim().split('\n').filter(file => file.trim());
    } catch (gitError: any) {
      // Git operations failed, log detailed error and continue with empty data
      this.logger('warn', `Git operations failed for receipt generation: ${gitError.message}`);
      this.logger('debug', `Git error details: ${JSON.stringify({
        code: gitError.code,
        signal: gitError.signal,
        stdout: gitError.stdout,
        stderr: gitError.stderr
      })}`);
    }

    // Get real test framework results
    const tests = await this.getTestResults(changeRoot);

    // Actor information
    const actor = {
      type: 'process',
      name: `pid-${process.pid}@${require('os').hostname()}`,
      model: 'task-mcp-server'
    };

    // Tool versions with proper detection
    const toolVersions = await this.getToolVersions();

    return {
      slug,
      commits,
      gitRange,
      filesTouched,
      tests,
      archivedAt,
      actor,
      toolVersions
    };
  }

  /**
   * Get real test results from the test framework
   */
  private async getTestResults(changeRoot: string): Promise<{ added: number; updated: number; passed: boolean }> {
    try {
      // Run test coverage to get real test data
      const { stdout } = await execFileAsync('pnpm', ['run', 'test:coverage', '--', '--reporter=json'], {
        shell: false,
        timeout: 60000,
        cwd: this.security.sandboxRoot
      });

      // Parse vitest JSON output if available
      let testResults: any = {};
      try {
        if (stdout.trim()) {
          testResults = JSON.parse(stdout);
        }
      } catch {
        // If JSON parsing fails, we'll use fallback counting
      }

      // Count test files in the change directory
      const testFiles = await this.countTestFiles(changeRoot);
      
      // Determine if tests passed based on vitest exit code and coverage
      let passed = false;
      try {
        // Run a quick test to check if they pass
        await execFileAsync('pnpm', ['run', 'test', '--', '--run', '--reporter=basic'], {
          shell: false,
          timeout: 30000,
          cwd: this.security.sandboxRoot
        });
        passed = true;
      } catch {
        passed = false;
      }

      return {
        added: testFiles.new,
        updated: testFiles.modified,
        passed
      };
    } catch (testError: any) {
      this.logger('warn', `Test framework integration failed: ${testError.message}`);
      // Fallback to basic counting
      const testFiles = await this.countTestFiles(changeRoot);
      return {
        added: testFiles.new,
        updated: testFiles.modified,
        passed: false // Assume failed if we can't run tests
      };
    }
  }

  /**
   * Count test files in the change directory
   */
  private async countTestFiles(changeRoot: string): Promise<{ new: number; modified: number }> {
    try {
      // Get git status to see what test files are added/modified
      const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', changeRoot], {
        shell: false,
        timeout: 10000
      });

      const lines = stdout.trim().split('\n').filter(line => line.trim());
      let newCount = 0;
      let modifiedCount = 0;

      for (const line of lines) {
        const status = line.substring(0, 2);
        const filePath = line.substring(3);
        
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
          if (status.startsWith('A') || status.startsWith('??')) {
            newCount++;
          } else if (status.startsWith('M') || status.startsWith('R')) {
            modifiedCount++;
          }
        }
      }

      return { new: newCount, modified: modifiedCount };
    } catch {
      return { new: 0, modified: 0 };
    }
  }

  /**
   * Get tool versions with proper detection
   */
  private async getToolVersions(): Promise<Record<string, string>> {
    const versions: Record<string, string> = {};

    try {
      // Get Task MCP version from package.json or environment
      const taskMcpVersion = process.env.TASK_MCP_VERSION || '1.0.0';
      versions['taskMcp'] = taskMcpVersion;

      // Get OpenSpec CLI version
      try {
        const { stdout } = await execFileAsync('openspec', ['--version'], {
          shell: false,
          timeout: 5000
        });
        versions['openspecCli'] = stdout.trim();
      } catch {
        // Fallback to package.json version
        const packageJsonPath = path.join(this.security.sandboxRoot, 'package.json');
        try {
          const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
          versions['openspecCli'] = packageJson.version || 'unknown';
        } catch {
          versions['openspecCli'] = 'unknown';
        }
      }

      // Add tool version
      versions['change.archive'] = '1.0.0';
    } catch (versionError: any) {
      this.logger('warn', `Version detection failed: ${versionError.message}`);
      // Provide fallback versions
      versions['taskMcp'] = '1.0.0';
      versions['openspecCli'] = 'unknown';
      versions['change.archive'] = '1.0.0';
    }

    return versions;
  }
}