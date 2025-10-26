/**
 * Path traversal protection utilities
 */

import { canonicalize } from '../../utils/core-utilities.js';
import { SecurityContext, ValidationResult } from '../types/index.js';

/**
 * Check if a path is safe and within allowed boundaries
 */
export async function validatePath(
  inputPath: string, 
  security: SecurityContext
): Promise<ValidationResult> {
  try {
    // Canonicalize the path
    const canonicalPath = await canonicalize(inputPath, false);
    
    // Check if path is within allowed paths
    const isAllowed = security.allowedPaths.some(allowed => 
      canonicalPath.startsWith(allowed)
    );
    
    if (!isAllowed) {
      return {
        isValid: false,
        errors: [{
          path: inputPath,
          message: `Path not within allowed boundaries: ${canonicalPath}`,
          code: 'PATH_TRAVERSAL'
        }]
      };
    }

    // Check if path is within sandbox root
    if (!canonicalPath.startsWith(security.sandboxRoot)) {
      return {
        isValid: false,
        errors: [{
          path: inputPath,
          message: `Path not within sandbox root: ${canonicalPath}`,
          code: 'SANDBOX_VIOLATION'
        }]
      };
    }

    return { isValid: true, errors: [] };
    
  } catch (error) {
    return {
      isValid: false,
      errors: [{
        path: inputPath,
        message: `Path validation failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'PATH_VALIDATION_ERROR'
      }]
    };
  }
}

/**
 * Sanitize a path to prevent directory traversal
 */
export function sanitizePath(inputPath: string): string {
  // Remove any null bytes
  let sanitized = inputPath.replace(/\0/g, '');
  
  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, '/');
  
  // Remove any relative path components that could lead to traversal
  const parts = sanitized.split('/').filter(part => part !== '..' && part !== '.');
  
  return parts.join('/');
}

/**
 * Check if a file size exceeds the maximum allowed
 */
export function validateFileSize(size: number, maxSize: number): ValidationResult {
  if (size > maxSize) {
    return {
      isValid: false,
      errors: [{
        path: 'file_size',
        message: `File size ${size} exceeds maximum allowed ${maxSize}`,
        code: 'FILE_SIZE_EXCEEDED'
      }]
    };
  }
  
  return { isValid: true, errors: [] };
}

/**
 * Check if a file extension is allowed (basic implementation)
 */
export function validateFileExtension(filePath: string, allowedExtensions?: string[]): ValidationResult {
  if (!allowedExtensions || allowedExtensions.length === 0) {
    return { isValid: true, errors: [] };
  }
  
  const extension = filePath.split('.').pop()?.toLowerCase();
  
  if (!extension || !allowedExtensions.includes(extension)) {
    return {
      isValid: false,
      errors: [{
        path: filePath,
        message: `File extension .${extension} not allowed. Allowed: ${allowedExtensions.join(', ')}`,
        code: 'INVALID_FILE_EXTENSION'
      }]
    };
  }
  
  return { isValid: true, errors: [] };
}