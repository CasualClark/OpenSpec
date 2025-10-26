/**
 * Base resource provider for Task MCP
 */

import { ResourceDefinition, ResourceContent, SecurityContext, UserIdentity } from '../types/index.js';
import { AccessControlEngine } from '../security/access-control.js';
import { InputSanitizer } from '../security/input-sanitizer.js';

export abstract class BaseResourceProvider {
  abstract readonly definition: ResourceDefinition;
  protected accessControl?: AccessControlEngine;
  
  constructor(
    protected security: SecurityContext,
    protected logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void,
    accessControl?: AccessControlEngine
  ) {
    this.accessControl = accessControl;
  }

  /**
   * Read resource content
   */
  abstract read(requestedUri?: string): Promise<ResourceContent>;

  /**
   * Check if the resource exists
   */
  abstract exists(): Promise<boolean>;

  /**
   * Get resource metadata
   */
  abstract getMetadata(): Promise<Record<string, any>>;

  /**
   * Check access control before resource access
   */
  protected async checkAccess(action: 'read' | 'write' | 'delete' | 'list', resourcePath?: string): Promise<void> {
    if (!this.accessControl || !this.security.user) {
      // No access control or user context - allow for backward compatibility
      return;
    }

    try {
      await this.accessControl.enforce(
        this.security.user,
        this.definition.uri,
        action,
        resourcePath
      );
    } catch (error) {
      throw new Error(`Access denied: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create error response
   */
  protected error(message: string, details?: any): never {
    throw new Error(message);
  }

  /**
   * Create a successful resource content with sanitization
   */
  protected success(text: string, mimeType?: string): ResourceContent {
    // Sanitize content before returning
    const sanitized = InputSanitizer.sanitize(text, {
      maxLength: 1000000, // 1MB limit for resource content
      allowHtml: mimeType?.includes('html') ?? false
    });

    if (!sanitized.isSafe) {
      this.logger('warn', `Resource content sanitization issues: ${JSON.stringify(sanitized.issues)}`);
    }

    return {
      uri: this.definition.uri,
      mimeType: mimeType || 'text/plain',
      text: sanitized.sanitized
    };
  }

  /**
   * Create a binary resource content with validation
   */
  protected binary(data: string, mimeType: string): ResourceContent {
    // For binary content, we still do basic validation
    const sanitized = InputSanitizer.sanitize(data, {
      maxLength: 10000000, // 10MB limit for binary
      allowBinary: true
    });

    if (!sanitized.isSafe) {
      this.logger('warn', `Binary resource validation issues: ${JSON.stringify(sanitized.issues)}`);
    }

    return {
      uri: this.definition.uri,
      mimeType,
      blob: sanitized.sanitized
    };
  }

  /**
   * Sanitize file content before reading
   */
  protected sanitizeFileContent(content: string, filename: string): string {
    const result = InputSanitizer.sanitizeFileContent(content, filename);
    
    if (!result.isSafe) {
      this.logger('warn', `File content sanitization issues for ${filename}: ${JSON.stringify(result.issues)}`);
    }

    return result.sanitized;
  }

  /**
   * Sanitize metadata fields
   */
  protected sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const result = InputSanitizer.sanitizeMetadata(metadata);
    
    if (!result.isSafe) {
      this.logger('warn', `Metadata sanitization issues: ${JSON.stringify(result.issues)}`);
    }

    return result.sanitized;
  }
}