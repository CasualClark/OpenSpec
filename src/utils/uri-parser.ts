/**
 * URI parsing utilities for MCP resource URIs
 * 
 * Supports:
 * - changes://active with query parameters
 * - change://[slug]/[file] patterns
 * - Query parameter validation
 * - Path traversal protection
 * - MIME type detection from extensions
 */

import * as path from 'path';
import { validate_slug } from './core-utilities.js';

/**
 * Parsed URI components for MCP resource URIs
 */
export interface ParsedUri {
  /** Full original URI */
  uri: string;
  /** URI scheme (e.g., 'changes', 'change') */
  scheme: string;
  /** URI host/path component */
  host: string;
  /** Path segments after host */
  pathSegments: string[];
  /** Query parameters as key-value pairs */
  queryParams: Record<string, string>;
  /** Fragment identifier */
  fragment?: string;
  /** Detected MIME type based on file extension */
  mimeType?: string;
  /** Security validation results */
  security: {
    hasPathTraversal: boolean;
    hasInvalidSlug: boolean;
    hasInvalidQueryParams: boolean;
    warnings: string[];
  };
}

/**
 * Query parameter validation rules
 */
export interface QueryParamRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: string[];
}

/**
 * URI parsing configuration
 */
export interface UriParserConfig {
  /** Maximum number of path segments allowed */
  maxPathSegments?: number;
  /** Maximum query parameter value length */
  maxQueryParamLength?: number;
  /** Whether to allow fragments */
  allowFragments?: boolean;
  /** Custom MIME type mappings */
  customMimeTypes?: Record<string, string>;
}

/**
 * Default MIME type mappings for common file extensions
 */
const DEFAULT_MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.xml': 'application/xml',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.diff': 'text/plain',
  '.patch': 'text/plain',
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<UriParserConfig> = {
  maxPathSegments: 10,
  maxQueryParamLength: 1000,
  allowFragments: true,
  customMimeTypes: {},
};

/**
 * URI parsing error class
 */
export class UriParseError extends Error {
  constructor(
    message: string,
    public readonly uri: string,
    public readonly code: string = 'PARSE_ERROR'
  ) {
    super(message);
    this.name = 'UriParseError';
  }
}

/**
 * Parse MCP resource URI with security validation
 * 
 * @param uri The URI to parse
 * @param config Optional configuration
 * @returns Parsed URI components
 * @throws UriParseError if URI is invalid or contains security issues
 */
