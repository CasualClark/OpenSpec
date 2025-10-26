/**
 * Tool registry for managing MCP tools
 */

import { BaseTool } from './base.js';
import { ToolDefinition, SecurityContext } from '../types/index.js';

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();
  private security: SecurityContext;

  constructor(security: SecurityContext) {
    this.security = security;
  }

  /**
   * Register a tool
   */
  register(tool: BaseTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tool definitions
   */
  getDefinitions(): Record<string, ToolDefinition> {
    const definitions: Record<string, ToolDefinition> = {};
    this.tools.forEach((tool, name) => {
      definitions[name] = tool.definition;
    });
    return definitions;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }
}