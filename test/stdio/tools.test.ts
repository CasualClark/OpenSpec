/**
 * Tests for Task MCP tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/stdio/tools/registry.js';
import { ChangeOpenTool } from '../../src/stdio/tools/change-open.js';
import { ChangeArchiveTool } from '../../src/stdio/tools/change-archive.js';
import { SecurityContext } from '../../src/stdio/types/index.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let security: SecurityContext;

  beforeEach(() => {
    security = {
      allowedPaths: ['/tmp/test'],
      sandboxRoot: '/tmp/test',
      maxFileSize: 1024 * 1024,
      allowedSchemas: ['change.open', 'change.archive']
    };

    registry = new ToolRegistry(security);
  });

  it('should register and retrieve tools', () => {
    const tool = new ChangeOpenTool(security, console.log);
    registry.register(tool);

    expect(registry.has('change.open')).toBe(true);
    expect(registry.get('change.open')).toBe(tool);
  });

  it('should return tool definitions', () => {
    const openTool = new ChangeOpenTool(security, console.log);
    const archiveTool = new ChangeArchiveTool(security, console.log);
    
    registry.register(openTool);
    registry.register(archiveTool);

    const definitions = registry.getDefinitions();
    
    expect(definitions['change.open']).toBeDefined();
    expect(definitions['change.archive']).toBeDefined();
    expect(definitions['change.open'].description).toContain('Open a new change');
  });

  it('should list tool names', () => {
    const openTool = new ChangeOpenTool(security, console.log);
    registry.register(openTool);

    const names = registry.getNames();
    expect(names).toContain('change.open');
  });

  it('should clear all tools', () => {
    const openTool = new ChangeOpenTool(security, console.log);
    registry.register(openTool);

    expect(registry.has('change.open')).toBe(true);
    
    registry.clear();
    expect(registry.has('change.open')).toBe(false);
  });
});

describe('ChangeOpenTool', () => {
  let tool: ChangeOpenTool;
  let security: SecurityContext;

  beforeEach(() => {
    security = {
      allowedPaths: ['/tmp/test'],
      sandboxRoot: '/tmp/test',
      maxFileSize: 1024 * 1024,
      allowedSchemas: ['change.open']
    };

    tool = new ChangeOpenTool(security, console.log);
  });

  it('should validate correct input', () => {
    const validInput = {
      title: 'Test Change',
      slug: 'test-change',
      rationale: 'Test rationale'
    };

    const validation = tool.validateInput(validInput);
    expect(validation.success).toBe(true);
  });

  it('should reject invalid slug', () => {
    const invalidInput = {
      title: 'Test Change',
      slug: 'Invalid Slug!',
      rationale: 'Test rationale'
    };

    const validation = tool.validateInput(invalidInput);
    expect(validation.success).toBe(false);
    expect(validation.error).toContain('slug');
  });

  it('should reject missing required fields', () => {
    const invalidInput = {
      rationale: 'Test rationale'
    };

    const validation = tool.validateInput(invalidInput);
    expect(validation.success).toBe(false);
  });

  it('should have correct definition', () => {
    expect(tool.definition.name).toBe('change.open');
    expect(tool.definition.description).toContain('Open a new change');
    expect(tool.definition.inputSchema).toBeDefined();
  });
});

describe('ChangeArchiveTool', () => {
  let tool: ChangeArchiveTool;
  let security: SecurityContext;

  beforeEach(() => {
    security = {
      allowedPaths: ['/tmp/test'],
      sandboxRoot: '/tmp/test',
      maxFileSize: 1024 * 1024,
      allowedSchemas: ['change.archive']
    };

    tool = new ChangeArchiveTool(security, console.log);
  });

  it('should validate correct input', () => {
    const validInput = {
      slug: 'test-change'
    };

    const validation = tool.validateInput(validInput);
    expect(validation.success).toBe(true);
  });

  it('should reject invalid slug', () => {
    const invalidInput = {
      slug: 'Invalid Slug!'
    };

    const validation = tool.validateInput(invalidInput);
    expect(validation.success).toBe(false);
    if (validation.error) {
      expect(validation.error).toContain('slug');
    }
  });

  it('should have correct definition', () => {
    expect(tool.definition.name).toBe('change.archive');
    expect(tool.definition.description).toContain('Archive a completed change');
    expect(tool.definition.inputSchema).toBeDefined();
  });
});