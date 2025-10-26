/**
 * JSON-RPC 2.0 Server implementation for MCP protocol
 */

import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { 
  JsonRpcRequest, 
  JsonRpcResponse, 
  JsonRpcNotification,
  JsonRpcError,
  MCPInitializeParams,
  MCPInitializeResult,
  ServerConfig,
  ServerEvent,
  EventHandler,
  ErrorCode,
  JSONRPC_VERSION
} from './types/index.js';

export class MCPServer extends EventEmitter {
  private config: ServerConfig;
  private input: Readable;
  private output: Writable;
  private initialized = false;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private buffer = '';
  private toolRegistry?: any;
  private resourceRegistry?: any;

  constructor(config: ServerConfig, input: Readable = process.stdin, output: Writable = process.stdout) {
    super();
    this.config = config;
    this.input = input;
    this.output = output;
    this.setupStdioHandlers();
  }

  /**
   * Set tool registry for executing tools
   */
  setToolRegistry(toolRegistry: any): void {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Set resource registry for accessing resources
   */
  setResourceRegistry(resourceRegistry: any): void {
    this.resourceRegistry = resourceRegistry;
  }

  /**
   * Start the server and begin processing messages
   */
  async start(): Promise<void> {
    this.log('info', `Starting ${this.config.name} v${this.config.version}`);
    
    // Set up error handling
    this.input.on('error', (error: Error) => {
      this.log('error', `Input stream error: ${error.message}`);
      this.emit('error', error);
    });

    this.output.on('error', (error: Error) => {
      this.log('error', `Output stream error: ${error.message}`);
      this.emit('error', error);
    });
  }

  /**
   * Stop the server and clean up resources
   */
  async stop(): Promise<void> {
    this.log('info', 'Stopping server');
    this.removeAllListeners();
  }

  /**
   * Set up stdio message handlers
   */
  private setupStdioHandlers(): void {
    this.input.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');
      this.processMessages();
    });

