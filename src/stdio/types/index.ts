/**
 * Type definitions for Task MCP stdio server
 */

import { z } from 'zod';

// JSON-RPC 2.0 base types
export const JSONRPC_VERSION = '2.0';

export interface JsonRpcRequest<T = any> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number | null;
  method: string;
  params?: T;
}

export interface JsonRpcResponse<T = any> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number | null;
  result?: T;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export interface JsonRpcNotification<T = any> {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: T;
}

// MCP Protocol types
export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: {
    tools?: Record<string, any>;
    resources?: Record<string, any>;
    logging?: Record<string, any>;
  };
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: {
      listChanged?: boolean;
    };
    resources?: {
      subscribe?: boolean;
      listChanged?: boolean;
    };
    logging?: Record<string, any>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

// Tool types
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// Resource types
export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// Security types
export interface SecurityContext {
  allowedPaths: string[];
  sandboxRoot: string;
  maxFileSize: number;
  allowedSchemas: string[];
  user?: UserIdentity;
  authContext?: AuthenticationContext;
}

export interface UserIdentity {
  id: string;
  type: 'local' | 'remote' | 'service' | 'ci';
  username?: string;
  email?: string;
  hostname?: string;
  sessionId?: string;
  token?: string;
  metadata?: Record<string, any>;
}

export interface AuthenticationContext {
  user: UserIdentity;
  timestamp: number;
  source: 'stdio' | 'http' | 'cli';
  ipAddress?: string;
  userAgent?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    path: string;
    message: string;
    code: string;
  }>;
}

// Server configuration
export interface ServerConfig {
  name: string;
  version: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  security: SecurityContext;
  tools: Record<string, ToolDefinition>;
  resources: Record<string, ResourceDefinition>;
}

// Lock integration types
export interface LockContext {
  owner: string;
  ttl: number;
  lockPath: string;
  autoRefresh?: boolean;
}

export interface LockInfo {
  owner: string;
  since: number;
  ttl: number;
  metadata?: Record<string, any>;
}

// Error codes
export enum ErrorCode {
  // JSON-RPC errors
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  
  // MCP errors
  ToolNotFound = -32001,
  InvalidToolInput = -32002,
  ToolExecutionError = -32003,
  ResourceNotFound = -32004,
  ResourceAccessDenied = -32005,
  
  // Security errors
  PathTraversal = -33001,
  SchemaValidation = -33002,
  LockAcquisition = -33003,
  PermissionDenied = -33004,
}

// Event types
export interface ServerEvent {
  type: 'tool_call' | 'resource_access' | 'lock_operation' | 'security_violation' | 'tool_list_changed' | 'resource_list_changed';
  timestamp: number;
  data: any;
}

export interface EventHandler {
  (event: ServerEvent): void;
}