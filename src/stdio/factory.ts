/**
 * Factory for creating Task MCP stdio server instances
 */

import { MCPServer } from './server.js';
import { ServerConfig, SecurityContext } from './types/index.js';
import { ToolRegistry } from './tools/registry.js';
import { ResourceRegistry } from './resources/registry.js';
import { ChangeOpenTool } from './tools/change-open.js';
import { ChangeArchiveTool } from './tools/change-archive.js';
import { ChangesResourceProvider } from './resources/changes-resource.js';
import { ProposalResourceProvider } from './resources/proposal-resource.js';
import { TaskResourceProvider } from './resources/task-resource.js';
import { DeltaResourceProvider } from './resources/delta-resource.js';
import { TaskMCPResourceProvider } from './resources/task-mcp-resource-provider.js';
import { canonicalize } from '../utils/core-utilities.js';
import * as path from 'path';
import * as os from 'os';

/**
 * Create a default security context
 */
export function createSecurityContext(workingDirectory?: string): SecurityContext {
  const sandboxRoot = workingDirectory || process.cwd();
  
  return {
    allowedPaths: [
      sandboxRoot,
      path.join(os.tmpdir(), 'openspec')
    ],
    sandboxRoot,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedSchemas: ['change.open', 'change.archive', 'resource.read', 'tool.call', 'changes', 'change']
  };
}

/**
 * Create a default server configuration
 */
export function createServerConfig(
  name: string = 'task-mcp-server',
  version: string = '1.0.0',
  security: SecurityContext,
  logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
): ServerConfig {
  // Create tool registry
  const toolRegistry = new ToolRegistry(security);
  
  // Register default tools
  toolRegistry.register(new ChangeOpenTool(security, console.log));
  toolRegistry.register(new ChangeArchiveTool(security, console.log));

  // Create resource registry
  const resourceRegistry = new ResourceRegistry(security);
  
  // Register default resource providers
  resourceRegistry.register(new TaskMCPResourceProvider(security, console.log));
  resourceRegistry.register(new ChangesResourceProvider(security, console.log));
  resourceRegistry.register(new ProposalResourceProvider(security, console.log));
  resourceRegistry.register(new TaskResourceProvider(security, console.log));
  resourceRegistry.register(new DeltaResourceProvider(security, console.log));

  return {
    name,
    version,
    logLevel,
    security,
    tools: toolRegistry.getDefinitions(),
    resources: resourceRegistry.getDefinitions()
  };
}

/**
 * Create and configure a Task MCP server
 */
export async function createServer(options: {
  name?: string;
  version?: string;
  workingDirectory?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}): Promise<MCPServer> {
  // Create security context
  const security = createSecurityContext(options.workingDirectory);
  
  // Ensure sandbox root exists
  await canonicalize(security.sandboxRoot, false);
  
  // Create tool registry
  const toolRegistry = new ToolRegistry(security);
  
  // Register default tools
  toolRegistry.register(new ChangeOpenTool(security, console.log));
  toolRegistry.register(new ChangeArchiveTool(security, console.log));

  // Create resource registry
  const resourceRegistry = new ResourceRegistry(security);
  
  // Register default resource providers
  resourceRegistry.register(new TaskMCPResourceProvider(security, console.log));
  resourceRegistry.register(new ChangesResourceProvider(security, console.log));
  resourceRegistry.register(new ProposalResourceProvider(security, console.log));
  resourceRegistry.register(new TaskResourceProvider(security, console.log));
  resourceRegistry.register(new DeltaResourceProvider(security, console.log));

  // Create server configuration
  const config = createServerConfig(
    options.name,
    options.version,
    security,
    options.logLevel
  );

  // Create server and set registries
  const server = new MCPServer(config);
  server.setToolRegistry(toolRegistry);
  server.setResourceRegistry(resourceRegistry);

  return server;
}

/**
 * Create a development server with info-level logging
 */
export async function createDevServer(workingDirectory?: string): Promise<MCPServer> {
  return createServer({
    name: 'task-mcp-dev-server',
    version: '1.0.0-dev',
    workingDirectory,
    logLevel: 'info'
  });
}

/**
 * Create a production server with warn-level logging
 */
export async function createProdServer(workingDirectory?: string): Promise<MCPServer> {
  return createServer({
    name: 'task-mcp-server',
    version: '1.0.0',
    workingDirectory,
    logLevel: 'warn'
  });
}