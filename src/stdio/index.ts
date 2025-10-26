/**
 * Task MCP Stdio Server
 * 
 * JSON-RPC 2.0 server implementation for MCP protocol over stdio transport.
 * Provides tool registration framework and security integration with OpenSpec utilities.
 */

export * from './server.js';
export * from './tools/index.js';
export * from './resources/index.js';
export { 
  AuthenticationManager, 
  UserIdentity, 
  AuthenticationContext,
  AuthenticationResult 
} from './security/auth.js';
export { 
  AuthorizationEngine, 
  ResourceAccessRule, 
  AuthorizationDecision, 
  ResourceOwnership 
} from './security/authorization.js';
export { 
  AccessControlEngine, 
  AccessControlContext, 
  AccessControlResult 
} from './security/access-control.js';
export { 
  AuditLogger, 
  AuditEvent, 
  AuditLogConfig, 
  AuditSummary 
} from './security/audit-logger.js';
export * from './security/sandbox.js';
export * from './security/validator.js';
export * from './security/path-protection.js';
export * from './types/index.js';