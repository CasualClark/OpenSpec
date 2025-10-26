// File system utilities
export { FileSystemUtils } from './file-system.js';

// Core utilities for Task MCP server
export { 
  canonicalize, 
  validate_slug, 
  atomic_lock,
  AtomicLockError,
  type LockInfo 
} from './core-utilities.js';

// URI parsing utilities for MCP resource URIs
export {
  parseUri,
  validateQueryParams,
  isUriSafe,
  buildUri,
  normalizeUri,
  extractChangeFilePath,
  isChangesActiveUri,
  isChangeUri,
  UriParseError,
  type ParsedUri,
  type QueryParamRule,
  type UriParserConfig,
} from './uri-parser.js';