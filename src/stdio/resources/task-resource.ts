/**
 * Task resource provider for Task MCP
 */

import { BaseResourceProvider } from './base.js';
import { ResourceContent, SecurityContext } from '../types/index.js';
import { SandboxManager } from '../security/sandbox.js';
import { validate_slug } from '../../utils/core-utilities.js';
import { ErrorSanitizer } from '../security/error-sanitizer.js';
import { promises as fs } from 'fs';
import * as path from 'path';

export class TaskResourceProvider extends BaseResourceProvider {
  readonly definition = {
    uri: 'task://',
    name: 'Task Resource',
    description: 'Access all tasks for a change or specific task information',
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
    const { slug, taskId } = this.extractParams(requestedUri);
    
    if (!slug) {
      const error = new Error('Invalid task URI: missing slug');
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

    const tasksDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'tasks');
    
    if (taskId) {
      // Read specific task
      const taskPath = path.join(tasksDir, `${taskId}.json`);
      
      // Check access control
      await this.checkAccess('read', taskPath);

      const sandbox = new SandboxManager(this.security);
      
      const result = await sandbox.readFile(taskPath);
      if (!result.validation.isValid) {
        throw new Error(`Task not found: ${taskId} in change ${slug}`);
      }

      // Parse and enhance task data
      try {
        const taskData = JSON.parse(result.content);
        const stats = await fs.stat(taskPath);
        
        const enhancedTask = {
          ...taskData,
          metadata: {
            taskId,
            slug,
            path: taskPath,
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString()
          }
        };

        return this.success(JSON.stringify(enhancedTask, null, 2), 'application/json');
      } catch (parseError) {
        throw new Error(`Invalid task JSON: ${taskId} in change ${slug}`);
      }
    } else {
      // List all tasks for the change
      const changeDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug);
      
      // Check access control for tasks directory
      await this.checkAccess('read', tasksDir);

      const sandbox = new SandboxManager(this.security);
      const changeExists = await sandbox.checkFileOperation('read', changeDir);
      if (!changeExists.isValid) {
        throw new Error(`Change not found: ${slug}`);
      }
      
      const existsCheck = await sandbox.checkFileOperation('read', tasksDir);
      if (!existsCheck.isValid) {
        return this.success(JSON.stringify({ tasks: [], total: 0, slug, generated: new Date().toISOString() }, null, 2), 'application/json');
      }

      try {
        const listResult = await sandbox.listFiles(tasksDir);
        if (!listResult.validation.isValid) {
          throw new Error(`Failed to list tasks for change ${slug}`);
        }

        // Filter to JSON files only
        const taskFiles = listResult.files.filter((file: string) => file.endsWith('.json'));
        
        const tasks = await Promise.all(
          taskFiles.map(async (taskFile: string) => {
            const taskId = path.basename(taskFile, '.json');
            try {
              const result = await sandbox.readFile(taskFile);
              if (result.validation.isValid) {
                const taskData = JSON.parse(result.content);
                const stats = await fs.stat(taskFile);
                
                return {
                  ...taskData,
                  metadata: {
                    taskId,
                    slug,
                    path: taskFile,
                    created: stats.birthtime.toISOString(),
                    modified: stats.mtime.toISOString()
                  }
                };
              }
            } catch (error) {
              this.logger('error', `Failed to read task ${taskId}: ${error}`);
              return {
                taskId,
                slug,
                error: error instanceof Error ? error.message : String(error),
                metadata: {
                  taskId,
                  slug,
                  path: taskFile
                }
              };
            }
          })
        );

        // Sort tasks by creation date
        const sortedTasks = tasks.sort((a: any, b: any) => 
          new Date(a.metadata.created).getTime() - new Date(b.metadata.created).getTime()
        );

        const result = {
          slug,
          tasks: sortedTasks,
          total: sortedTasks.length,
          generated: new Date().toISOString()
        };

        return this.success(JSON.stringify(result, null, 2), 'application/json');
        
      } catch (error) {
        this.logger('error', `Failed to read tasks for change ${slug}: ${error}`);
        throw error;
      }
    }
  }

  async exists(): Promise<boolean> {
    const { slug, taskId } = this.extractParams();
    
    if (!slug) {
      return false;
    }

    // Validate slug format
    if (!validate_slug(slug)) {
      return false;
    }

    const sandbox = new SandboxManager(this.security);
    
    if (taskId) {
      const taskPath = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'tasks', `${taskId}.json`);
      
      // Check access control
      try {
        await this.checkAccess('read', taskPath);
      } catch {
        return false;
      }
      
      const check = await sandbox.checkFileOperation('read', taskPath);
      return check.isValid;
    } else {
      const tasksDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'tasks');
      
      // Check access control
      try {
        await this.checkAccess('read', tasksDir);
      } catch {
        return false;
      }
      
      const check = await sandbox.checkFileOperation('read', tasksDir);
      return check.isValid;
    }
  }

  async getMetadata(): Promise<Record<string, any>> {
    const { slug, taskId } = this.extractParams();
    
    if (!slug) {
      throw new Error('Invalid task URI: missing slug');
    }

    // Validate slug format
    if (!validate_slug(slug)) {
      return {
        slug,
        taskId: taskId || null,
        type: 'tasks',
        exists: false,
        error: 'Invalid slug format'
      };
    }

    if (taskId) {
      const taskPath = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'tasks', `${taskId}.json`);
      
      // Check access control
      try {
        await this.checkAccess('read', taskPath);
      } catch (error) {
        return {
          slug,
          taskId,
          type: 'task',
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
            taskId,
            type: 'task',
            exists: false
          };
        }

        const stats = await fs.stat(taskPath);
        const result = await sandbox.readFile(taskPath);
        
        if (result.validation.isValid) {
          const taskData = JSON.parse(result.content);
          
          return {
            slug,
            taskId,
            type: 'task',
            exists: true,
            status: taskData.status || 'unknown',
            dependencies: taskData.depends_on || [],
            provides: taskData.provides || [],
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
            path: taskPath
          };
        }
      } catch (error) {
        this.logger('error', `Failed to get task metadata for ${taskId}: ${error}`);
        return {
          slug,
          taskId,
          type: 'task',
          exists: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    } else {
      const tasksDir = path.join(this.security.sandboxRoot, 'openspec', 'changes', slug, 'tasks');
      
      // Check access control
      try {
        await this.checkAccess('read', tasksDir);
      } catch (error) {
        return {
          slug,
          taskId: null,
          type: 'tasks-collection',
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
            taskId: null,
            type: 'tasks-collection',
            exists: false
          };
        }

        const listResult = await sandbox.listFiles(tasksDir);
        if (listResult.validation.isValid) {
          const taskFiles = listResult.files.filter((file: string) => file.endsWith('.json'));
          
          return {
            slug,
            taskId: null,
            type: 'tasks-collection',
            exists: true,
            taskCount: taskFiles.length,
            path: tasksDir
          };
        }
      } catch (error) {
        this.logger('error', `Failed to get tasks metadata for ${slug}: ${error}`);
        return {
          slug,
          taskId: null,
          type: 'tasks-collection',
          exists: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return {
      slug,
      taskId,
      type: taskId ? 'task' : 'tasks-collection',
      exists: false
    };
  }

  private extractParams(requestedUri?: string): { slug: string | null; taskId: string | null } {
    // Use requestedUri if provided, otherwise fall back to actualUri
    const uriToUse = requestedUri || this.actualUri;
    
    // Extract slug and optional taskId from URI
    // Examples: "task://my-change" or "task://my-change/task-1"
    const match = uriToUse.match(/^task:\/\/([^\/]+)(?:\/([^\/]+))?$/);
    if (!match) {
      return { slug: null, taskId: null };
    }
    
    return {
      slug: match[1],
      taskId: match[2] || null
    };
  }
}