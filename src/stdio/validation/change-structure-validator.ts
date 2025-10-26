/**
 * Change Structure Validator
 * 
 * Comprehensive validation utility for OpenSpec change structure that ensures
 * required files exist, have valid content, and follow expected patterns.
 * Integrates with the existing security framework for input sanitization
 * and error handling.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { InputSanitizer } from '../security/input-sanitizer.js';
import { ErrorSanitizer } from '../security/error-sanitizer.js';

// Error codes for change structure validation
export enum ChangeStructureErrorCode {
  // File existence errors
  EBADSHAPE_PROPOSAL_MISSING = 'EBADSHAPE_PROPOSAL_MISSING',
  EBADSHAPE_TASKS_MISSING = 'EBADSHAPE_TASKS_MISSING',
  EBADSHAPE_SPECS_MISSING = 'EBADSHAPE_SPECS_MISSING',
  EBADSHAPE_DIRECTORY_INVALID = 'EBADSHAPE_DIRECTORY_INVALID',
  
  // Content validation errors
  EBADSHAPE_PROPOSAL_INVALID = 'EBADSHAPE_PROPOSAL_INVALID',
  EBADSHAPE_TASKS_INVALID = 'EBADSHAPE_TASKS_INVALID',
  EBADSHAPE_SPECS_INVALID = 'EBADSHAPE_SPECS_INVALID',
  EBADSHAPE_CONTENT_EMPTY = 'EBADSHAPE_CONTENT_EMPTY',
  EBADSHAPE_CONTENT_BINARY = 'EBADSHAPE_CONTENT_BINARY',
  
  // Structure validation errors
  EBADSHAPE_STRUCTURE_MALFORMED = 'EBADSHAPE_STRUCTURE_MALFORMED',
  EBADSHAPE_TASKS_NO_STRUCTURE = 'EBADSHAPE_TASKS_NO_STRUCTURE',
  EBADSHAPE_DELTA_INVALID = 'EBADSHAPE_DELTA_INVALID',
  
  // Security validation errors
  EBADSHAPE_SECURITY_VIOLATION = 'EBADSHAPE_SECURITY_VIOLATION',
  EBADSHAPE_PATH_TRAVERSAL = 'EBADSHAPE_PATH_TRAVERSAL',
  EBADSHAPE_SIZE_EXCEEDED = 'EBADSHAPE_SIZE_EXCEEDED',
  
  // System errors
  EBADSHAPE_IO_ERROR = 'EBADSHAPE_IO_ERROR',
  EBADSHAPE_PERMISSION_DENIED = 'EBADSHAPE_PERMISSION_DENIED',
  EBADSHAPE_UNKNOWN_ERROR = 'EBADSHAPE_UNKNOWN_ERROR'
}

export interface ChangeStructureValidationError {
  code: ChangeStructureErrorCode;
  message: string;
  path?: string;
  hint: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ChangeStructureValidationResult {
  isValid: boolean;
  errors: ChangeStructureValidationError[];
  warnings: ChangeStructureValidationError[];
  summary: {
    totalFiles: number;
    validFiles: number;
    requiredFiles: string[];
    optionalFiles: string[];
  };
}

export interface ChangeStructureValidationOptions {
  /** Maximum file size in bytes (default: 1MB) */
  maxFileSize?: number;
  /** Whether to validate optional files (default: true) */
  validateOptional?: boolean;
  /** Whether to perform security checks (default: true) */
  securityChecks?: boolean;
  /** Custom validation rules */
  customRules?: Array<(content: string, filePath: string) => ChangeStructureValidationError[]>;
  /** Validation context for error handling */
  context?: 'tool' | 'resource' | 'cli' | 'server' | 'core';
}

// Schemas for content validation
const ProposalSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  // Additional proposal validation can be added here
}).passthrough(); // Allow additional fields

const TaskSchema = z.object({
  description: z.string().min(1, 'Task description is required'),
  // Additional task validation can be added here
}).passthrough(); // Allow additional fields

/**
 * Comprehensive change structure validator
 */
export class ChangeStructureValidator {
  private static readonly DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB
  private static readonly REQUIRED_FILES = ['proposal.md', 'tasks.md'];
  private static readonly OPTIONAL_DIRECTORIES = ['specs', 'tests', 'docs'];
  
