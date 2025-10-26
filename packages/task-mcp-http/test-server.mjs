#!/usr/bin/env node

/**
 * Simple test script for the Task MCP HTTPS/SSE Server
 */

const http = require('http');

const BASE_URL = 'http://localhost:8443';

async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      const data = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testHealthEndpoints() {
  console.log('🏥 Testing Health Endpoints\n');
  
  try {
    const healthz = await makeRequest('/healthz');
    console.log('✅ /healthz:', healthz.statusCode);
    console.log('   Response:', JSON.parse(healthz.body));
    
    const readyz = await makeRequest('/readyz');
    console.log('✅ /readyz:', readyz.statusCode);
    console.log('   Response:', JSON.parse(readyz.body));
    
    const root = await makeRequest('/');
    console.log('✅ / (root):', root.statusCode);
    console.log('   Response:', JSON.parse(root.body));
  } catch (error) {
    console.error('❌ Health endpoint test failed:', error.message);
  }
}

async function testSSEEndpoint() {
  console.log('\n🌊 Testing SSE Endpoint\n');
  
  try {
    const response = await makeRequest('/sse', 'POST', {
      tool: 'change.open',
      input: { slug: 'test-change' }
    });
    
    console.log('✅ /sse:', response.statusCode);
    console.log('   Response format:');
    console.log('   ', response.body.split('\n').slice(0, 3).join('\n   '));
  } catch (error) {
    console.error('❌ SSE endpoint test failed:', error.message);
  }
}

async function testMCPEndpoint() {
  console.log('\n📡 Testing MCP Endpoint\n');
  
  try {
    const response = await makeRequest('/mcp', 'POST', {
      tool: 'change.archive',
      input: { slug: 'test-change' }
    });
    
    console.log('✅ /mcp:', response.statusCode);
    console.log('   Response format:');
    const lines = response.body.trim().split('\n');
    lines.forEach(line => {
      console.log('   ', line);
    });
  } catch (error) {
    console.error('❌ MCP endpoint test failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Testing Task MCP HTTPS/SSE Server\n');
  console.log('Make sure the server is running on http://localhost:8443\n');
  
  await testHealthEndpoints();
  await testSSEEndpoint();
  await testMCPEndpoint();
  
  console.log('\n✨ All tests completed!');
}

main().catch(console.error);