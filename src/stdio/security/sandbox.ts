/**
 * Sandbox enforcement for file operations
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { SecurityContext, ValidationResult } from '../types/index.js';
import { validatePath, sanitizePath } from './path-protection.js';

/**
 * Sandbox manager for enforcing security policies
 */
export class SandboxManager {
  constructor(private security: SecurityContext) {}

  /**
   * Check if a file operation is allowed
   */
  async checkFileOperation(operation: 'read' | 'write' | 'delete', filePath: string): Promise<ValidationResult> {
    // Sanitize path
    const sanitizedPath = sanitizePath(filePath);
    
    // Validate path is within allowed boundaries
    const pathValidation = await validatePath(sanitizedPath, this.security);
    if (!pathValidation.isValid) {
      return pathValidation;
    }

    // Additional checks based on operation type
    switch (operation) {
      case 'read':
        return this.checkReadAccess(sanitizedPath);
      
      case 'write':
        return this.checkWriteAccess(sanitizedPath);
      
      case 'delete':
        return this.checkDeleteAccess(sanitizedPath);
      
      default:
        return {
          isValid: false,
          errors: [{
            path: sanitizedPath,
            message: `Unknown operation: ${operation}`,
            code: 'UNKNOWN_OPERATION'
          }]
        };
    }
  }

  /**
   * Safely read a file within the sandbox
   */
  async readFile(filePath: string): Promise<{ content: string; validation: ValidationResult }> {
    const validation = await this.checkFileOperation('read', filePath);
    
    if (!validation.isValid) {
      return { content: '', validation };
    }

    try {
      const stats = await fs.stat(filePath);
      
      // Check file size
      if (stats.size > this.security.maxFileSize) {
        return {
          content: '',
          validation: {
            isValid: false,
            errors: [{
              path: filePath,
              message: `File size ${stats.size} exceeds maximum ${this.security.maxFileSize}`,
              code: 'FILE_TOO_LARGE'
            }]
          }
        };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return { content, validation: { isValid: true, errors: [] } };
      
    } catch (error) {
      return {
        content: '',
        validation: {
          isValid: false,
          errors: [{
            path: filePath,
            message: `Read failed: ${error instanceof Error ? error.message : String(error)}`,
            code: 'READ_ERROR'
          }]
        }
      };
    }
  }

  /**
   * Safely write a file within the sandbox
   */
  async writeFile(filePath: string, content: string): Promise<ValidationResult> {
    const validation = await this.checkFileOperation('write', filePath);
    
    if (!validation.isValid) {
      return validation;
    }

    try {
      // Check content size
      if (content.length > this.security.maxFileSize) {
        return {
          isValid: false,
          errors: [{
            path: filePath,
            message: `Content size ${content.length} exceeds maximum ${this.security.maxFileSize}`,
            code: 'CONTENT_TOO_LARGE'
          }]
        };
      }

      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(filePath, content, 'utf-8');
      return { isValid: true, errors: [] };
      
    } catch (error) {
      return {
        isValid: false,
        errors: [{
          path: filePath,
          message: `Write failed: ${error instanceof Error ? error.message : String(error)}`,
          code: 'WRITE_ERROR'
        }]
      };
    }
  }

  /**
   * Safely delete a file within the sandbox
   */
  async deleteFile(filePath: string): Promise<ValidationResult> {
    const validation = await this.checkFileOperation('delete', filePath);
    
    if (!validation.isValid) {
      return validation;
    }

    try {
      await fs.unlink(filePath);
      return { isValid: true, errors: [] };
      
    } catch (error) {
      return {
        isValid: false,
        errors: [{
          path: filePath,
          message: `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          code: 'DELETE_ERROR'
        }]
      };
    }
  }

  /**
   * Join paths safely within sandbox
   */
  joinPath(...paths: string[]): string {
    return path.join(...paths);
  }

  /**
   * List files in a directory within the sandbox
   */
  async listFiles(dirPath: string): Promise<{ files: string[]; validation: ValidationResult }> {
    const validation = await this.checkFileOperation('read', dirPath);
    
    if (!validation.isValid) {
      return { files: [], validation };
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = entries
        .map(entry => path.join(dirPath, entry.name));
      
      return { files, validation: { isValid: true, errors: [] } };
      
    } catch (error) {
      return {
        files: [],
        validation: {
          isValid: false,
          errors: [{
            path: dirPath,
            message: `List failed: ${error instanceof Error ? error.message : String(error)}`,
            code: 'LIST_ERROR'
          }]
        }
      };
    }
  }

  private async checkReadAccess(filePath: string): Promise<ValidationResult> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      return { isValid: true, errors: [] };
    } catch {
      return {
        isValid: false,
        errors: [{
          path: filePath,
          message: 'File not readable or does not exist',
          code: 'READ_ACCESS_DENIED'
        }]
      };
    }
  }

  private async checkWriteAccess(filePath: string): Promise<ValidationResult> {
    try {
      // Check if parent directory is writable
      const dir = path.dirname(filePath);
      await fs.access(dir, fs.constants.W_OK);
      return { isValid: true, errors: [] };
    } catch {
      return {
        isValid: false,
        errors: [{
          path: filePath,
          message: 'Directory not writable',
          code: 'WRITE_ACCESS_DENIED'
        }]
      };
    }
  }

  private async checkDeleteAccess(filePath: string): Promise<ValidationResult> {
    try {
      await fs.access(filePath, fs.constants.W_OK);
      return { isValid: true, errors: [] };
    } catch {
      return {
        isValid: false,
        errors: [{
          path: filePath,
          message: 'File not deletable or does not exist',
          code: 'DELETE_ACCESS_DENIED'
        }]
      };
    }
  }
}