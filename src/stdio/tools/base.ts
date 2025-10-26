/**
 * Base tool implementation for Task MCP
 */

import { z } from 'zod';
import { ToolDefinition, ToolResult, SecurityContext } from '../types/index.js';

export abstract class BaseTool {
  abstract readonly definition: ToolDefinition;
  
  constructor(
    protected security: SecurityContext,
    protected logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
  ) {}

  /**
   * Execute the tool with validated input
   */
  abstract execute(input: any): Promise<ToolResult>;

  /**
   * Validate input against the tool's schema
   */
  validateInput(input: any): { success: boolean; error?: string } {
    const result = this.definition.inputSchema.safeParse(input);
    if (result.success) {
      return { success: true };
    } else {
      return { 
        success: false, 
        error: result.error.message 
      };
    }
  }

  /**
   * Create a successful tool result
   */
  protected success(text: string): ToolResult {
    return {
      content: [{
        type: 'text',
        text
      }],
      isError: false
    };
  }

  /**
   * Create an error tool result
   */
  protected error(message: string): ToolResult {
    return {
      content: [{
        type: 'text',
        text: `Error: ${message}`
      }],
      isError: true
    };
  }

  /**
   * Create a resource tool result
   */
  protected resource(uri: string, text: string, mimeType?: string): ToolResult {
    return {
      content: [{
        type: 'resource',
        text,
        mimeType: mimeType || 'text/plain'
      }],
      isError: false
    };
  }
}