export function parseUri(uri: string, config?: UriParserConfig): ParsedUri {
  if (!uri || typeof uri !== 'string') {
    throw new UriParseError('URI must be a non-empty string', uri || '', 'INVALID_URI');
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  try {
    // Basic URI structure validation
    const uriMatch = uri.match(/^([^:]+):\/\/([^?#]+)(\?[^#]*)?(#.*)?$/);
    if (!uriMatch) {
      throw new UriParseError('Invalid URI format', uri, 'INVALID_FORMAT');
    }

    const [, scheme, host, queryString, fragmentString] = uriMatch;

    // Validate scheme
    if (!scheme || !/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(scheme)) {
      throw new UriParseError('Invalid URI scheme', uri, 'INVALID_SCHEME');
    }

    // Parse path segments
    const pathSegments = host.split('/').filter(segment => segment.length > 0);
    
    // Validate path segment count
    if (pathSegments.length > finalConfig.maxPathSegments) {
      throw new UriParseError(
        `Too many path segments (max: ${finalConfig.maxPathSegments})`,
        uri,
        'TOO_MANY_SEGMENTS'
      );
    }

    // Parse query parameters
    const queryParams: Record<string, string> = {};
    if (queryString) {
      const query = queryString.substring(1); // Remove '?'
      const pairs = query.split('&');
      
      for (const pair of pairs) {
        if (pair.length === 0) continue;
        
        const [key, ...valueParts] = pair.split('=');
        const value = valueParts.join('='); // Handle values with '='
        
        if (key.length === 0) continue;
        
        // Validate parameter length
        if (value.length > finalConfig.maxQueryParamLength) {
          throw new UriParseError(
            `Query parameter value too long: ${key}`,
            uri,
            'PARAM_TOO_LONG'
          );
        }
        
        queryParams[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    }

    // Parse fragment
    let fragment: string | undefined;
    if (fragmentString) {
      if (!finalConfig.allowFragments) {
        throw new UriParseError('Fragments not allowed', uri, 'FRAGMENT_NOT_ALLOWED');
      }
      fragment = fragmentString.substring(1); // Remove '#'
    }

    // Security validation
    const security = {
      hasPathTraversal: false,
      hasInvalidSlug: false,
      hasInvalidQueryParams: false,
      warnings: [] as string[],
    };

    // Check for path traversal attempts
    for (const segment of pathSegments) {
      if (segment.includes('..') || segment.includes('~') || segment.includes('\0')) {
        security.hasPathTraversal = true;
        security.warnings.push(`Potential path traversal in segment: ${segment}`);
      }
    }

    // Validate slug format for change:// URIs
    if (scheme === 'change' && pathSegments.length > 0) {
      const slug = pathSegments[0];
      if (!validate_slug(slug)) {
        security.hasInvalidSlug = true;
        security.warnings.push(`Invalid slug format: ${slug}`);
      }
    }

    // Detect MIME type
    let mimeType: string | undefined;
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      const ext = path.extname(lastSegment).toLowerCase();
      
      const mimeMap = { ...DEFAULT_MIME_TYPES, ...finalConfig.customMimeTypes };
      mimeType = mimeMap[ext] || 'application/octet-stream';
    }

    return {
      uri,
      scheme,
      host,
      pathSegments,
      queryParams,
      fragment,
      mimeType,
      security,
    };
  } catch (error) {
    if (error instanceof UriParseError) {
      throw error;
    }
    throw new UriParseError(
      `Failed to parse URI: ${error instanceof Error ? error.message : String(error)}`,
      uri,
      'PARSE_FAILED'
    );
  }
}

/**
 * Validate query parameters against rules
 * 
 * @param queryParams Query parameters to validate
 * @param rules Validation rules
 * @returns Validation result
 */
export function validateQueryParams(
  queryParams: Record<string, string>,
  rules: Record<string, QueryParamRule>
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [key, rule] of Object.entries(rules)) {
    const value = queryParams[key];

    // Check required parameters
    if (rule.required && (value === undefined || value === '')) {
      errors.push(`Required parameter '${key}' is missing`);
      continue;
    }

    // Skip validation if parameter is not provided and not required
    if (value === undefined) {
      continue;
    }

    // Type validation
    if (rule.type) {
      switch (rule.type) {
        case 'number':
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push(`Parameter '${key}' must be a number`);
          } else {
            // Range validation for numbers
            if (rule.min !== undefined && numValue < rule.min) {
              errors.push(`Parameter '${key}' must be at least ${rule.min}`);
            }
            if (rule.max !== undefined && numValue > rule.max) {
              errors.push(`Parameter '${key}' must be at most ${rule.max}`);
            }
          }
          break;
        case 'boolean':
          if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
            errors.push(`Parameter '${key}' must be true or false`);
          }
          break;
      }
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`Parameter '${key}' does not match required pattern`);
    }

    // Allowed values validation
    if (rule.allowedValues && !rule.allowedValues.includes(value)) {
      errors.push(`Parameter '${key}' must be one of: ${rule.allowedValues.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a URI is safe based on security validation
 * 
 * @param parsedUri Parsed URI to check
 * @param allowWarnings Whether to allow URIs with warnings
 * @returns True if URI is considered safe
 */
export function isUriSafe(parsedUri: ParsedUri, allowWarnings: boolean = false): boolean {
  if (parsedUri.security.hasPathTraversal || parsedUri.security.hasInvalidSlug) {
    return false;
  }

  if (!allowWarnings && parsedUri.security.warnings.length > 0) {
    return false;
  }

  return true;
}

/**
 * Build a URI from components
 * 
 * @param components URI components
 * @returns Built URI string
 */
export function buildUri(components: {
  scheme: string;
  host: string;
  queryParams?: Record<string, string>;
  fragment?: string;
}): string {
  let uri = `${components.scheme}://${components.host}`;

  if (components.queryParams && Object.keys(components.queryParams).length > 0) {
    const query = Object.entries(components.queryParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    uri += `?${query}`;
  }

  if (components.fragment) {
    uri += `#${encodeURIComponent(components.fragment)}`;
  }

  return uri;
}

/**
 * Normalize a URI by parsing and rebuilding it
 * 
 * @param uri URI to normalize
 * @param config Optional configuration
 * @returns Normalized URI
 */
export function normalizeUri(uri: string, config?: UriParserConfig): string {
  const parsed = parseUri(uri, config);
  
  return buildUri({
    scheme: parsed.scheme,
    host: parsed.host,
    queryParams: Object.keys(parsed.queryParams).length > 0 ? parsed.queryParams : undefined,
    fragment: parsed.fragment,
  });
}

/**
 * Extract file path from a change:// URI
 * 
 * @param parsedUri Parsed change:// URI
 * @returns File path relative to change directory
 */
export function extractChangeFilePath(parsedUri: ParsedUri): string {
  if (parsedUri.scheme !== 'change') {
    throw new UriParseError('Not a change:// URI', parsedUri.uri, 'INVALID_SCHEME');
  }

  if (parsedUri.pathSegments.length === 0) {
    throw new UriParseError('No slug specified in change:// URI', parsedUri.uri, 'MISSING_SLUG');
  }

  const [, ...filePathSegments] = parsedUri.pathSegments;
  return filePathSegments.join('/');
}

/**
 * Check if a URI is a changes://active URI
 * 
 * @param uri URI to check
 * @returns True if URI is changes://active
 */
export function isChangesActiveUri(uri: string): boolean {
  try {
    const parsed = parseUri(uri);
    return parsed.scheme === 'changes' && parsed.host === 'active';
  } catch {
    return false;
  }
}

/**
 * Check if a URI is a change:// URI
 * 
 * @param uri URI to check
 * @returns True if URI is change://
 */
export function isChangeUri(uri: string): boolean {
  try {
    const parsed = parseUri(uri);
    return parsed.scheme === 'change';
  } catch {
    return false;
  }
}