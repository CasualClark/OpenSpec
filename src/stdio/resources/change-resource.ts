/**
 * Change resource provider for Task MCP
 */

import { BaseResourceProvider } from './base.js';
import { ResourceContent } from '../types/index.js';
import { SandboxManager } from '../security/sandbox.js';
import { validate_slug, canonicalize } from '../../utils/core-utilities.js';
import { promises as fs } from 'fs';
import * as path from 'path';

export class ChangeResourceProvider extends BaseResourceProvider {
  readonly definition = {
    uri: 'changes://',
    name: 'Changes Resource',
    description: 'List and access all active changes in the openspec/changes directory',
    mimeType: 'application/json'
  };

  private actualUri: string;

  constructor(
    security: any,
    logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void,
    actualUri?: string
  ) {
    super(security, logger);
    this.actualUri = actualUri || this.definition.uri;
  }

  async read(): Promise<ResourceContent> {
    const sandbox = new SandboxManager(this.security);
    const changesDir = path.join(this.security.sandboxRoot, 'changes');
    
    // Check if changes directory exists
    const existsCheck = await sandbox.checkFileOperation('read', changesDir);
    if (!existsCheck.isValid) {
      return this.success(JSON.stringify({ changes: [], total: 0 }, null, 2), 'application/json');
    }

    try {
      // List all change directories
      const listResult = await sandbox.listFiles(changesDir);
      if (!listResult.validation.isValid) {
        throw new Error(`Failed to list changes directory: ${listResult.validation.errors.map(e => e.message).join(', ')}`);
      }

      // Filter to directories only and validate slugs
      const changeEntries = await Promise.all(
        listResult.files
          .filter(async (filePath) => {
            try {
              const stats = await fs.stat(filePath);
              return stats.isDirectory();
            } catch {
              return false;
            }
          })
      );

      const changes = await Promise.all(
        changeEntries.map(async (changePath) => {
          const slug = path.basename(changePath);
          
          // Validate slug format
          if (!validate_slug(slug)) {
            this.logger('warn', `Invalid slug format: ${slug}`);
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
            return {
              slug,
              title: slug,
              description: '',
              path: changePath,
              created: new Date(0).toISOString(),
              modified: new Date(0).toISOString(),
              hasProposal: false,
              hasLock: false,
              lockInfo: null,
              specCount: 0,
              taskCount: 0,
              deltaCount: 0,
              status: 'error',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        })
      );

      // Filter out null entries and sort by modified date (newest first)
      const validChanges = changes
        .filter(change => change !== null)
        .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

      const result = {
        changes: validChanges,
        total: validChanges.length,
        generated: new Date().toISOString()
      };

      return this.success(JSON.stringify(result, null, 2), 'application/json');
      
    } catch (error) {
      this.logger('error', `Failed to read changes: ${error}`);
      throw error;
    }
  }

  async exists(): Promise<boolean> {
    const changesDir = path.join(this.security.sandboxRoot, 'changes');
    const sandbox = new SandboxManager(this.security);
    const check = await sandbox.checkFileOperation('read', changesDir);
    return check.isValid;
  }

  async getMetadata(): Promise<Record<string, any>> {
    const changesDir = path.join(this.security.sandboxRoot, 'changes');
    
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
}