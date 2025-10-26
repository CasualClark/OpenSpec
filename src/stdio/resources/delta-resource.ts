/**
 * Delta resource provider for Task MCP
 */

import { BaseResourceProvider } from './base.js';
import { ResourceContent, SecurityContext } from '../types/index.js';
import { SandboxManager } from '../security/sandbox.js';
import { validate_slug } from '../../utils/core-utilities.js';
import { promises as fs } from 'fs';
import * as path from 'path';

export class DeltaResourceProvider extends BaseResourceProvider {
  readonly definition = {
    uri: 'delta://',
    name: 'Delta Resource',
    description: 'Access change deltas and differences for a change',
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
    const { slug, deltaId } = this.extractParams(requestedUri);
    
    if (!slug) {
      throw new Error('Invalid delta URI: missing slug');
    }

    // Validate slug format
    if (!validate_slug(slug)) {
      throw new Error(`Invalid slug format: ${slug}`);
    }

    const deltasDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'deltas');
    
    if (deltaId) {
      // Read specific delta
      const deltaPath = path.join(deltasDir, `${deltaId}.diff`);
      
      // Check access control
      await this.checkAccess('read', deltaPath);

      const sandbox = new SandboxManager(this.security);
      
      const result = await sandbox.readFile(deltaPath);
      if (!result.validation.isValid) {
        throw new Error(`Delta not found: ${deltaId} in change ${slug}`);
      }

      // Parse delta content and enhance with metadata
      try {
        const deltaContent = result.content;
        const stats = await fs.stat(deltaPath);
        
        // Analyze delta content
        const lines = deltaContent.split('\n');
        const additions = lines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length;
        const deletions = lines.filter(line => line.startsWith('-') && !line.startsWith('---')).length;
        const files = this.extractFilesFromDiff(deltaContent);
        
        const enhancedDelta = {
          deltaId,
          slug,
          content: deltaContent,
          metadata: {
            path: deltaPath,
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
            size: stats.size,
            lines: lines.length,
            additions,
            deletions,
            files,
            type: this.detectDeltaType(deltaContent)
          }
        };

        return this.success(JSON.stringify(enhancedDelta, null, 2), 'application/json');
      } catch (parseError) {
        // If we can't parse as enhanced, return raw content
        return this.success(result.content, 'text/plain');
      }
    } else {
      // List all deltas for change
      const changeDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug);
      
      // Check access control for deltas directory
      await this.checkAccess('read', deltasDir);

      const sandbox = new SandboxManager(this.security);
      const changeExists = await sandbox.checkFileOperation('read', changeDir);
      if (!changeExists.isValid) {
        throw new Error(`Change not found: ${slug}`);
      }
      
      const existsCheck = await sandbox.checkFileOperation('read', deltasDir);
      if (!existsCheck.isValid) {
        return this.success(JSON.stringify({ deltas: [], total: 0, slug, generated: new Date().toISOString() }, null, 2), 'application/json');
      }

