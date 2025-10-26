/**
 * Streamable HTTP (NDJSON) route handler for MCP
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { 
  HTTPToolRequest, 
  HTTPToolResponse, 
  HTTPErrorResponse, 
  NDJSONEvent,
  HTTPError,
  RequestContext,
  ServerConfig,
  ToolResult
} from '../types.js';

// Global MCP server instance (singleton) - shared with SSE
let mcpServerInstance: any = null;

/**
 * Get or create MCP server instance
 */
async function getMCPServer(config: ServerConfig): Promise<any> {
  if (!mcpServerInstance) {
    // Use the compiled JavaScript version from dist
    const factoryModule = require('/home/oakley/mcps/OpenSpec/dist/src/stdio/factory.js');
    mcpServerInstance = await factoryModule.createServer({
      name: 'task-mcp-http-server',
      version: '1.0.0',
      workingDirectory: config.workingDirectory,
      logLevel: config.logging.level
    });
  }
  return mcpServerInstance;
}

/**
 * MCP route handler (Streamable HTTP with NDJSON)
 */
export async function mcpRouteHandler(
  request: FastifyRequest<{ Body: HTTPToolRequest }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id || uuidv4();
  const startTime = Date.now();
  const config = (request as any).server.config as ServerConfig;
  
  // Set NDJSON headers
  reply.raw.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });

  const writeEvent = (event: NDJSONEvent): void => {
    reply.raw.write(`${JSON.stringify(event)}\n`);
  };

  try {
    request.log.info({ requestId }, `MCP tool request: ${(request.body as HTTPToolRequest).tool}`);

    // Send start event with tool and apiVersion
    writeEvent({
      type: 'start',
      ts: Date.now(),
      tool: (request.body as HTTPToolRequest).tool,
      apiVersion: (request.body as HTTPToolRequest).apiVersion || '1.0.0'
    });

    // Get MCP server instance
    const mcpServer = await getMCPServer(config);
    
    // Execute the tool through MCP server
    const result = await executeTool(mcpServer, request.body as HTTPToolRequest, {
      requestId,
      timestamp: startTime,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
      auth: (request as any).auth
    });

    // Check response size limit
    const responseSize = JSON.stringify(result).length;
    const maxSizeBytes = config.responseLimits.maxResponseSizeKb * 1024;
    
    if (responseSize > maxSizeBytes) {
      throw new HTTPError(
        413,
        'RESPONSE_TOO_LARGE',
        `Response size (${Math.round(responseSize / 1024)}KB) exceeds limit of ${config.responseLimits.maxResponseSizeKb}KB`,
        'Consider using pagination or reducing the amount of data requested'
      );
    }

    // Send result event
    writeEvent({
      type: 'result',
      ts: Date.now(),
      result,
    });

    request.log.info({ requestId }, `MCP tool completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    request.log.error({ requestId, error }, `MCP tool error`);

    // Send error event
    writeEvent({
      type: 'error',
      ts: Date.now(),
      error: normalizeError(error),
    });
  } finally {
    // Send end event and close connection
    writeEvent({
      type: 'end',
      ts: Date.now(),
    });
    reply.raw.end();
  }
}

/**
 * Execute tool with given parameters using MCP server
 */
async function executeTool(
  mcpServer: any,
  request: HTTPToolRequest,
  context: RequestContext
): Promise<ToolResult> {
  const { tool, input } = request;
  
  // Validate tool name
  if (!tool || typeof tool !== 'string') {
    throw new HTTPError(
      400,
      'INVALID_TOOL_NAME',
      'Tool name is required and must be a string',
      'Valid tools: change.open, change.archive'
    );
  }

  // Get tool from MCP server
  const toolRegistry = mcpServer.toolRegistry;
  if (!toolRegistry) {
    throw new HTTPError(
      500,
      'TOOL_REGISTRY_UNAVAILABLE',
      'Tool registry is not available',
      'Server configuration issue'
    );
  }

  const toolInstance = toolRegistry.get(tool);
  if (!toolInstance) {
    throw new HTTPError(
      404,
      'TOOL_NOT_FOUND',
      `Tool '${tool}' not found`,
      `Available tools: ${toolRegistry.getNames().join(', ')}`
    );
  }

  // Validate input against tool schema
  const validationResult = toolInstance.definition.inputSchema.safeParse(input);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues.map(
      (issue: any) => `${issue.path.join('.')}: ${issue.message}`
    ).join(', ');
    
    throw new HTTPError(
      400,
      'INVALID_INPUT',
      `Invalid input for tool '${tool}': ${errorMessages}`,
      'Check the input schema and try again'
    );
  }

  try {
    // Execute the tool
    const result = await toolInstance.execute(validationResult.data);
    
    // Ensure result conforms to ToolResult interface
    if (!result || typeof result !== 'object') {
      throw new HTTPError(
        500,
        'INVALID_TOOL_RESULT',
        `Tool '${tool}' returned invalid result`,
        'Tool must return a valid ToolResult object'
      );
    }

    return result as ToolResult;
  } catch (error) {
    // If it's already an HTTPError, re-throw it
    if (error instanceof HTTPError) {
      throw error;
    }

    // Convert tool execution errors to HTTPError
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new HTTPError(
      500,
      'TOOL_EXECUTION_ERROR',
      `Tool '${tool}' execution failed: ${errorMessage}`,
      'Check tool input and server logs for more details'
    );
  }
}

/**
 * Normalize error for HTTP response
 */
function normalizeError(error: unknown): {
  code: string;
  message: string;
  hint?: string;
  details?: any;
} {
  if (error instanceof HTTPError) {
    return {
      code: error.code,
      message: error.message,
      hint: error.hint,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
      hint: 'An unexpected error occurred while processing the request',
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    hint: 'Please try again or contact support if the issue persists',
  };
}