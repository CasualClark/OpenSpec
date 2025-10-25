/**
 * Security Middleware Index for Task MCP HTTPS/SSE Server
 * 
 * Centralized exports for all security components
 */

export { AuthenticationMiddleware } from './auth.js';
export { AuditLogger, createAuditLogger } from './audit.js';
export { CorsMiddleware } from './cors.js';
export { RateLimitMiddleware, createRateLimitMiddleware } from './rateLimit.js';
export { SecurityHeadersMiddleware, createSecurityHeadersMiddleware } from './headers.js';

export type {
  AuthContext,
  TokenInfo
} from './auth.js';

export type {
  AuditEvent,
  SecurityMetrics
} from './audit.js';

export type {
  CorsConfig
} from './cors.js';

export type {
  RateLimitConfig,
  RateLimitInfo,
  RateLimitRecord
} from './rateLimit.js';

export type {
  SecurityHeadersConfig
} from './headers.js';