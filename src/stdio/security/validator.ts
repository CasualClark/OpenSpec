/**
 * Input validation using JSON schemas
 */

import { z } from 'zod';
import { ValidationResult } from '../types/index.js';

/**
 * Schema validator for MCP inputs
 */
export class SchemaValidator {
  private schemas = new Map<string, z.ZodSchema>();

  /**
   * Register a schema for validation
   */
  registerSchema(name: string, schema: z.ZodSchema): void {
    this.schemas.set(name, schema);
  }

  /**
   * Validate input against a registered schema
   */
  validate(schemaName: string, input: any): ValidationResult {
    const schema = this.schemas.get(schemaName);
    
    if (!schema) {
      return {
        isValid: false,
        errors: [{
          path: 'schema',
          message: `Schema not found: ${schemaName}`,
          code: 'SCHEMA_NOT_FOUND'
        }]
      };
    }

    const result = schema.safeParse(input);
    
    if (result.success) {
      return { isValid: true, errors: [] };
    } else {
      return {
        isValid: false,
        errors: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: 'VALIDATION_ERROR'
        }))
      };
    }
  }

  /**
   * Get all registered schema names
   */
  getSchemaNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Check if a schema is registered
   */
  hasSchema(name: string): boolean {
    return this.schemas.has(name);
  }
}

/**
 * Create default schemas for common MCP operations
 */
export function createDefaultSchemas(): Record<string, z.ZodSchema> {
  return {
    'change.open': z.object({
      title: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9](?:[a-z0-9\-]{1,62})[a-z0-9]$/),
      rationale: z.string().optional(),
      owner: z.string().optional(),
      ttl: z.number().int().min(60).max(86400).optional(),
      template: z.enum(['feature', 'bugfix', 'chore']).optional()
    }),

    'change.archive': z.object({
      slug: z.string()
    }),

    'resource.read': z.object({
      uri: z.string().url()
    }),

    'tool.call': z.object({
      name: z.string(),
      arguments: z.record(z.string(), z.any())
    })
  };
}