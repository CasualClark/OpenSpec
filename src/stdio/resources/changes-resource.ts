/**
 * Changes collection resource provider for Task MCP
 */

import { BaseResourceProvider } from './base.js';
import { ResourceContent, SecurityContext } from '../types/index.js';
import { SandboxManager } from '../security/sandbox.js';
import { validate_slug } from '../../utils/core-utilities.js';
import { ErrorSanitizer } from '../security/error-sanitizer.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

interface PaginationParams {
  page?: number;
  pageSize?: number;
}

interface PaginationResult {
  changes: any[];
  total: number;
  hasNextPage: boolean;
  nextPageToken?: string;
  generated: string;
}

interface LocalValidationError {
  code: string;
  message: string;
  field?: string;
  correlationId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  retryable?: boolean;
  actions?: string[];
}

export class ChangesResourceProvider extends BaseResourceProvider {
  readonly definition = {
    uri: 'changes://',
    name: 'Changes Collection Resource',
    description: 'List and access all active changes in the openspec/changes directory with pagination support',
    mimeType: 'application/json'
  };

  private actualUri: string;

  constructor(
    security: SecurityContext,
    logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void,
    actualUri?: string,
    accessControl?: any
  ) {
    super(security, logger, accessControl);
    this.actualUri = actualUri || this.definition.uri;
  }