      try {
        const listResult = await sandbox.listFiles(deltasDir);
        if (!listResult.validation.isValid) {
          throw new Error(`Failed to list deltas for change ${slug}`);
        }

        // Filter to .diff files only
        const deltaFiles = listResult.files.filter((file: string) => file.endsWith('.diff'));
        
        const deltas = await Promise.all(
          deltaFiles.map(async (deltaFile: string) => {
            const deltaId = path.basename(deltaFile, '.diff');
            try {
              const result = await sandbox.readFile(deltaFile);
              if (result.validation.isValid) {
                const deltaContent = result.content;
                const stats = await fs.stat(deltaFile);
                
                // Analyze delta content
                const lines = deltaContent.split('\n');
                const additions = lines.filter((line: string) => line.startsWith('+')).length;
                const deletions = lines.filter((line: string) => line.startsWith('-')).length;
                const files = this.extractFilesFromDiff(deltaContent);
                
                return {
                  deltaId,
                  slug,
                  metadata: {
                    path: deltaFile,
                    created: stats.birthtime.toISOString(),
                    modified: stats.mtime.toISOString(),
                    size: stats.size,
                    lines: lines.length,
                    additions,
                    deletions,
                    files,
                    type: this.detectDeltaType(deltaContent)
                  }
                };
              }
            } catch (error) {
              this.logger('error', `Failed to read delta ${deltaId}: ${error}`);
              return {
                deltaId,
                slug,
                error: error instanceof Error ? error.message : String(error),
                metadata: {
                  deltaId,
                  slug,
                  path: deltaFile
                }
              };
            }
          })
        );

        // Sort deltas by creation date
        const sortedDeltas = deltas.sort((a: any, b: any) => {
          const aTime = a && a.metadata?.created ? new Date(a.metadata.created).getTime() : 0;
          const bTime = b && b.metadata?.created ? new Date(b.metadata.created).getTime() : 0;
          return aTime - bTime;
        });

        const result = {
          slug,
          deltas: sortedDeltas,
          total: sortedDeltas.length,
          generated: new Date().toISOString()
        };

        return this.success(JSON.stringify(result, null, 2), 'application/json');
        
      } catch (error) {
        this.logger('error', `Failed to read deltas for change ${slug}: ${error}`);
        throw error;
      }
    }
  }

  async exists(): Promise<boolean> {
    const { slug, deltaId } = this.extractParams();
    
    if (!slug) {
      return false;
    }

    // Validate slug format
    if (!validate_slug(slug)) {
      return false;
    }

    const sandbox = new SandboxManager(this.security);
    
    if (deltaId) {
      const deltaPath = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'deltas', `${deltaId}.diff`);
      
      // Check access control
      try {
        await this.checkAccess('read', deltaPath);
      } catch {
        return false;
      }
      
      const check = await sandbox.checkFileOperation('read', deltaPath);
      return check.isValid;
    } else {
      const deltasDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'deltas');
      
      // Check access control
      try {
        await this.checkAccess('read', deltasDir);
      } catch {
        return false;
      }
      
      const check = await sandbox.checkFileOperation('read', deltasDir);
      return check.isValid;
    }
  }

  async getMetadata(): Promise<Record<string, any>> {
    const { slug, deltaId } = this.extractParams();
    
    if (!slug) {
      throw new Error('Invalid delta URI: missing slug');
    }

    // Validate slug format
    if (!validate_slug(slug)) {
      return {
        slug,
        deltaId: deltaId || null,
        type: 'deltas',
        exists: false,
        error: 'Invalid slug format'
      };
    }

    if (deltaId) {
      const deltaPath = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'deltas', `${deltaId}.diff`);
      
      // Check access control
      try {
        await this.checkAccess('read', deltaPath);
      } catch (error) {
        return {
          slug,
          deltaId,
          type: 'delta',
          exists: false,
          error: 'Access denied'
        };
      }

      const sandbox = new SandboxManager(this.security);
      
      try {
        const exists = await this.exists();
        if (!exists) {
          return {
            slug,
            deltaId,
            type: 'delta',
            exists: false
          };
        }

        const stats = await fs.stat(deltaPath);
        const result = await sandbox.readFile(deltaPath);
        
        if (result.validation.isValid) {
          const deltaContent = result.content;
          const lines = deltaContent.split('\n');
          const additions = lines.filter((line: string) => line.startsWith('+')).length;
          const deletions = lines.filter((line: string) => line.startsWith('-')).length;
          const files = this.extractFilesFromDiff(deltaContent);
          
          return {
            slug,
            deltaId,
            type: 'delta',
            exists: true,
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
            size: stats.size,
            lines: lines.length,
            additions,
            deletions,
            files,
            deltaType: this.detectDeltaType(deltaContent),
            path: deltaPath
          };
        }
      } catch (error) {
        this.logger('error', `Failed to get delta metadata for ${deltaId}: ${error}`);
        return {
          slug,
          deltaId,
          type: 'delta',
          exists: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    } else {
      const deltasDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'deltas');
      
      // Check access control
      try {
        await this.checkAccess('read', deltasDir);
      } catch (error) {
        return {
          slug,
          deltaId: null,
          type: 'deltas-collection',
          exists: false,
          error: 'Access denied'
        };
      }

      const sandbox = new SandboxManager(this.security);
      
      try {
        const exists = await this.exists();
        if (!exists) {
          return {
            slug,
            deltaId: null,
            type: 'deltas-collection',
            exists: false
          };
        }

        const listResult = await sandbox.listFiles(deltasDir);
        if (listResult.validation.isValid) {
          const deltaFiles = listResult.files.filter((file: string) => file.endsWith('.diff'));
          
          return {
            slug,
            deltaId: null,
            type: 'deltas-collection',
            exists: true,
            deltaCount: deltaFiles.length,
            path: deltasDir
          };
        }
      } catch (error) {
        this.logger('error', `Failed to get deltas metadata for ${slug}: ${error}`);
        return {
          slug,
          deltaId: null,
          type: 'deltas-collection',
          exists: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return {
      slug,
      deltaId,
      type: deltaId ? 'delta' : 'deltas-collection',
      exists: false
    };
  }

  private extractParams(requestedUri?: string): { slug: string | null; deltaId: string | null } {
    // Use requestedUri if provided, otherwise fall back to actualUri
    const uriToUse = requestedUri || this.actualUri;
    
    // Extract slug and optional deltaId from URI
    // Examples: "delta://my-change" or "delta://my-change/delta-1"
    const match = uriToUse.match(/^delta:\/\/([^\/]+)(?:\/([^\/]+))?$/);
    if (!match) {
      return { slug: null, deltaId: null };
    }
    
    return {
      slug: match[1],
      deltaId: match[2] || null
    };
  }

  private extractFilesFromDiff(diffContent: string): string[] {
    const files: string[] = [];
    const lines = diffContent.split('\n');
    
    for (const line of lines) {
      // Look for diff file headers like "diff --git a/file.ts b/file.ts"
      const gitDiffMatch = (line as string).match(/^diff --git a\/(\S+) b\/\S+$/);
      if (gitDiffMatch) {
        files.push(gitDiffMatch[1]);
        continue;
      }
      
      // Look for traditional diff headers like "--- a/file.ts" and "+++ b/file.ts"
      const oldFileMatch = (line as string).match(/^--- a\/(\S+)$/);
      const newFileMatch = (line as string).match(/^\+\+\+ b\/(\S+)$/);
      
      if (oldFileMatch) {
        files.push(oldFileMatch[1]);
      } else if (newFileMatch) {
        files.push(newFileMatch[1]);
      }
    }
    
    // Remove duplicates and return unique files
    return [...new Set(files)];
  }

  private detectDeltaType(diffContent: string): string {
    if (diffContent.includes('diff --git')) {
      return 'git';
    } else if (diffContent.includes('---') && diffContent.includes('+++')) {
      return 'unified';
    } else if (diffContent.includes('< ') && diffContent.includes('> ')) {
      return 'context';
    } else {
      return 'unknown';
    }
  }
}