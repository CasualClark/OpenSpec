/**
 * Tests for TaskResourceProvider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskResourceProvider } from '../../../src/stdio/resources/task-resource.js';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('TaskResourceProvider', () => {
  let provider: TaskResourceProvider;
  let security: any;
  let testDir: string;
  let changesDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-tmp', 'task-resource-test');
    changesDir = path.join(testDir, 'openspec', 'changes');
    
    // Clean up any existing test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
    
    await fs.mkdir(changesDir, { recursive: true });

    security = {
      allowedPaths: [testDir, process.cwd()],
      sandboxRoot: testDir,
      maxFileSize: 10 * 1024 * 1024,
      allowedSchemas: ['resource.read']
    };
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('read - all tasks', () => {
    beforeEach(() => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change');
    });

    it('should return empty list when no tasks directory exists', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.tasks).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.slug).toBe('test-change');
    });

    it('should list all tasks for a change', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      // Create test tasks
      const task1 = {
        description: 'First test task',
        status: 'pending',
        depends_on: [],
        provides: ['task-1-output']
      };

      const task2 = {
        description: 'Second test task',
        status: 'completed',
        depends_on: ['task-1'],
        provides: ['task-2-output']
      };

      await fs.writeFile(path.join(tasksDir, 'task-1.json'), JSON.stringify(task1, null, 2));
      await fs.writeFile(path.join(tasksDir, 'task-2.json'), JSON.stringify(task2, null, 2));

      // Create a non-JSON file that should be ignored
      await fs.writeFile(path.join(tasksDir, 'readme.txt'), 'This should be ignored');

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.tasks).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.slug).toBe('test-change');

      // Check task metadata
      const tasks = data.tasks;
      expect(tasks[0].description).toBe('First test task');
      expect(tasks[0].metadata.taskId).toBe('task-1');
      expect(tasks[0].metadata.slug).toBe('test-change');
      expect(tasks[0].metadata.created).toBeDefined();
      expect(tasks[0].metadata.modified).toBeDefined();

      expect(tasks[1].description).toBe('Second test task');
      expect(tasks[1].metadata.taskId).toBe('task-2');
    });

    it('should handle invalid JSON files gracefully', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      // Create valid task
      const validTask = {
        description: 'Valid task',
        status: 'pending'
      };
      await fs.writeFile(path.join(tasksDir, 'valid-task.json'), JSON.stringify(validTask, null, 2));

      // Create invalid JSON file
      await fs.writeFile(path.join(tasksDir, 'invalid-task.json'), '{ invalid json }');

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.tasks).toHaveLength(2);
      
      const validTaskResult = data.tasks.find((t: any) => t.metadata.taskId === 'valid-task');
      expect(validTaskResult.description).toBe('Valid task');

      const invalidTaskResult = data.tasks.find((t: any) => t.metadata.taskId === 'invalid-task');
      expect(invalidTaskResult.error).toBeDefined();
    });
  });

  describe('read - specific task', () => {
    beforeEach(() => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change/task-1');
    });

    it('should read specific task content', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      const taskData = {
        description: 'Specific test task',
        status: 'in-progress',
        depends_on: ['task-0'],
        provides: ['task-1-output'],
        acceptance: ['Test passes', 'Code reviewed']
      };

      await fs.writeFile(path.join(tasksDir, 'task-1.json'), JSON.stringify(taskData, null, 2));

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.description).toBe('Specific test task');
      expect(data.status).toBe('in-progress');
      expect(data.depends_on).toEqual(['task-0']);
      expect(data.provides).toEqual(['task-1-output']);
      expect(data.acceptance).toEqual(['Test passes', 'Code reviewed']);
      expect(data.metadata.taskId).toBe('task-1');
      expect(data.metadata.slug).toBe('test-change');
      expect(data.metadata.created).toBeDefined();
      expect(data.metadata.modified).toBeDefined();
    });

    it('should throw error when specific task does not exist', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      await expect(provider.read()).rejects.toThrow('Task not found: task-1 in change test-change');
    });

    it('should throw error for invalid JSON in specific task', async () => {
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      await fs.writeFile(path.join(tasksDir, 'task-1.json'), '{ invalid json }');

      await expect(provider.read()).rejects.toThrow('Invalid task JSON: task-1 in change test-change');
    });
  });

  describe('exists', () => {
    it('should return true when tasks directory exists', async () => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change');
      
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      const exists = await provider.exists();
      expect(exists).toBe(true);
    });

    it('should return false when tasks directory does not exist', async () => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change');
      
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const exists = await provider.exists();
      expect(exists).toBe(false);
    });

    it('should return true when specific task exists', async () => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change/task-1');
      
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      const taskData = { description: 'Test task' };
      await fs.writeFile(path.join(tasksDir, 'task-1.json'), JSON.stringify(taskData));

      const exists = await provider.exists();
      expect(exists).toBe(true);
    });

    it('should return false when specific task does not exist', async () => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change/task-1');
      
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      const exists = await provider.exists();
      expect(exists).toBe(false);
    });

    it('should return false for invalid slug format', async () => {
      const invalidProvider = new TaskResourceProvider(security, console.log, 'task://Invalid-Slug');
      
      const exists = await invalidProvider.exists();
      expect(exists).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for tasks collection', async () => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change');
      
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      // Create some tasks
      const task1 = { description: 'Task 1' };
      const task2 = { description: 'Task 2' };
      
      await fs.writeFile(path.join(tasksDir, 'task-1.json'), JSON.stringify(task1));
      await fs.writeFile(path.join(tasksDir, 'task-2.json'), JSON.stringify(task2));

      const metadata = await provider.getMetadata();

      expect(metadata.slug).toBe('test-change');
      expect(metadata.type).toBe('tasks-collection');
      expect(metadata.exists).toBe(true);
      expect(metadata.taskCount).toBe(2);
      expect(metadata.path).toContain('tasks');
    });

    it('should return metadata for specific task', async () => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change/task-1');
      
      const changeDir = path.join(changesDir, 'test-change');
      const tasksDir = path.join(changeDir, 'tasks');
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(tasksDir, { recursive: true });

      const taskData = {
        description: 'Test task',
        status: 'completed',
        depends_on: ['task-0'],
        provides: ['task-1-output']
      };
      
      await fs.writeFile(path.join(tasksDir, 'task-1.json'), JSON.stringify(taskData));

      const metadata = await provider.getMetadata();

      expect(metadata.slug).toBe('test-change');
      expect(metadata.taskId).toBe('task-1');
      expect(metadata.type).toBe('task');
      expect(metadata.exists).toBe(true);
      expect(metadata.status).toBe('completed');
      expect(metadata.dependencies).toEqual(['task-0']);
      expect(metadata.provides).toEqual(['task-1-output']);
      expect(metadata.created).toBeDefined();
      expect(metadata.modified).toBeDefined();
    });

    it('should handle missing tasks directory', async () => {
      provider = new TaskResourceProvider(security, console.log, 'task://test-change');
      
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });

      const metadata = await provider.getMetadata();

      expect(metadata.slug).toBe('test-change');
      expect(metadata.type).toBe('tasks-collection');
      expect(metadata.exists).toBe(false);
    });

    it('should handle invalid slug format', async () => {
      const invalidProvider = new TaskResourceProvider(security, console.log, 'task://Invalid-Slug');
      
      const metadata = await invalidProvider.getMetadata();

      expect(metadata.slug).toBe('Invalid-Slug');
      expect(metadata.type).toBe('tasks');
      expect(metadata.exists).toBe(false);
      expect(metadata.error).toBe('Invalid slug format');
    });
  });

  describe('URI parameter extraction', () => {
    it('should extract slug and taskId correctly', async () => {
      // Test collection URI
      const collectionProvider = new TaskResourceProvider(security, console.log, 'task://my-change');
      
      const changeDir = path.join(changesDir, 'my-change');
      await fs.mkdir(changeDir, { recursive: true });

      const exists = await collectionProvider.exists();
      expect(exists).toBe(false); // No tasks directory yet

      // Test specific task URI
      const taskProvider = new TaskResourceProvider(security, console.log, 'task://my-change/specific-task');
      
      const exists2 = await taskProvider.exists();
      expect(exists2).toBe(false); // No tasks directory yet
    });

    it('should handle malformed URIs gracefully', async () => {
      const malformedProvider = new TaskResourceProvider(security, console.log, 'not-a-valid-uri');
      
      await expect(malformedProvider.read()).rejects.toThrow('Invalid task URI: missing slug');
    });
  });
});