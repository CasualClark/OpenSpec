/**
 * change.open tool implementation
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { BaseTool } from './base.js';
import { ToolResult } from '../types/index.js';
import { canonicalize, validate_slug, atomic_lock, AtomicLockError } from '../../utils/core-utilities.js';
import { ChangeTemplateManager, ChangeTemplateContext } from '../../core/templates/change-templates.js';
import { InputSanitizer } from '../security/input-sanitizer.js';
import { ErrorSanitizer } from '../security/error-sanitizer.js';

// Input schema based on change.open.input.schema.json
const ChangeOpenInputSchema = z.object({
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9\-]{1,62})[a-z0-9]$/),
  rationale: z.string().optional(),
  owner: z.string().optional(),
  ttl: z.number().int().min(60).max(86400).optional(),
  template: z.enum(['feature', 'bugfix', 'chore']).optional()
});

export class ChangeOpenTool extends BaseTool {
  readonly definition = {
    name: 'change.open',
    description: 'Open a new change for development with lock acquisition and template scaffolding',
    inputSchema: ChangeOpenInputSchema
  };

  async execute(input: z.infer<typeof ChangeOpenInputSchema>): Promise<ToolResult> {
    try {
      // Enhanced input sanitization
      const sanitizedInput = InputSanitizer.sanitize(input, {
        maxLength: 10000,
        allowedChars: null // Use default sanitization
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

      // Validate slug pattern
      if (!validate_slug(safeInput.slug)) {
        const error = new Error(`Invalid slug format: ${safeInput.slug}. Must match pattern: ^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }

      // Set defaults
      const owner = safeInput.owner || `pid-${process.pid}@${require('os').hostname()}`;
      const ttl = safeInput.ttl || 3600; // Default 1 hour
      const template = safeInput.template || 'feature'; // Default template

      // Determine paths with additional sanitization
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

      // Security: Ensure path stays within openspec directory
      if (!canonicalChangeRoot.startsWith(canonicalOpenspecRoot)) {
        const error = new Error(`Path traversal detected: ${safeInput.slug} escapes openspec directory`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        return this.error(sanitized.message);
      }

      this.logger('info', `Opening change "${safeInput.slug}" with template "${template}"`);

      // Scaffold change using template system (it handles its own locking)
      const templateContext: ChangeTemplateContext = {
        title: safeInput.title,
        slug: safeInput.slug,
        rationale: safeInput.rationale,
        owner: owner,
        ttl: ttl
      };

      const templateManager = new ChangeTemplateManager(repoRoot);
      let createdPath: string;
      
      try {
        createdPath = await templateManager.createChange(template, templateContext);
        this.logger('info', `Change scaffolded at: ${createdPath}`);
      } catch (scaffoldError) {
        const errorMessage = scaffoldError instanceof Error ? scaffoldError.message : String(scaffoldError);
        this.logger('error', `Scaffolding failed for "${input.slug}": ${errorMessage}`);
        
        const errorToSanitize = scaffoldError instanceof Error ? scaffoldError : new Error(String(scaffoldError));
        const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
          context: 'tool',
          userType: 'user',
          logDetails: true
        });
        
        // Check if it's a lock error and format appropriately
        if (errorMessage.includes('locked by')) {
          return this.error(`Change "${input.slug}" is already locked.

${sanitized.message}

 Options:
 - Wait for the lock to expire
 - Use a different slug
 - Contact the lock owner if this is an error`);
        }
        
        return this.error(`Failed to scaffold change "${input.slug}": ${sanitized.message}`);
      }

      // Create a persistent lock file to indicate change is active
      const persistentLockPath = path.join(createdPath, '.lock');
      let lockInfo;
      
      try {
        lockInfo = await atomic_lock(persistentLockPath, owner, ttl);
        this.logger('info', `Persistent lock acquired for "${input.slug}" by ${owner}`);
      } catch (lockError) {
        if (lockError instanceof AtomicLockError) {
          const age = Math.floor((Date.now() - lockError.lockInfo!.since) / 1000 / 60);
          const expires = Math.floor((lockError.lockInfo!.ttl * 1000 - (Date.now() - lockError.lockInfo!.since)) / 1000 / 60);
          
          const error = new Error(`Change "${input.slug}" is already locked by ${lockError.lockInfo!.owner}`);
          const sanitized = ErrorSanitizer.sanitize(error, {
            context: 'tool',
            userType: 'user',
            logDetails: true
          });
            
          return this.error(`${sanitized.message}

Lock Details:
 - Held for: ${age} minutes
 - Expires in: ${expires} minutes
 - Lock path: [lock-location]

 Options:
 - Wait for the lock to expire
 - Use a different slug
 - Contact the lock owner if this is an error`);
        }
        throw lockError;
      }

      // Generate output matching change.open.output schema
      const output = {
        apiVersion: "task-mcp/v1",
        slug: safeInput.slug,
        created: true,
        locked: true,
        status: "draft" as const,
        paths: {
          root: canonicalChangeRoot,
          proposal: path.join(canonicalChangeRoot, 'proposal.md'),
          tasks: path.join(canonicalChangeRoot, 'tasks.md'),
          delta: path.join(canonicalChangeRoot, 'specs')
        },
        resourceUris: {
          proposal: `file://${path.join(canonicalChangeRoot, 'proposal.md')}`,
          tasks: `file://${path.join(canonicalChangeRoot, 'tasks.md')}`,
          delta: `file://${path.join(canonicalChangeRoot, 'specs')}`
        },
        toolVersions: {
          "change.open": "1.0.0",
          "template-system": "1.0.0"
        }
      };

      const successMessage = `Successfully opened change "${safeInput.title}" (${safeInput.slug})

Change Details:
- Template: ${template}
- Owner: ${lockInfo.owner}
- Locked until: ${new Date(lockInfo.since + (lockInfo.ttl * 1000)).toISOString()}
- Status: draft

Created Files:
- proposal.md: Change proposal and requirements
- tasks.md: Task breakdown and tracking
- specs/: Directory for detailed specifications

Next Steps:
1. Edit proposal.md to define your change
2. Add detailed specs to the specs/ directory
3. Implement the changes following tasks.md
4. Use change.validate to check compliance
5. Use change.archive to complete the workflow

Resource URIs:
- Proposal: ${output.resourceUris.proposal}
- Tasks: ${output.resourceUris.tasks}
- Specs: ${output.resourceUris.delta}`;

      return this.success(successMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger('error', `change.open error: ${errorMessage}`);
      const errorToSanitize = error instanceof Error ? error : new Error(String(error));
      const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
        context: 'tool',
        userType: 'user',
        logDetails: true
      });
      return this.error(sanitized.message);
    }
  }
}