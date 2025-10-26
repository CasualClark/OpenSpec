/**
 * Example resource provider that demonstrates URI parsing utilities integration
 */

import { BaseResourceProvider } from './base.js';
import { ResourceContent } from '../types/index.js';
import { 
  parseUri, 
  validateQueryParams, 
  isUriSafe, 
  extractChangeFilePath,
  isChangesActiveUri,
  isChangeUri,
  type QueryParamRule 
} from '../../utils/uri-parser.js';
import { ErrorSanitizer } from '../security/error-sanitizer.js';

export class UriResourceProvider extends BaseResourceProvider {
  readonly definition = {
    uri: 'uri://',
    name: 'URI Parser Demo Resource',
    description: 'Demonstrates URI parsing capabilities with security validation',
    mimeType: 'application/json'
  };

  // Query parameter validation rules for changes://active
  private readonly changesActiveRules: Record<string, QueryParamRule> = {
    page: { type: 'number', min: 1, max: 1000 },
    pageSize: { type: 'number', min: 1, max: 100 },
    filter: { allowedValues: ['draft', 'active', 'archived', 'all'] },
    sort: { allowedValues: ['name', 'date', 'status'] },
    search: { pattern: /^[a-zA-Z0-9\s\-_.]+$/ }
  };

  async read(requestedUri?: string): Promise<ResourceContent> {
    const uri = requestedUri || this.definition.uri;
    
    try {
      // Parse URI with security validation
      const parsed = parseUri(uri);
      
      // Check if URI is safe
      if (!isUriSafe(parsed)) {
        const error = new Error('URI contains security violations');
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'resource',
          userType: 'user',
          logDetails: true
        });
        
        return this.success(
          JSON.stringify({
            error: `Security violations detected: ${parsed.security.warnings.join(', ')}`,
            details: sanitized.message,
            uri: parsed.uri
          }, null, 2),
          'application/json'
        );
      }

      // Handle different URI types
      if (isChangesActiveUri(uri)) {
        return this.handleChangesActive(parsed);
      } else if (isChangeUri(uri)) {
        return this.handleChange(parsed);
      } else {
        return this.handleGenericUri(parsed);
      }
      
    } catch (error) {
      const errorToSanitize = error instanceof Error ? error : new Error(String(error));
      const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
        context: 'resource',
        userType: 'user',
        logDetails: true
      });
      
      return this.success(
        JSON.stringify({
          error: `Failed to parse URI: ${sanitized.message}`,
          type: 'parse_error'
        }, null, 2),
        'application/json'
      );
    }
  }

  private async handleChangesActive(parsed: any): Promise<ResourceContent> {
    // Validate query parameters for changes://active
    const validation = validateQueryParams(parsed.queryParams, this.changesActiveRules);
    
    if (!validation.isValid) {
      return this.success(
        JSON.stringify({
          error: `Invalid query parameters: ${validation.errors.join(', ')}`,
          type: 'validation_error',
          uri: parsed.uri
        }, null, 2),
        'application/json'
      );
    }

    // Simulate fetching changes with pagination
    const page = parseInt(parsed.queryParams.page || '1');
    const pageSize = parseInt(parsed.queryParams.pageSize || '20');
    const filter = parsed.queryParams.filter || 'all';
    
    const mockChanges = [
      { slug: 'feature-1', title: 'Add User Authentication', status: 'active' },
      { slug: 'feature-2', title: 'Implement Search', status: 'draft' },
      { slug: 'bugfix-1', title: 'Fix Memory Leak', status: 'archived' },
    ];

    // Apply filter
    const filteredChanges = filter === 'all' 
      ? mockChanges 
      : mockChanges.filter(change => change.status === filter);

    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedChanges = filteredChanges.slice(startIndex, endIndex);

    const result = {
      type: 'changes-active',
      uri: parsed.uri,
      query: parsed.queryParams,
      pagination: {
        page,
        pageSize,
        total: filteredChanges.length,
        hasNextPage: endIndex < filteredChanges.length
      },
      changes: paginatedChanges,
      generated: new Date().toISOString()
    };

    return this.success(JSON.stringify(result, null, 2), 'application/json');
  }

  private async handleChange(parsed: any): Promise<ResourceContent> {
    // Extract file path from change:// URI
    const filePath = extractChangeFilePath(parsed);
    const slug = parsed.pathSegments[0];
    
    // Simulate accessing change files
    try {
      // If no file specified, return change metadata
      if (!filePath) {
        const metadata = await this.getChangeMetadata(slug);
        return this.success(JSON.stringify(metadata, null, 2), 'application/json');
      }

      // Simulate reading specific file
      const result = {
        type: 'change-file',
        uri: parsed.uri,
        slug,
        filePath,
        mimeType: parsed.mimeType,
        content: `# Mock content for ${filePath}`,
        generated: new Date().toISOString()
      };

      return this.success(JSON.stringify(result, null, 2), 'application/json');
      
    } catch (error) {
      const errorToSanitize = error instanceof Error ? error : new Error(String(error));
      const sanitized = ErrorSanitizer.sanitize(errorToSanitize, {
        context: 'resource',
        userType: 'user',
        logDetails: true
      });
      
      return this.success(
        JSON.stringify({
          error: `Failed to access change: ${sanitized.message}`,
          type: 'access_error'
        }, null, 2),
        'application/json'
      );
    }
  }

  private async handleGenericUri(parsed: any): Promise<ResourceContent> {
    const result = {
      type: 'generic-uri',
      uri: parsed.uri,
      parsed: {
        scheme: parsed.scheme,
        host: parsed.host,
        pathSegments: parsed.pathSegments,
        queryParams: parsed.queryParams,
        fragment: parsed.fragment,
        mimeType: parsed.mimeType
      },
      security: parsed.security,
      generated: new Date().toISOString()
    };

    return this.success(JSON.stringify(result, null, 2), 'application/json');
  }

  private async getChangeMetadata(slug: string): Promise<any> {
    // Simulate reading change metadata
    return {
      type: 'change-metadata',
      slug,
      title: `Change: ${slug}`,
      status: 'active',
      files: [
        'proposal.md',
        'specs/api.md',
        'tasks/task-1.json'
      ],
      generated: new Date().toISOString()
    };
  }

  async exists(): Promise<boolean> {
    // URI parser demo resource always exists
    return true;
  }

  async getMetadata(): Promise<Record<string, any>> {
    return {
      type: 'uri-parser-demo',
      description: 'Demonstrates URI parsing with security validation',
      capabilities: [
        'changes://active with pagination',
        'change://[slug]/[file] access',
        'Query parameter validation',
        'Path traversal protection',
        'MIME type detection'
      ],
      supportedSchemes: ['changes', 'change'],
      security: {
        pathTraversalProtection: true,
        slugValidation: true,
        queryParamValidation: true,
        mimeTypeDetection: true
      }
    };
  }
}