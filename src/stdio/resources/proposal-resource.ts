/**
 * Proposal resource provider for Task MCP
 */

import { BaseResourceProvider } from './base.js';
import { ResourceContent, SecurityContext } from '../types/index.js';
import { SandboxManager } from '../security/sandbox.js';
import { validate_slug } from '../../utils/core-utilities.js';
import { ErrorSanitizer } from '../security/error-sanitizer.js';
import { promises as fs } from 'fs';
import * as path from 'path';

export class ProposalResourceProvider extends BaseResourceProvider {
  readonly definition = {
    uri: 'proposal://',
    name: 'Proposal Resource',
    description: 'Access change proposal content and metadata',
    mimeType: 'text/markdown'
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
    const slug = this.extractSlug(requestedUri);
    if (!slug) {
      const error = new Error('Invalid proposal URI: missing slug');
      const sanitized = ErrorSanitizer.sanitize(error, {
        context: 'resource',
        userType: 'user',
        logDetails: true
      });
      throw new Error(sanitized.message);
    }

    // Validate slug format
    if (!validate_slug(slug)) {
      const error = new Error(`Invalid slug format: ${slug}`);
      const sanitized = ErrorSanitizer.sanitize(error, {
        context: 'resource',
        userType: 'user',
        logDetails: true
      });
      throw new Error(sanitized.message);
    }

    const proposalPath = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'proposal.md');
    
    // Check access control
    await this.checkAccess('read', proposalPath);

    const sandbox = new SandboxManager(this.security);
    
    const result = await sandbox.readFile(proposalPath);
    if (!result.validation.isValid) {
      const error = new Error(`Proposal not found: ${slug}`);
      const sanitized = ErrorSanitizer.sanitize(error, {
        context: 'resource',
        userType: 'user',
        logDetails: true
      });
      throw new Error(sanitized.message);
    }

    return this.success(result.content, 'text/markdown');
  }

  async exists(): Promise<boolean> {
    const slug = this.extractSlug();
    if (!slug) {
      return false;
    }

    // Validate slug format
    if (!validate_slug(slug)) {
      return false;
    }

    const proposalPath = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'proposal.md');
    
    // Check access control
    try {
      await this.checkAccess('read', proposalPath);
    } catch {
      return false;
    }

    const sandbox = new SandboxManager(this.security);
    const check = await sandbox.checkFileOperation('read', proposalPath);
    return check.isValid;
  }

  async getMetadata(): Promise<Record<string, any>> {
    const slug = this.extractSlug();
    if (!slug) {
      const error = new Error('Invalid proposal URI: missing slug');
      const sanitized = ErrorSanitizer.sanitize(error, {
        context: 'resource',
        userType: 'user',
        logDetails: true
      });
      throw new Error(sanitized.message);
    }

    // Validate slug format
    if (!validate_slug(slug)) {
      return {
        slug,
        type: 'proposal',
        exists: false,
        error: 'Invalid slug format'
      };
    }

    const proposalPath = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'proposal.md');
    
    // Check access control
    try {
      await this.checkAccess('read', proposalPath);
    } catch (error) {
      return {
        slug,
        type: 'proposal',
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
            type: 'proposal',
            exists: false
          };
        }

        const stats = await fs.stat(proposalPath);
        const result = await sandbox.readFile(proposalPath);
      if (!result.validation.isValid) {
        return {
          slug,
          type: 'proposal',
          exists: false
        };
      }

      const content = result.content;
      const lines = content.split('\n');
      
      // Extract title from first H1
      let title = slug;
      const titleMatch = lines.find(line => line.trim().startsWith('# '));
      if (titleMatch) {
        title = titleMatch.replace(/^#\s+/, '').trim();
      }

      // Extract sections
      const sections: string[] = [];
      lines.forEach(line => {
        const match = line.match(/^(#{2,6})\s+(.+)$/);
        if (match) {
          sections.push(match[2].trim());
        }
      });

      // Extract description (first paragraph after title)
      let description = '';
      const titleIndex = lines.findIndex(line => line.trim().startsWith('# '));
      let descStart = titleIndex >= 0 ? titleIndex + 1 : 0;
      
      // Skip empty lines
      while (descStart < lines.length && lines[descStart].trim().length === 0) {
        descStart++;
      }
      
      if (descStart < lines.length) {
        const descLines = [];
        for (let i = descStart; i < lines.length; i++) {
          if (lines[i].trim().length === 0) break;
          if (lines[i].startsWith('#')) break;
          descLines.push(lines[i].trim());
        }
        const descText = descLines.join(' ');
        description = descText.substring(0, 200) + (descText.length > 200 ? '...' : '');
      }

      // Count words
      const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
      
// Get file stats
       const fileStats = await fs.stat(proposalPath);

      return {
        slug,
        type: 'proposal',
        exists: true,
        title,
        description,
        sections,
        wordCount,
        lineCount: lines.length,
        created: fileStats.birthtime.toISOString(),
        modified: fileStats.mtime.toISOString(),
        path: proposalPath
      };
    } catch (error) {
      this.logger('error', `Failed to get proposal metadata for ${slug}: ${error}`);
      const errorToSanitize = error instanceof Error ? error : new Error(String(error));
      const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
        context: 'resource',
        userType: 'developer',
        logDetails: true
      });
      return {
        slug,
        type: 'proposal',
        exists: false,
        error: sanitized.message
      };
    }
  }

  private extractSlug(requestedUri?: string): string | null {
    // Extract slug from URI like "proposal://my-change-slug"
    const uriToUse = requestedUri || this.actualUri;
    const match = uriToUse.match(/^proposal:\/\/([^\/]+)$/);
    return match ? match[1] : null;
  }
}