/**
 * Enhanced TaskMCPResourceProvider with pagination and streaming
 * 
 * Integrates:
 * - PaginationEngine for changes://active endpoints
 * - StreamingResourceReader for change://[slug]/file resources  
 * - URI parsing utilities with security validation
 * - Proper error handling and security validation
 */

import { BaseResourceProvider } from './base.js';
import { ResourceContent, SecurityContext } from '../types/index.js';
import { PaginationEngine, PageRequest } from '../../core/pagination-engine.js';
import { StreamingResourceReader } from './streaming-resource-reader.js';
import { parseUri, isUriSafe, extractChangeFilePath, isChangesActiveUri, isChangeUri } from '../../utils/uri-parser.js';
import { SandboxManager } from '../security/sandbox.js';
import { ErrorSanitizer } from '../security/error-sanitizer.js';
import { validate_slug } from '../../utils/core-utilities.js';
import { promises as fs } from 'fs';
import * as path from 'path';

export class TaskMCPResourceProvider extends BaseResourceProvider {
  readonly definition = {
    uri: 'changes://',
    name: 'Task MCP Resource Provider',
    description: 'Enhanced resource provider with pagination and streaming for changes and change files',
    mimeType: 'application/json'
  };

  private paginationEngine: PaginationEngine;
  private streamingReader: StreamingResourceReader;
  private actualUri: string;

  constructor(
    security: SecurityContext,
    logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void,
    actualUri?: string,
    accessControl?: any
  ) {
    super(security, logger, accessControl);
    this.actualUri = actualUri || this.definition.uri;
    this.paginationEngine = new PaginationEngine();
    this.streamingReader = new StreamingResourceReader();
  }

  /**
   * Handle resource read requests with routing based on URI type
   */
  async read(requestedUri?: string): Promise<ResourceContent> {
    const uriToUse = requestedUri || this.actualUri;
    
    try {
      // Parse and validate URI
      const parsed = parseUri(uriToUse);
      
      // Security check
      if (!isUriSafe(parsed)) {
        const error = new Error(`URI security validation failed: ${JSON.stringify(parsed.security.warnings)}`);
const sanitized = ErrorSanitizer.sanitize(error instanceof Error ? error : new Error(String(error)), {
          context: 'resource',
          userType: 'user',
          logDetails: true
        });
        throw new Error(sanitized.message);
      }

      // Route to appropriate handler
      if (isChangesActiveUri(uriToUse)) {
        return this.handleChangesActive(parsed);
      }
      
      if (isChangeUri(uriToUse)) {
        return this.handleChange(parsed);
      }

      throw new Error(`Unsupported URI scheme: ${parsed.scheme}`);

    } catch (error) {
      // Sanitize and re-throw errors
      const sanitized = ErrorSanitizer.sanitize(error instanceof Error ? error : new Error(String(error)), {
        context: 'resource',
        userType: 'user',
        logDetails: true
      });
      throw new Error(sanitized.message);
    }
  }

