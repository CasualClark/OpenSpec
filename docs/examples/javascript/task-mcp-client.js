/**
 * Task MCP HTTP Client - JavaScript/Node.js Implementation
 * 
 * A comprehensive client for interacting with Task MCP HTTP server
 * supporting both SSE and NDJSON transports.
 */

class TaskMCPClient {
  /**
   * Create a new Task MCP client
   * @param {string} baseUrl - Base URL of the Task MCP server
   * @param {string} authToken - Authentication token
   * @param {Object} options - Configuration options
   */
  constructor(baseUrl, authToken, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.authToken = authToken;
    this.options = {
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      enableLogging: options.enableLogging || false,
      ...options
    };
  }

  /**
   * Execute tool using Server-Sent Events (SSE)
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} input - Tool input parameters
   * @returns {Promise<Object>} Tool execution result
   */
  async executeToolSSE(toolName, input) {
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.options.retryAttempts) {
      try {
        const result = await this._executeSSERequest(toolName, input);
        
        if (this.options.enableLogging) {
          console.log(`[TaskMCP] Tool '${toolName}' executed in ${Date.now() - startTime}ms`);
        }
        
        return result;
      } catch (error) {
        attempt++;
        
        if (attempt >= this.options.retryAttempts || !this._isRetryableError(error)) {
          throw error;
        }

        const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
        
        if (this.options.enableLogging) {
          console.warn(`[TaskMCP] Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        }
        
        await this._sleep(delay);
      }
    }
  }

  /**
   * Execute tool using NDJSON transport
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} input - Tool input parameters
   * @returns {Promise<Object>} Tool execution result
   */
  async executeToolNDJSON(toolName, input) {
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.options.retryAttempts) {
      try {
        const result = await this._executeNDJSONRequest(toolName, input);
        
        if (this.options.enableLogging) {
          console.log(`[TaskMCP] Tool '${toolName}' executed in ${Date.now() - startTime}ms`);
        }
        
        return result;
      } catch (error) {
        attempt++;
        
        if (attempt >= this.options.retryAttempts || !this._isRetryableError(error)) {
          throw error;
        }

        const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
        
        if (this.options.enableLogging) {
          console.warn(`[TaskMCP] Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        }
        
        await this._sleep(delay);
      }
    }
  }

