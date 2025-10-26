/**
 * Health check route handlers
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { HealthCheckResponse, ReadyCheckResponse } from '../types.js';

let serverStartTime = Date.now();

/**
 * Liveness probe - always returns healthy if server is running
 */
export async function healthzHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<HealthCheckResponse> {
  const response: HealthCheckResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - serverStartTime,
    version: '1.0.0',
  };

  return response;
}

/**
 * Readiness probe - checks if server is ready to handle requests
 */
export async function readyzHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ReadyCheckResponse> {
  const uptime = Date.now() - serverStartTime;
  const checks = await performReadinessChecks();
  
  const response: ReadyCheckResponse = {
    status: checks.allPassed ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime,
    version: '1.0.0',
    ready: checks.allPassed,
    dependencies: {
      tools: checks.tools,
      filesystem: checks.filesystem,
      security: checks.security,
    },
  };

  // Set appropriate HTTP status code
  if (!checks.allPassed) {
    reply.code(503);
  }

  return response;
}

/**
 * Perform readiness checks
 */
async function performReadinessChecks(): Promise<{
  allPassed: boolean;
  tools: boolean;
  filesystem: boolean;
  security: boolean;
}> {
  const checks = {
    tools: await checkTools(),
    filesystem: await checkFilesystem(),
    security: await checkSecurity(),
  };

  return {
    allPassed: Object.values(checks).every(Boolean),
    ...checks,
  };
}

/**
 * Check if tool registry is available
 */
async function checkTools(): Promise<boolean> {
  try {
    // Placeholder: In real implementation, check if tool registry is initialized
    // For now, just check if we can import the factory
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if filesystem is accessible
 */
async function checkFilesystem(): Promise<boolean> {
  try {
    const fs = await import('fs/promises');
    await fs.access(process.cwd());
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if security context is properly configured
 */
async function checkSecurity(): Promise<boolean> {
  try {
    // Placeholder: In real implementation, check security configuration
    // For now, just ensure we have basic security setup
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset server start time (useful for testing)
 */
export function resetServerStartTime(): void {
  serverStartTime = Date.now();
}