  /**
   * Handle changes://active with pagination
   */
  private async handleChangesActive(parsed: any): Promise<ResourceContent> {
    // Validate query parameters for pagination
    const pageRequest: PageRequest = {
      page: parsed.queryParams.page ? parseInt(parsed.queryParams.page) : undefined,
      pageSize: parsed.queryParams.pageSize ? parseInt(parsed.queryParams.pageSize) : undefined,
      nextPageToken: parsed.queryParams.nextPageToken || undefined
    };

    // Validate pagination parameters
    const page = parsed.queryParams.page ? parseInt(parsed.queryParams.page) : undefined;
    const pageSize = parsed.queryParams.pageSize ? parseInt(parsed.queryParams.pageSize) : undefined;

    if (page !== undefined && (isNaN(page) || page < 1)) {
      throw new Error('Invalid page parameter: must be a positive integer');
    }

    if (pageSize !== undefined && (isNaN(pageSize) || pageSize < 1 || pageSize > 100)) {
      throw new Error('Invalid pageSize parameter: must be between 1 and 100');
    }

    try {
      const result = await this.paginationEngine.paginate(
        this.security.sandboxRoot,
        pageRequest
      );

      // Enhance result with metadata
      const enhancedResult = {
        ...result,
        uri: 'changes://active',
        generated: new Date().toISOString(),
        pagination: {
          currentPage: result.page,
          pageSize: result.pageSize,
          totalItems: result.totalItems,
          totalPages: result.totalPages,
          hasMore: result.hasMore,
          nextPageToken: result.nextPageToken,
          previousPageToken: result.previousPageToken
        }
      };

      return this.success(JSON.stringify(enhancedResult, null, 2), 'application/json');

    } catch (error) {
      this.logger('error', `Failed to paginate changes: ${error}`);
      throw new Error(`Failed to retrieve changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle change://[slug]/[file] with streaming
   */
  private async handleChange(parsed: any): Promise<ResourceContent> {
    if (parsed.pathSegments.length === 0) {
      throw new Error('Change URI must include a slug');
    }

    const slug = parsed.pathSegments[0];

    // Validate slug format
    if (!validate_slug(slug)) {
      throw new Error(`Invalid slug format: ${slug}`);
    }

    const changeDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug);
    
    // Check access control for change directory
    await this.checkAccess('read', changeDir);

    // Verify change directory exists
    const sandbox = new SandboxManager(this.security);
    const changeExists = await sandbox.checkFileOperation('read', changeDir);
    if (!changeExists.isValid) {
      throw new Error(`Change not found: ${slug}`);
    }

    // If no file path specified, return change metadata
    if (parsed.pathSegments.length === 1) {
      return this.getChangeMetadata(slug, changeDir);
    }

    // Extract file path from URI
    const filePath = extractChangeFilePath(parsed);
    const fullPath = path.join(changeDir, filePath);

    // Security: validate path is within change directory
    try {
      const canonicalPath = await fs.realpath(fullPath);
      const canonicalChangeRoot = await fs.realpath(changeDir);
      
      if (!canonicalPath.startsWith(canonicalChangeRoot)) {
        throw new Error('Path traversal attempt blocked');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Path traversal')) {
        throw error;
      }
      // If realpath fails, do path-based validation as fallback
      if (fullPath.includes('..') || fullPath.includes('~') || fullPath.includes('\0')) {
        throw new Error('Path traversal attempt blocked');
      }
    }

    // Check access control for specific file
    await this.checkAccess('read', fullPath);

    // Use streaming reader
    try {
      const contents = await this.streamingReader.readResource(fullPath);
      
      // Determine MIME type from parsed URI or fallback
      const mimeType = parsed.mimeType || this.getMimeType(filePath);

      if (typeof contents === 'string') {
        // Small file: return directly
        return this.success(contents, mimeType);
      } else {
        // Large file: create streaming response
        // For now, convert to string since ResourceContent expects text/blob
        // In a full implementation, this would support streaming generators
        let streamedContent = '';
        for await (const chunk of contents) {
          streamedContent += chunk;
        }
        // Use binary method for large content to avoid sanitization limits
        return this.binary(streamedContent, mimeType);
      }

    } catch (error) {
      this.logger('error', `Failed to read file ${filePath}: ${error}`);
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get change metadata
   */
  private async getChangeMetadata(slug: string, changeDir: string): Promise<ResourceContent> {
    try {
      const sandbox = new SandboxManager(this.security);
      
      // Read change manifest if exists
      const manifestPath = path.join(changeDir, 'openspec.json');
      let manifest: any = {};
      
      try {
        const manifestResult = await sandbox.readFile(manifestPath);
        if (manifestResult.validation.isValid) {
          manifest = JSON.parse(manifestResult.content);
        }
      } catch {
        // Manifest not found or invalid, use defaults
      }

      // List files in change directory
      let files: string[] = [];
      try {
        const entries = await fs.readdir(changeDir, { withFileTypes: true });
        files = entries
          .filter(entry => entry.isFile())
          .map(entry => entry.name);
      } catch {
        // Directory listing failed, use empty array
      }

      // Get directory stats
      const stats = await fs.stat(changeDir);

      const metadata = {
        slug,
        manifest,
        files,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        uri: `change://${slug}`,
        generated: new Date().toISOString()
      };

      return this.success(JSON.stringify(metadata, null, 2), 'application/json');

    } catch (error) {
      this.logger('error', `Failed to get change metadata for ${slug}: ${error}`);
      throw new Error(`Failed to get change metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if the resource exists
   */
  async exists(): Promise<boolean> {
    try {
      const uriToUse = this.actualUri;
      const parsed = parseUri(uriToUse);

      if (isChangesActiveUri(uriToUse)) {
        // changes://active always exists if we can read the changes directory
        const changesPath = path.join(this.security.sandboxRoot, 'openspec', 'changes');
        try {
          await fs.access(changesPath);
          return true;
        } catch {
          return false;
        }
      }

      if (isChangeUri(uriToUse)) {
        if (parsed.pathSegments.length === 0) {
          return false;
        }

        const slug = parsed.pathSegments[0];
        if (!validate_slug(slug)) {
          return false;
        }

        const changeDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug);
        
        try {
          await fs.access(changeDir);
          
          // If file path specified, check specific file
          if (parsed.pathSegments.length > 1) {
            const filePath = extractChangeFilePath(parsed);
            const fullPath = path.join(changeDir, filePath);
            await fs.access(fullPath);
          }
          
          return true;
        } catch {
          return false;
        }
      }

      return false;

    } catch {
      return false;
    }
  }

  /**
   * Get resource metadata
   */
  async getMetadata(): Promise<Record<string, any>> {
    try {
      const uriToUse = this.actualUri;
      const parsed = parseUri(uriToUse);

      if (isChangesActiveUri(uriToUse)) {
        return {
          uri: uriToUse,
          type: 'changes-collection',
          scheme: 'changes',
          supportsPagination: true,
          supportedQueryParams: ['page', 'pageSize', 'nextPageToken'],
          exists: await this.exists()
        };
      }

      if (isChangeUri(uriToUse)) {
        if (parsed.pathSegments.length === 0) {
          return {
            uri: uriToUse,
            type: 'change-root',
            scheme: 'change',
            exists: false,
            error: 'Missing slug'
          };
        }

        const slug = parsed.pathSegments[0];
        const changeDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug);
        
        if (parsed.pathSegments.length === 1) {
          // Change metadata
          const exists = await this.exists();
          let stats: any = null;
          
          if (exists) {
            try {
              stats = await fs.stat(changeDir);
            } catch {
              // Stats failed, but directory exists
            }
          }

          return {
            uri: uriToUse,
            type: 'change',
            slug,
            scheme: 'change',
            exists,
            created: stats?.birthtime?.toISOString(),
            modified: stats?.mtime?.toISOString(),
            path: changeDir
          };
        } else {
          // File metadata
          const filePath = extractChangeFilePath(parsed);
          const fullPath = path.join(changeDir, filePath);
          const exists = await this.exists();
          let stats: any = null;
          
          if (exists) {
            try {
              stats = await fs.stat(fullPath);
            } catch {
              // Stats failed, but file exists
            }
          }

          return {
            uri: uriToUse,
            type: 'file',
            slug,
            filePath,
            scheme: 'change',
            mimeType: parsed.mimeType || this.getMimeType(filePath),
            exists,
            size: stats?.size,
            created: stats?.birthtime?.toISOString(),
            modified: stats?.mtime?.toISOString(),
            path: fullPath
          };
        }
      }

      return {
        uri: uriToUse,
        type: 'unknown',
        exists: false,
        error: 'Unsupported URI scheme'
      };

    } catch (error) {
      return {
        uri: this.actualUri,
        type: 'error',
        exists: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Determine MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.diff': 'text/plain',
      '.patch': 'text/plain'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}