    this.input.on('end', () => {
      this.log('info', 'Input stream ended');
      this.shutdown();
    });
  }

  /**
   * Process buffered messages
   */
  private processMessages(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        this.processMessage(line.trim());
      }
    }
  }

  /**
   * Process a single JSON-RPC message
   */
  private async processMessage(message: string): Promise<void> {
    try {
      const data = JSON.parse(message);
      
      // Determine if this is a request or notification
      if ('id' in data) {
        await this.handleRequest(data as JsonRpcRequest);
      } else {
        await this.handleNotification(data as JsonRpcNotification);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', `Message processing error: ${errorMessage}`);
      
      // Try to send error response if we can parse the ID
      try {
        const data = JSON.parse(message);
        if ('id' in data) {
          await this.sendError(data.id, ErrorCode.ParseError, 'Invalid JSON', { original: message });
        }
      } catch {
        // Can't even parse to get ID, just log and continue
      }
    }
  }

  /**
   * Handle JSON-RPC request
   */
  async handleRequest(request: JsonRpcRequest): Promise<void> {

    try {
      // Validate JSON-RPC version
      if (request.jsonrpc !== JSONRPC_VERSION) {
        throw new Error(`Invalid JSON-RPC version: ${request.jsonrpc}`);
      }

      // Check if server is initialized
      if (request.method !== 'initialize' && !this.initialized) {
        throw new Error('Server not initialized');
      }

      let result: any;

      switch (request.method) {
        case 'initialize':
          result = await this.handleInitialize(request.params as MCPInitializeParams);
          break;
        
        case 'tools/list':
          result = await this.handleToolsList();
          break;
        
        case 'tools/call':
          result = await this.handleToolsCall(request.params);
          break;
        
        case 'resources/list':
          result = await this.handleResourcesList();
          break;
        
        case 'resources/read':
          result = await this.handleResourcesRead(request.params);
          break;
        
        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      await this.sendResult(request.id, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = this.mapErrorToCode(error);
      const correlationId = (error as any).correlationId || this.generateCorrelationId();
      const actions = (error as any).actions || [];
      const severity = (error as any).severity || 'medium';
      const retryable = (error as any).retryable !== false;
      
      this.log('error', `Request handling error: ${errorMessage}`, {
        correlationId,
        code: (error as any).code || errorCode,
        severity,
        retryable
      });
      
      await this.sendEnhancedError(request.id, errorCode, errorMessage, {
        correlationId,
        actions,
        severity,
        retryable,
        field: (error as any).field
      });
    }
  }

  /**
   * Handle JSON-RPC notification
   */
  private async handleNotification(notification: JsonRpcNotification): Promise<void> {

    try {
      switch (notification.method) {
        case 'notifications/initialized':
          this.initialized = true;
          this.log('info', 'Server initialized');
          break;
        
        default:
          this.log('warn', `Unknown notification method: ${notification.method}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', `Notification handling error: ${errorMessage}`);
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(params: MCPInitializeParams): Promise<MCPInitializeResult> {
    this.log('info', `Initializing with client: ${params.clientInfo.name} v${params.clientInfo.version}`);
    
    const result: MCPInitializeResult = {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: true
        },
        resources: {
          subscribe: true,
          listChanged: true
        }
      },
      serverInfo: {
        name: this.config.name,
        version: this.config.version
      }
    };

    return result;
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(): Promise<{ tools: any[] }> {
    const tools = Object.entries(this.config.tools).map(([name, definition]) => ({
      name,
      description: definition.description,
      inputSchema: definition.inputSchema
    }));

    return { tools };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: any): Promise<any> {
    const { name, arguments: args } = params;
    
    this.emitEvent({
      type: 'tool_call',
      timestamp: Date.now(),
      data: { name, arguments: args }
    });

    if (!this.toolRegistry) {
      throw new Error('Tool registry not set');
    }

    const tool = this.toolRegistry.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Validate input
    const validationResult = tool.definition.inputSchema.safeParse(args);
    if (!validationResult.success) {
      throw new Error(`Invalid tool input: ${validationResult.error.message}`);
    }

    // Execute the tool
    try {
      const result = await tool.execute(args);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', `Tool execution error: ${errorMessage}`);
      throw new Error(`Tool execution failed: ${errorMessage}`);
    }
  }

  /**
   * Handle resources/list request
   */
  private async handleResourcesList(): Promise<{ resources: any[] }> {
    const resources = Object.entries(this.config.resources).map(([uri, definition]) => ({
      uri,
      name: definition.name,
      description: definition.description,
      mimeType: definition.mimeType
    }));

    return { resources };
  }

  /**
   * Handle resources/read request
   */
  private async handleResourcesRead(params: any): Promise<any> {
    const { uri } = params;
    
    this.emitEvent({
      type: 'resource_access',
      timestamp: Date.now(),
      data: { uri }
    });

    if (!this.resourceRegistry) {
      throw new Error('Resource registry not set');
    }

    // Find the matching resource provider
    const resourceProviders = this.resourceRegistry.getProviders();
    let matchingProvider = null;

    for (const provider of resourceProviders) {
      if (uri.startsWith(provider.definition.uri)) {
        matchingProvider = provider;
        break;
      }
    }

    if (!matchingProvider) {
      throw new Error(`Resource not found: ${uri}`);
    }

    try {
      const result = await matchingProvider.read(uri);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', `Resource access error: ${errorMessage}`);
      throw new Error(`Resource access failed: ${errorMessage}`);
    }
  }

  /**
   * Send a successful response
   */
  private async sendResult(id: string | number | null, result: any): Promise<void> {
    const response: JsonRpcResponse = {
      jsonrpc: JSONRPC_VERSION,
      id,
      result
    };

    await this.sendMessage(response);
  }

  /**
   * Send an error response
   */
  private async sendError(id: string | number | null, code: number, message: string, data?: any): Promise<void> {
    const error: JsonRpcError = {
      code,
      message,
      data
    };

    const response: JsonRpcResponse = {
      jsonrpc: JSONRPC_VERSION,
      id,
      error
    };

    await this.sendMessage(response);
  }

  /**
   * Send a notification
   */
  private async sendNotification(method: string, params?: any): Promise<void> {
    const notification: JsonRpcNotification = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params
    };

    await this.sendMessage(notification);
  }

  /**
   * Send a JSON-RPC message
   */
  private async sendMessage(message: any): Promise<void> {
    const json = JSON.stringify(message);
    this.output.write(json + '\n');
  }

  /**
   * Map error to JSON-RPC error code
   */
  private mapErrorToCode(error: any): number {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return ErrorCode.MethodNotFound;
      }
      if (error.message.includes('Invalid')) {
        return ErrorCode.InvalidParams;
      }
    }
    return ErrorCode.InternalError;
  }

  /**
   * Emit a server event
   */
  private emitEvent(event: ServerEvent): void {
    this.emit('serverEvent', event);
    
    // Also emit to specific event handlers
    const handlers = this.eventHandlers.get(event.type) || [];
    handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        this.log('error', `Event handler error: ${error}`);
      }
    });
  }

  /**
   * Register an event handler
   */
  onEvent(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);
  }

  /**
   * Log a message
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any): void {
    // Skip debug messages unless in debug mode
    if (level === 'debug' && this.config.logLevel !== 'debug') {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${this.config.name}] ${message}`;
    
    if (context) {
      console.log(logMessage, context);
    } else {
      if (level === 'error') {
        console.error(logMessage);
      } else if (level === 'warn') {
        console.warn(logMessage);
      } else {
        console.log(logMessage);
      }
    }
  }

  /**
   * Generate correlation ID for error tracking
   */
  private generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `openspec_${timestamp}_${random}`;
  }

  /**
   * Send enhanced error response with correlation ID and actions
   */
  private async sendEnhancedError(
    id: string | number | null,
    code: number,
    message: string,
    options: {
      correlationId: string;
      actions: string[];
      severity: string;
      retryable: boolean;
      field?: string;
    }
  ): Promise<void> {
    const error = {
      code,
      message,
      data: {
        correlationId: options.correlationId,
        category: 'validation',
        severity: options.severity,
        retryable: options.retryable,
        actions: options.actions,
        context: {
          field: options.field
        }
      }
    };

    const response: JsonRpcResponse = {
      jsonrpc: JSONRPC_VERSION,
      id,
      error
    };

    await this.sendMessage(response);
  }

  /**
   * Shutdown the server
   */
  public async shutdown(): Promise<void> {
    this.log('info', 'Server shutting down');
    this.emit('shutdown');
  }
}