  async read(requestedUri?: string): Promise<ResourceContent> {
    // Check access control
    await this.checkAccess('read', path.join(this.security.sandboxRoot, 'openspec', 'changes'));

    const sandbox = new SandboxManager(this.security);
    const changesDir = path.join(this.security.sandboxRoot, 'openspec', 'changes');
    
    // Parse pagination parameters
    const pagination = this.parsePaginationParams(requestedUri);
    
    // Validate pagination parameters (only if pagination is actually being used)
    const isPaginationRequest = this.isPaginationRequest(requestedUri);
    if (isPaginationRequest) {
      const validationError = this.validatePaginationParams(pagination);
      if (validationError) {
        const error = new Error(validationError.message);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'resource',
          userType: 'user',
          logDetails: true
        });
        
        // Create enhanced error with correlation ID and actions
        const enhancedError = new Error(sanitized.message);
        (enhancedError as any).code = validationError.code;
        (enhancedError as any).correlationId = validationError.correlationId;
        (enhancedError as any).severity = validationError.severity;
        (enhancedError as any).actions = validationError.actions;
        (enhancedError as any).field = validationError.field;
        
        throw enhancedError;
      }
    }
    
    // Check if changes directory exists
    const existsCheck = await sandbox.checkFileOperation('read', changesDir);
    if (!existsCheck.isValid) {
      const emptyResult: PaginationResult = {
        changes: [],
        total: 0,
        hasNextPage: false,
        generated: new Date().toISOString()
      };
      return this.success(JSON.stringify(emptyResult, null, 2), 'application/json');
    }

    try {
      // List all change directories
      const listResult = await sandbox.listFiles(changesDir);
      if (!listResult.validation.isValid) {
        const error = new Error(`Failed to list changes directory: ${listResult.validation.errors.map(e => e.message).join(', ')}`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'resource',
          userType: 'user',
          logDetails: true
        });
        throw new Error(sanitized.message);
      }

      // Filter to directories only and validate slugs
      const allFiles = listResult.files;
      const changeEntries = [];
      
      for (const filePath of allFiles) {
        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            changeEntries.push(filePath);
          }
        } catch {
          // Skip files that can't be stated
        }
      }

      const changes = await Promise.all(
        changeEntries.map(async (changePath) => {
          const slug = path.basename(changePath);
          
          // Validate slug format and exclude special directories
          if (!validate_slug(slug) || slug === 'archive') {
            this.logger('warn', `Invalid slug format or special directory: ${slug}`);
            return null;
          }

          try {
            // Get directory stats
            const stats = await fs.stat(changePath);
            
            // Read proposal for title extraction
            let title = slug;
            let description = '';
            let hasProposal = false;
            let hasLock = false;
            let lockInfo = null;
            let specCount = 0;
            let taskCount = 0;
            let deltaCount = 0;

            // Check for proposal.md
            const proposalPath = path.join(changePath, 'proposal.md');
            try {
              const proposalResult = await sandbox.readFile(proposalPath);
              if (proposalResult.validation.isValid) {
                hasProposal = true;
                // Extract title from first line of proposal
                const lines = proposalResult.content.split('\n');
                const firstLine = lines.find(line => line.trim().startsWith('# '));
                if (firstLine) {
                  title = firstLine.replace(/^#\s+/, '').trim();
                }
                // Extract description (first paragraph after title)
                const descStart = lines.findIndex(line => line.trim().length > 0 && !line.startsWith('#'));
                if (descStart >= 0) {
                  const descLines = [];
                  for (let i = descStart; i < lines.length; i++) {
                    if (lines[i].trim().length === 0) break;
                    if (lines[i].startsWith('#')) break;
                    descLines.push(lines[i].trim());
                  }
                  description = descLines.join(' ').substring(0, 200) + (descLines.join(' ').length > 200 ? '...' : '');
                }
              }
            } catch {
              // Proposal doesn't exist or can't be read
            }

            // Check for lock
            const lockPath = path.join(changePath, '.lock');
            try {
              const lockResult = await sandbox.readFile(lockPath);
              if (lockResult.validation.isValid) {
                hasLock = true;
                try {
                  lockInfo = JSON.parse(lockResult.content);
                } catch {
                  // Lock file is malformed
                }
              }
            } catch {
              // No lock file
            }

            // Count specs
            const specsPath = path.join(changePath, 'specs');
            try {
              const specsResult = await sandbox.listFiles(specsPath);
              if (specsResult.validation.isValid) {
                specCount = specsResult.files.filter(file => file.endsWith('.md')).length;
              }
            } catch {
              // Specs directory doesn't exist
            }

            // Count tasks
            const tasksPath = path.join(changePath, 'tasks');
            try {
              const tasksResult = await sandbox.listFiles(tasksPath);
              if (tasksResult.validation.isValid) {
                taskCount = tasksResult.files.filter(file => file.endsWith('.json')).length;
              }
            } catch {
              // Tasks directory doesn't exist
            }

            // Count deltas
            const deltasPath = path.join(changePath, 'deltas');
            try {
              const deltasResult = await sandbox.listFiles(deltasPath);
              if (deltasResult.validation.isValid) {
                deltaCount = deltasResult.files.filter(file => file.endsWith('.diff')).length;
              }
            } catch {
              // Deltas directory doesn't exist
            }

            return {
              slug,
              title,
              description,
              path: changePath,
              created: stats.birthtime.toISOString(),
              modified: stats.mtime.toISOString(),
              hasProposal,
              hasLock,
              lockInfo,
              specCount,
              taskCount,
              deltaCount,
              status: this.determineStatus(hasLock, hasProposal, taskCount, specCount)
            };
          } catch (error) {
            this.logger('error', `Failed to process change ${slug}: ${error}`);
            const errorToSanitize = error instanceof Error ? error : new Error(String(error));
            const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
              context: 'resource',
              userType: 'developer',
              logDetails: true
            });
            return {
              slug,
              title: slug,
              description: '',
              path: '[sanitized-path]',
              created: new Date(0).toISOString(),
              modified: new Date(0).toISOString(),
              hasProposal: false,
              hasLock: false,
              lockInfo: null,
              specCount: 0,
              taskCount: 0,
              deltaCount: 0,
              status: 'error',
              error: sanitized.message
            };
          }
        })
      );

      // Filter out null entries
      const validChanges = changes.filter(change => change !== null);
      
      // Apply stable sorting
      const sortedChanges = this.stableSortChanges(validChanges);

    // Check if this is a pagination request for changes://active
    const isPaginationRequest = this.isPaginationRequest(requestedUri);
      
      if (isPaginationRequest) {
        // Apply pagination
        const paginatedResult = this.applyPagination(sortedChanges, pagination);
        return this.success(JSON.stringify(paginatedResult, null, 2), 'application/json');
      } else {
        // Backward compatibility: return all changes for existing calls
        const result = {
          changes: sortedChanges,
          total: sortedChanges.length,
          generated: new Date().toISOString()
        };
        return this.success(JSON.stringify(result, null, 2), 'application/json');
      }
      
    } catch (error) {
      this.logger('error', `Failed to read changes: ${error}`);
      const errorToSanitize = error instanceof Error ? error : new Error(String(error));
      const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
        context: 'resource',
        userType: 'user',
        logDetails: true
      });
      throw new Error(sanitized.message);
    }
  }

  async exists(): Promise<boolean> {
    // Check access control
    await this.checkAccess('read', path.join(this.security.sandboxRoot, 'openspec', 'changes'));

    const changesDir = path.join(this.security.sandboxRoot, 'openspec', 'changes');
    const sandbox = new SandboxManager(this.security);
    const check = await sandbox.checkFileOperation('read', changesDir);
    return check.isValid;
  }

  async getMetadata(): Promise<Record<string, any>> {
    // Check access control
    await this.checkAccess('read', path.join(this.security.sandboxRoot, 'openspec', 'changes'));

    const changesDir = path.join(this.security.sandboxRoot, 'openspec', 'changes');
    
    try {
      const stats = await fs.stat(changesDir);
      const sandbox = new SandboxManager(this.security);
      const listResult = await sandbox.listFiles(changesDir);
      
      let changeCount = 0;
      if (listResult.validation.isValid) {
        // Count directories that are valid changes
        const entries = await Promise.all(
          listResult.files.map(async (filePath) => {
            try {
              const fileStats = await fs.stat(filePath);
              if (fileStats.isDirectory()) {
                const slug = path.basename(filePath);
                return validate_slug(slug) ? 1 : 0;
              }
            } catch {
              return 0;
            }
            return 0;
          })
        );
        changeCount = entries.reduce((sum: number, count) => sum + count, 0);
      }

      return {
        path: changesDir,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        changeCount,
        type: 'changes-collection'
      };
    } catch {
      return {
        path: changesDir,
        exists: false,
        changeCount: 0,
        type: 'changes-collection'
      };
    }
  }

  private determineStatus(hasLock: boolean, hasProposal: boolean, taskCount: number, specCount: number): string {
    if (hasLock) {
      return 'locked';
    }
    if (!hasProposal) {
      return 'draft';
    }
    if (taskCount === 0) {
      return 'planned';
    }
    if (specCount === 0) {
      return 'in-progress';
    }
    return 'complete';
  }

  /**
   * Check if the request is for pagination (changes://active)
   */
  private isPaginationRequest(requestedUri?: string): boolean {
    const uriToUse = requestedUri || this.actualUri;
    return uriToUse.includes('changes://active');
  }

  /**
   * Parse pagination parameters from URI
   * Supports: changes://active?page=1&pageSize=20
   */
  private parsePaginationParams(requestedUri?: string): PaginationParams {
    const uriToUse = requestedUri || this.actualUri;
    
    // Default values for backward compatibility
    const params: PaginationParams = {
      page: 1,
      pageSize: 50 // Reasonable default
    };

    // Check if this is a pagination request
    if (!this.isPaginationRequest(uriToUse)) {
      return params; // Return defaults for non-active requests
    }

    try {
      // Parse query parameters manually since URL constructor expects full URLs
      const queryStart = uriToUse.indexOf('?');
      if (queryStart === -1) {
        return params;
      }

      const queryString = uriToUse.substring(queryStart + 1);
      const urlParams = new URLSearchParams(queryString);
      
      const pageParam = urlParams.get('page');
      const pageSizeParam = urlParams.get('pageSize');

      if (pageParam !== null) {
        const page = parseInt(pageParam, 10);
        if (!isNaN(page)) {
          params.page = page;
        }
      }

      if (pageSizeParam !== null) {
        const pageSize = parseInt(pageSizeParam, 10);
        if (!isNaN(pageSize)) {
          params.pageSize = pageSize;
        }
      }
    } catch (error) {
      // If URI parsing fails, return defaults
      this.logger('warn', `Failed to parse pagination params from ${uriToUse}: ${error}`);
    }

    return params;
  }

  /**
   * Validate pagination parameters with enhanced error handling
   */
  private validatePaginationParams(params: PaginationParams): LocalValidationError | null {
    // Generate correlation ID for this validation
    const correlationId = this.generateCorrelationId();
    
    if (params.page !== undefined && params.page < 1) {
      return {
        code: 'INVALID_PAGE',
        message: 'Page number must be greater than 0',
        field: 'page',
        correlationId,
        severity: 'medium',
        retryable: false,
        actions: ['Provide a page number greater than 0', 'Use page 1 for the first page']
      };
    }

    if (params.pageSize !== undefined) {
      if (params.pageSize < 1) {
        return {
          code: 'INVALID_PAGE_SIZE',
          message: 'Page size must be at least 1',
          field: 'pageSize',
          correlationId,
          severity: 'medium',
          retryable: false,
          actions: ['Provide a page size of at least 1', 'Use default page size of 50']
        };
      }
      if (params.pageSize > 1000) {
        return {
          code: 'PAGE_SIZE_TOO_LARGE',
          message: 'Page size cannot exceed 1000',
          field: 'pageSize',
          correlationId,
          severity: 'medium',
          retryable: false,
          actions: [
            'Reduce page size to 1000 or less',
            'Consider using pagination with smaller page sizes',
            'Use cursor-based pagination for large datasets'
          ]
        };
      }
    }

    return null;
  }

  /**
   * Generate correlation ID for error tracking
   */
  private generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `openspec_${timestamp}_${random}`;
  }

  /**
   * Stable sort changes with tie-breakers for consistency
   */
  private stableSortChanges(changes: any[]): any[] {
    return changes.sort((a, b) => {
      // Primary sort: modified date (newest first)
      const aTime = new Date(a.modified).getTime();
      const bTime = new Date(b.modified).getTime();
      
      if (aTime !== bTime) {
        return bTime - aTime;
      }

      // Secondary sort: created date (newest first)
      const aCreated = new Date(a.created).getTime();
      const bCreated = new Date(b.created).getTime();
      
      if (aCreated !== bCreated) {
        return bCreated - aCreated;
      }

      // Tertiary sort: slug (alphabetical)
      return a.slug.localeCompare(b.slug);
    });
  }

  /**
   * Generate nextPageToken using content-based hashing for stability
   */
  private generateNextPageToken(changes: any[], pageSize: number, currentPage: number): string | null {
    const totalChanges = changes.length;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalChanges);
    
    // Check if there are more pages
    if (endIndex >= totalChanges) {
      return null;
    }

    // Create content-based hash from the last item on current page
    const lastItem = changes[endIndex - 1];
    const content = `${lastItem.slug}|${lastItem.modified}|${lastItem.created}`;
    
    return createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Apply pagination to sorted changes
   */
  private applyPagination(changes: any[], params: PaginationParams): PaginationResult {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, changes.length);
    
    const paginatedChanges = changes.slice(startIndex, endIndex);
    const hasNextPage = endIndex < changes.length;
    const nextPageToken = this.generateNextPageToken(changes, pageSize, page);

    return {
      changes: paginatedChanges,
      total: changes.length,
      hasNextPage,
      nextPageToken: nextPageToken || undefined,
      generated: new Date().toISOString()
    };
  }
}