  /**
   * Execute SSE request
   * @private
   */
  async _executeSSERequest(toolName, input) {
    const response = await fetch(`${this.baseUrl}/sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        tool: toolName,
        input: input,
        apiVersion: '1.0.0'
      }),
      signal: AbortSignal.timeout(this.options.timeout)
    });

    if (!response.ok) {
      await this._handleHTTPError(response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          if (event.trim()) {
            const parsedEvent = this._parseSSEEvent(event);
            
            if (parsedEvent.type === 'result') {
              result = parsedEvent.data.result;
            } else if (parsedEvent.type === 'error') {
              throw new Error(parsedEvent.data.error.message);
            } else if (parsedEvent.type === 'heartbeat') {
              // Heartbeat received, connection is alive
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!result) {
      throw new Error('No result received from server');
    }

    return result;
  }

  /**
   * Execute NDJSON request
   * @private
   */
  async _executeNDJSONRequest(toolName, input) {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        'Accept': 'application/x-ndjson'
      },
      body: JSON.stringify({
        tool: toolName,
        input: input,
        apiVersion: '1.0.0'
      }),
      signal: AbortSignal.timeout(this.options.timeout)
    });

    if (!response.ok) {
      await this._handleHTTPError(response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              
              if (event.type === 'result') {
                result = event.result;
              } else if (event.type === 'error') {
                throw new Error(event.error.message);
              } else if (event.type === 'start') {
                // Request started
                continue;
              } else if (event.type === 'end') {
                // Request ended
                break;
              }
            } catch (parseError) {
              console.warn('[TaskMCP] Failed to parse NDJSON line:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!result) {
      throw new Error('No result received from server');
    }

    return result;
  }

  /**
   * Parse SSE event
   * @private
   */
  _parseSSEEvent(rawMessage) {
    const lines = rawMessage.split('\n');
    const event = {};
    
    for (const line of lines) {
      const [field, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      if (field === 'event') {
        event.type = value;
      } else if (field === 'data') {
        try {
          event.data = JSON.parse(value);
        } catch (e) {
          event.data = value;
        }
      } else if (field === 'id') {
        event.id = value;
      } else if (field === 'retry') {
        event.retry = parseInt(value);
      }
    }

    return event;
  }

  /**
   * Handle HTTP error responses
   * @private
   */
  async _handleHTTPError(response) {
    let errorData;
    
    try {
      errorData = await response.json();
    } catch (e) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const error = new Error(errorData.error?.message || `HTTP ${response.status}`);
    error.code = errorData.error?.code || 'HTTP_ERROR';
    error.statusCode = response.status;
    error.details = errorData.error?.details;

    throw error;
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableCodes = [
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_ERROR',
      'TIMEOUT',
      'CONNECTION_ERROR'
    ];

    const retryableStatusCodes = [429, 500, 502, 503, 504];

    return retryableCodes.includes(error.code) || 
           retryableStatusCodes.includes(error.statusCode) ||
           error.name === 'TimeoutError' ||
           error.name === 'AbortError';
  }

  /**
   * Sleep for specified milliseconds
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const response = await fetch(`${this.baseUrl}/healthz`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Health check failed: HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get server metrics (requires authentication)
   * @returns {Promise<Object>} Server metrics
   */
  async getMetrics() {
    const response = await fetch(`${this.baseUrl}/security/metrics`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Failed to get metrics: HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Close client and cleanup resources
   */
  close() {
    // Cleanup any active connections or resources
    if (this.options.enableLogging) {
      console.log('[TaskMCP] Client closed');
    }
  }
}

// Convenience methods for common operations
class TaskMCPClientExtensions extends TaskMCPClient {
  /**
   * Create a new change
   * @param {string} title - Change title
   * @param {string} slug - Change slug
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Creation result
   */
  async createChange(title, slug, options = {}) {
    const input = {
      title,
      slug,
      template: options.template || 'feature',
      rationale: options.rationale,
      owner: options.owner,
      ttl: options.ttl
    };

    return this.executeToolSSE('change.open', input);
  }

  /**
   * Archive a change
   * @param {string} slug - Change slug to archive
   * @returns {Promise<Object>} Archive result
   */
  async archiveChange(slug) {
    return this.executeToolSSE('change.archive', { slug });
  }

  /**
   * Get active changes
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Active changes
   */
  async getActiveChanges(options = {}) {
    const input = {
      limit: options.limit || 50,
      offset: options.offset || 0
    };

    return this.executeToolSSE('changes.active', input);
  }

  /**
   * Execute multiple tools concurrently
   * @param {Array} operations - Array of tool operations
   * @returns {Promise<Array>} Results array
   */
  async executeBatch(operations) {
    const promises = operations.map(op => 
      this.executeToolSSE(op.tool, op.input)
    );

    return Promise.allSettled(promises);
  }
}

// Export both classes
module.exports = { TaskMCPClient, TaskMCPClientExtensions };

// Example usage
if (require.main === module) {
  async function example() {
    const client = new TaskMCPClientExtensions(
      'http://localhost:8443',
      'your-auth-token',
      { enableLogging: true }
    );

    try {
      // Health check
      console.log('Checking server health...');
      const health = await client.healthCheck();
      console.log('Health status:', health);

      // Create a change
      console.log('\nCreating a change...');
      const change = await client.createChange(
        'Example Change',
        'example-change',
        {
          template: 'feature',
          rationale: 'Example change for demonstration'
        }
      );
      console.log('Change created:', change);

      // Get active changes
      console.log('\nGetting active changes...');
      const changes = await client.getActiveChanges();
      console.log('Active changes:', changes);

      // Archive the change
      console.log('\nArchiving change...');
      await client.archiveChange('example-change');
      console.log('Change archived');

    } catch (error) {
      console.error('Error:', error.message);
      if (error.details) {
        console.error('Details:', error.details);
      }
    } finally {
      client.close();
    }
  }

  example();
}