  /**
   * Validate change structure comprehensively
   */
  static async validate(
    changeRoot: string,
    options: ChangeStructureValidationOptions = {}
  ): Promise<ChangeStructureValidationResult> {
    const errors: ChangeStructureValidationError[] = [];
    const warnings: ChangeStructureValidationError[] = [];
    
    const opts = {
      maxFileSize: options.maxFileSize ?? this.DEFAULT_MAX_FILE_SIZE,
      validateOptional: options.validateOptional ?? true,
      securityChecks: options.securityChecks ?? true,
      customRules: options.customRules ?? [],
      context: options.context ?? 'tool',
      ...options
    };

    try {
      // Security: Validate and sanitize the path
      const pathValidation = this.validateChangePath(changeRoot);
      if (!pathValidation.isValid) {
        errors.push(...pathValidation.errors);
        return {
          isValid: false,
          errors,
          warnings,
          summary: {
            totalFiles: 0,
            validFiles: 0,
            requiredFiles: this.REQUIRED_FILES,
            optionalFiles: []
          }
        };
      }

      // Check if change directory exists and is accessible
      const dirValidation = await this.validateChangeDirectory(changeRoot);
      if (!dirValidation.isValid) {
        errors.push(...dirValidation.errors);
        return {
          isValid: false,
          errors,
          warnings,
          summary: {
            totalFiles: 0,
            validFiles: 0,
            requiredFiles: this.REQUIRED_FILES,
            optionalFiles: []
          }
        };
      }

      // Validate required files
      const requiredValidation = await this.validateRequiredFiles(changeRoot, opts);
      errors.push(...requiredValidation.errors);
      warnings.push(...requiredValidation.warnings);

      // Validate optional directories if requested
      let optionalValidation = { errors: [] as ChangeStructureValidationError[], warnings: [] as ChangeStructureValidationError[] };
      if (opts.validateOptional) {
        optionalValidation = await this.validateOptionalDirectories(changeRoot, opts);
        errors.push(...optionalValidation.errors);
        warnings.push(...optionalValidation.warnings);
      }

      // Validate delta structure if present
      const deltaValidation = await this.validateDeltaStructure(changeRoot, opts);
      errors.push(...deltaValidation.errors);
      warnings.push(...deltaValidation.warnings);

      // Count files for summary
      const summary = await this.generateSummary(changeRoot, errors, warnings);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        summary
      };

    } catch (error) {
      const sanitized = ErrorSanitizer.sanitize(error instanceof Error ? error : new Error(String(error)), {
        context: opts.context,
        userType: 'developer',
        logDetails: true
      });

      errors.push({
        code: ChangeStructureErrorCode.EBADSHAPE_UNKNOWN_ERROR,
        message: sanitized.message,
        hint: 'Unexpected error during validation',
        severity: 'critical'
      });

      return {
        isValid: false,
        errors,
        warnings,
        summary: {
          totalFiles: 0,
          validFiles: 0,
          requiredFiles: this.REQUIRED_FILES,
          optionalFiles: this.OPTIONAL_DIRECTORIES
        }
      };
    }
  }

  /**
   * Validate the change path for security
   */
  private static validateChangePath(changeRoot: string): { isValid: boolean; errors: ChangeStructureValidationError[] } {
    const errors: ChangeStructureValidationError[] = [];
    
    // Only check for traversal patterns in relative paths
    // Absolute paths (starting with / or drive letters) are generally safe
    const isAbsolutePath = path.isAbsolute(changeRoot);
    
    if (!isAbsolutePath) {
      // Check for obvious path traversal patterns in relative paths
      const dangerousPatterns = [
        /\.\.[\/\\]/,        // Directory traversal
        /[\/\\]\.\.[\/\\]?/, // Traversal in middle
        /\x00/,               // Null bytes
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(changeRoot)) {
          errors.push({
            code: ChangeStructureErrorCode.EBADSHAPE_PATH_TRAVERSAL,
            message: `Path traversal pattern detected: ${pattern.source}`,
            path: changeRoot,
            hint: 'Path contains potentially dangerous traversal patterns',
            severity: 'critical'
          });
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate that the change directory exists and is accessible
   */
  private static async validateChangeDirectory(
    changeRoot: string
  ): Promise<{ isValid: boolean; errors: ChangeStructureValidationError[] }> {
    const errors: ChangeStructureValidationError[] = [];
    
    try {
      const stats = await fs.stat(changeRoot);
      if (!stats.isDirectory()) {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_DIRECTORY_INVALID,
          message: 'Change path exists but is not a directory',
          path: changeRoot,
          hint: 'Ensure the change path points to a valid directory',
          severity: 'critical'
        });
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_DIRECTORY_INVALID,
          message: 'Change directory does not exist',
          path: changeRoot,
          hint: 'Create the change directory before validation',
          severity: 'critical'
        });
      } else if (error.code === 'EACCES') {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_PERMISSION_DENIED,
          message: 'Permission denied accessing change directory',
          path: changeRoot,
          hint: 'Check directory permissions',
          severity: 'high'
        });
      } else {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_IO_ERROR,
          message: `IO error accessing directory: ${error.message}`,
          path: changeRoot,
          hint: 'Check file system and directory status',
          severity: 'high'
        });
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate required files exist and have valid content
   */
  private static async validateRequiredFiles(
    changeRoot: string,
    options: ChangeStructureValidationOptions
  ): Promise<{ errors: ChangeStructureValidationError[]; warnings: ChangeStructureValidationError[] }> {
    const errors: ChangeStructureValidationError[] = [];
    const warnings: ChangeStructureValidationError[] = [];

    for (const filename of this.REQUIRED_FILES) {
      const filePath = path.join(changeRoot, filename);
      
      try {
        // Check file existence
        await fs.access(filePath);
        
        // Validate file content
        const contentValidation = await this.validateFileContent(filePath, filename, options);
        errors.push(...contentValidation.errors);
        warnings.push(...contentValidation.warnings);
        
        // File-specific validation
        if (filename === 'proposal.md') {
          const proposalValidation = await this.validateProposalContent(filePath, options);
          errors.push(...proposalValidation.errors);
          warnings.push(...proposalValidation.warnings);
        } else if (filename === 'tasks.md') {
          const tasksValidation = await this.validateTasksContent(filePath, options);
          errors.push(...tasksValidation.errors);
          warnings.push(...tasksValidation.warnings);
        }
        
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          errors.push({
            code: filename === 'proposal.md' 
              ? ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_MISSING
              : ChangeStructureErrorCode.EBADSHAPE_TASKS_MISSING,
            message: `Required file missing: ${filename}`,
            path: filePath,
            hint: `Create ${filename} with appropriate content`,
            severity: 'critical'
          });
        } else if (error.code === 'EACCES') {
          errors.push({
            code: ChangeStructureErrorCode.EBADSHAPE_PERMISSION_DENIED,
            message: `Permission denied accessing: ${filename}`,
            path: filePath,
            hint: 'Check file permissions',
            severity: 'high'
          });
        } else {
          errors.push({
            code: ChangeStructureErrorCode.EBADSHAPE_IO_ERROR,
            message: `IO error accessing ${filename}: ${error.message}`,
            path: filePath,
            hint: 'Check file system and file status',
            severity: 'high'
          });
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate optional directories
   */
  private static async validateOptionalDirectories(
    changeRoot: string,
    options: ChangeStructureValidationOptions
  ): Promise<{ errors: ChangeStructureValidationError[]; warnings: ChangeStructureValidationError[] }> {
    const errors: ChangeStructureValidationError[] = [];
    const warnings: ChangeStructureValidationError[] = [];

    for (const dirname of this.OPTIONAL_DIRECTORIES) {
      const dirPath = path.join(changeRoot, dirname);
      
      try {
        const stats = await fs.stat(dirPath);
        if (!stats.isDirectory()) {
          warnings.push({
            code: ChangeStructureErrorCode.EBADSHAPE_DIRECTORY_INVALID,
            message: `Optional path exists but is not a directory: ${dirname}`,
            path: dirPath,
            hint: `Expected ${dirname} to be a directory`,
            severity: 'low'
          });
        } else {
          // Validate directory contents if it's the specs directory
          if (dirname === 'specs') {
            const specsValidation = await this.validateSpecsDirectory(dirPath, options);
            errors.push(...specsValidation.errors);
            warnings.push(...specsValidation.warnings);
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          warnings.push({
            code: ChangeStructureErrorCode.EBADSHAPE_IO_ERROR,
            message: `Cannot access optional directory ${dirname}: ${error.message}`,
            path: dirPath,
            hint: 'Optional directory access failed',
            severity: 'low'
          });
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate file content for security and structure
   */
  private static async validateFileContent(
    filePath: string,
    filename: string,
    options: ChangeStructureValidationOptions
  ): Promise<{ errors: ChangeStructureValidationError[]; warnings: ChangeStructureValidationError[] }> {
    const errors: ChangeStructureValidationError[] = [];
    const warnings: ChangeStructureValidationError[] = [];

    try {
      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > options.maxFileSize!) {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_SIZE_EXCEEDED,
          message: `File too large: ${filename} (${stats.size} bytes)`,
          path: filePath,
          hint: `Reduce file size to under ${options.maxFileSize} bytes`,
          severity: 'medium'
        });
        return { errors, warnings };
      }

      // Read and validate content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check for empty content
      if (content.trim().length === 0) {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_CONTENT_EMPTY,
          message: `File is empty: ${filename}`,
          path: filePath,
          hint: 'Add appropriate content to the file',
          severity: 'high'
        });
        return { errors, warnings };
      }

      // Security validation if enabled
      if (options.securityChecks) {
        const securityValidation = InputSanitizer.sanitizeFileContent(content, filename, {
          maxLength: options.maxFileSize,
          allowHtml: false,
          allowBinary: false
        });

        if (!securityValidation.isSafe) {
          for (const issue of securityValidation.issues) {
            if (issue.severity === 'critical' || issue.severity === 'high') {
              errors.push({
                code: ChangeStructureErrorCode.EBADSHAPE_SECURITY_VIOLATION,
                message: `Security issue in ${filename}: ${issue.message}`,
                path: filePath,
                hint: 'Remove or sanitize the problematic content',
                severity: issue.severity
              });
            } else {
              warnings.push({
                code: ChangeStructureErrorCode.EBADSHAPE_SECURITY_VIOLATION,
                message: `Security warning in ${filename}: ${issue.message}`,
                path: filePath,
                hint: 'Consider sanitizing the content',
                severity: issue.severity
              });
            }
          }
        }
      }

      // Apply custom validation rules
      for (const rule of options.customRules!) {
        const ruleErrors = rule(content, filePath);
        errors.push(...ruleErrors.filter(e => e.severity === 'critical' || e.severity === 'high'));
        warnings.push(...ruleErrors.filter(e => e.severity === 'low' || e.severity === 'medium'));
      }

    } catch (error: any) {
      if (error.code === 'EISDIR') {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_DIRECTORY_INVALID,
          message: `Expected file but found directory: ${filename}`,
          path: filePath,
          hint: 'Remove directory and create file',
          severity: 'critical'
        });
      } else if (error instanceof SyntaxError && error.message.includes('UTF-8')) {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_CONTENT_BINARY,
          message: `File contains binary or invalid UTF-8 content: ${filename}`,
          path: filePath,
          hint: 'Ensure file contains valid text content',
          severity: 'high'
        });
      } else {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_IO_ERROR,
          message: `Error reading ${filename}: ${error.message}`,
          path: filePath,
          hint: 'Check file format and encoding',
          severity: 'high'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate proposal.md content structure
   */
  private static async validateProposalContent(
    filePath: string,
    options: ChangeStructureValidationOptions
  ): Promise<{ errors: ChangeStructureValidationError[]; warnings: ChangeStructureValidationError[] }> {
    const errors: ChangeStructureValidationError[] = [];
    const warnings: ChangeStructureValidationError[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Basic markdown structure validation
      const lines = content.split('\n');
      const hasTitle = lines.some(line => line.startsWith('#'));
      
      if (!hasTitle) {
        warnings.push({
          code: ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_INVALID,
          message: 'Proposal missing title (should start with #)',
          path: filePath,
          hint: 'Add a title line starting with #',
          severity: 'medium'
        });
      }

      // Check for required sections (can be extended)
      const hasRationale = content.toLowerCase().includes('rationale') || 
                          content.toLowerCase().includes('background');
      
      if (!hasRationale) {
        warnings.push({
          code: ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_INVALID,
          message: 'Proposal missing rationale or background section',
          path: filePath,
          hint: 'Add a rationale section explaining the change',
          severity: 'low'
        });
      }

    } catch (error) {
      // Content reading errors are already handled by validateFileContent
    }

    return { errors, warnings };
  }

  /**
   * Validate tasks.md content structure
   */
  private static async validateTasksContent(
    filePath: string,
    options: ChangeStructureValidationOptions
  ): Promise<{ errors: ChangeStructureValidationError[]; warnings: ChangeStructureValidationError[] }> {
    const errors: ChangeStructureValidationError[] = [];
    const warnings: ChangeStructureValidationError[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Basic task structure validation
      const lines = content.split('\n');
      const hasTasks = lines.some(line => line.match(/^[-*+]\s+/) || line.match(/^\d+\.\s+/));
      
      if (!hasTasks) {
        errors.push({
          code: ChangeStructureErrorCode.EBADSHAPE_TASKS_NO_STRUCTURE,
          message: 'Tasks file has no recognizable task structure',
          path: filePath,
          hint: 'Add tasks using markdown list format (-, *, or numbered)',
          severity: 'high'
        });
      }

      // Check for task descriptions
      const taskLines = lines.filter(line => line.match(/^[-*+]\s+/) || line.match(/^\d+\.\s+/));
      const hasDescriptions = taskLines.some(line => line.length > 10); // Basic description length check
      
      if (!hasDescriptions && taskLines.length > 0) {
        warnings.push({
          code: ChangeStructureErrorCode.EBADSHAPE_TASKS_INVALID,
          message: 'Tasks appear to have minimal descriptions',
          path: filePath,
          hint: 'Add descriptive task details',
          severity: 'medium'
        });
      }

    } catch (error) {
      // Content reading errors are already handled by validateFileContent
    }

    return { errors, warnings };
  }

  /**
   * Validate specs directory content
   */
  private static async validateSpecsDirectory(
    specsPath: string,
    options: ChangeStructureValidationOptions
  ): Promise<{ errors: ChangeStructureValidationError[]; warnings: ChangeStructureValidationError[] }> {
    const errors: ChangeStructureValidationError[] = [];
    const warnings: ChangeStructureValidationError[] = [];

    try {
      const entries = await fs.readdir(specsPath, { withFileTypes: true });
      const specFiles = entries.filter(entry => 
        entry.isFile() && entry.name.endsWith('.md')
      );

      if (specFiles.length === 0) {
        warnings.push({
          code: ChangeStructureErrorCode.EBADSHAPE_SPECS_INVALID,
          message: 'Specs directory exists but contains no markdown files',
          path: specsPath,
          hint: 'Add specification files or remove the directory',
          severity: 'low'
        });
      }

      // Validate each spec file
      for (const specFile of specFiles) {
        const specPath = path.join(specsPath, specFile.name);
        const contentValidation = await this.validateFileContent(specPath, specFile.name, options);
        errors.push(...contentValidation.errors);
        warnings.push(...contentValidation.warnings);
      }

    } catch (error: any) {
      warnings.push({
        code: ChangeStructureErrorCode.EBADSHAPE_IO_ERROR,
        message: `Cannot read specs directory: ${error.message}`,
        path: specsPath,
        hint: 'Check directory permissions',
        severity: 'low'
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate delta structure if present
   */
  private static async validateDeltaStructure(
    changeRoot: string,
    options: ChangeStructureValidationOptions
  ): Promise<{ errors: ChangeStructureValidationError[]; warnings: ChangeStructureValidationError[] }> {
    const errors: ChangeStructureValidationError[] = [];
    const warnings: ChangeStructureValidationError[] = [];

    // Look for delta-related files
    const deltaFiles = ['delta.json', 'delta.yaml', 'delta.yml'];
    
    for (const deltaFile of deltaFiles) {
      const deltaPath = path.join(changeRoot, deltaFile);
      
      try {
        await fs.access(deltaPath);
        
        // Validate delta file content
        if (deltaFile.endsWith('.json')) {
          const content = await fs.readFile(deltaPath, 'utf-8');
          try {
            JSON.parse(content);
          } catch (parseError) {
            errors.push({
              code: ChangeStructureErrorCode.EBADSHAPE_DELTA_INVALID,
              message: `Invalid JSON in delta file: ${deltaFile}`,
              path: deltaPath,
              hint: 'Fix JSON syntax errors',
              severity: 'high'
            });
          }
        }
        
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          warnings.push({
            code: ChangeStructureErrorCode.EBADSHAPE_DELTA_INVALID,
            message: `Cannot validate delta file ${deltaFile}: ${error.message}`,
            path: deltaPath,
            hint: 'Check file format and permissions',
            severity: 'low'
          });
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Generate validation summary
   */
  private static async generateSummary(
    changeRoot: string,
    errors: ChangeStructureValidationError[],
    warnings: ChangeStructureValidationError[]
  ): Promise<ChangeStructureValidationResult['summary']> {
    try {
      const entries = await fs.readdir(changeRoot, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile());
      const directories = entries.filter(entry => entry.isDirectory());
      
      const allPaths = [...files.map(f => f.name), ...directories.map(d => d.name)];
      const requiredPresent = this.REQUIRED_FILES.filter(file => allPaths.includes(file));
      const optionalPresent = this.OPTIONAL_DIRECTORIES.filter(dir => allPaths.includes(dir));

      return {
        totalFiles: files.length,
        validFiles: requiredPresent.length,
        requiredFiles: requiredPresent,
        optionalFiles: optionalPresent
      };
    } catch {
      return {
        totalFiles: 0,
        validFiles: 0,
        requiredFiles: [],
        optionalFiles: []
      };
    }
  }

  /**
   * Get error hint by error code
   */
  static getErrorHint(code: ChangeStructureErrorCode): string {
    const hints: Record<ChangeStructureErrorCode, string> = {
      [ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_MISSING]: 'Create proposal.md with change description and rationale',
      [ChangeStructureErrorCode.EBADSHAPE_TASKS_MISSING]: 'Create tasks.md with implementation tasks',
      [ChangeStructureErrorCode.EBADSHAPE_SPECS_MISSING]: 'Create specs/ directory with specification files',
      [ChangeStructureErrorCode.EBADSHAPE_DIRECTORY_INVALID]: 'Ensure path points to a valid directory',
      [ChangeStructureErrorCode.EBADSHAPE_PROPOSAL_INVALID]: 'Fix proposal structure and content',
      [ChangeStructureErrorCode.EBADSHAPE_TASKS_INVALID]: 'Fix tasks structure and ensure proper format',
      [ChangeStructureErrorCode.EBADSHAPE_SPECS_INVALID]: 'Fix specs directory structure and content',
      [ChangeStructureErrorCode.EBADSHAPE_CONTENT_EMPTY]: 'Add meaningful content to the file',
      [ChangeStructureErrorCode.EBADSHAPE_CONTENT_BINARY]: 'Ensure file contains valid text content',
      [ChangeStructureErrorCode.EBADSHAPE_STRUCTURE_MALFORMED]: 'Fix overall change structure',
      [ChangeStructureErrorCode.EBADSHAPE_TASKS_NO_STRUCTURE]: 'Add tasks in proper markdown list format',
      [ChangeStructureErrorCode.EBADSHAPE_DELTA_INVALID]: 'Fix delta file format and syntax',
      [ChangeStructureErrorCode.EBADSHAPE_SECURITY_VIOLATION]: 'Remove or sanitize security-sensitive content',
      [ChangeStructureErrorCode.EBADSHAPE_PATH_TRAVERSAL]: 'Use safe file paths without traversal',
      [ChangeStructureErrorCode.EBADSHAPE_SIZE_EXCEEDED]: 'Reduce file size within limits',
      [ChangeStructureErrorCode.EBADSHAPE_IO_ERROR]: 'Check file system permissions and status',
      [ChangeStructureErrorCode.EBADSHAPE_PERMISSION_DENIED]: 'Check file and directory permissions',
      [ChangeStructureErrorCode.EBADSHAPE_UNKNOWN_ERROR]: 'Unexpected error occurred during validation'
    };

    return hints[code] || 'Review validation requirements';
  }
}