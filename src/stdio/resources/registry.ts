/**
 * Resource registry for managing MCP resources
 */

import { BaseResourceProvider } from './base.js';
import { ResourceDefinition, SecurityContext } from '../types/index.js';

export class ResourceRegistry {
  private resources = new Map<string, BaseResourceProvider>();
  private security: SecurityContext;

  constructor(security: SecurityContext) {
    this.security = security;
  }

  /**
   * Register a resource provider
   */
  register(provider: BaseResourceProvider): void {
    this.resources.set(provider.definition.uri, provider);
  }

  /**
   * Get a resource provider by URI
   */
  get(uri: string): BaseResourceProvider | undefined {
    return this.resources.get(uri);
  }

  /**
   * Get all resource definitions
   */
  getDefinitions(): Record<string, ResourceDefinition> {
    const definitions: Record<string, ResourceDefinition> = {};
    this.resources.forEach((provider, uri) => {
      definitions[uri] = provider.definition;
    });
    return definitions;
  }

  /**
   * Check if a resource exists
   */
  has(uri: string): boolean {
    return this.resources.has(uri);
  }

  /**
   * Get all resource URIs
   */
  getUris(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * Clear all resources
   */
  clear(): void {
    this.resources.clear();
  }

  /**
   * Discover resources matching a pattern
   */
  discover(pattern: string): BaseResourceProvider[] {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const providers: BaseResourceProvider[] = [];
    this.resources.forEach(provider => {
      if (regex.test(provider.definition.uri)) {
        providers.push(provider);
      }
    });
    return providers;
  }

  /**
   * Get all resource providers
   */
  getProviders(): BaseResourceProvider[] {
    return Array.from(this.resources.values());
  }
}