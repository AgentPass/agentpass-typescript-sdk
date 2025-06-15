#!/usr/bin/env ts-node

/**
 * Complete MCP Server with OpenAPI Discovery
 * 
 * This example demonstrates a complete MCP server setup with:
 * 1. OpenAPI specification parsing and endpoint discovery
 * 2. AgentPass auto-discovery from OpenAPI spec
 * 3. MCP server generation with configurable transport
 * 
 * Usage: 
 *   npx ts-node examples/openapi/server.ts [transport]
 *   - transport: stdio (default), http, sse
 * 
 * Examples:
 *   npx ts-node examples/openapi/server.ts
 *   npx ts-node examples/openapi/server.ts stdio
 *   npx ts-node examples/openapi/server.ts http
 *   npx ts-node examples/openapi/server.ts sse
 */

import { AgentPass } from '../../src';

type TransportType = 'stdio' | 'http' | 'sse';

// Tool naming function similar to Express/Fastify examples
const toolNaming = (endpoint: any) => {
  // Use OpenAPI operation ID if available, otherwise generate
  if (endpoint.metadata?.operationId && typeof endpoint.metadata.operationId === 'string') {
    return endpoint.metadata.operationId;
  }
  
  const method = endpoint.method.toLowerCase();
  const pathParts = endpoint.path.split('/').filter((part: string) => part && !part.startsWith('{'));
  const resource = pathParts[pathParts.length - 1] || 'resource';
  
  return `${method}_${resource}`;
};

// Tool description function similar to Express/Fastify examples
const toolDescription = (endpoint: any) => {
  let description = endpoint.summary || endpoint.description || `${endpoint.method} ${endpoint.path}`;
  
  // Add parameter information
  const pathParams = endpoint.parameters?.filter((p: any) => p.in === 'path') || [];
  const queryParams = endpoint.parameters?.filter((p: any) => p.in === 'query') || [];
  
  if (pathParams.length > 0) {
    description += `\n\nPath parameters: ${pathParams.map((p: any) => `${p.name} (${p.type})`).join(', ')}`;
  }
  
  if (queryParams.length > 0) {
    description += `\n\nQuery parameters: ${queryParams.map((p: any) => `${p.name} (${p.type}${p.required ? ', required' : ''})`).join(', ')}`;
  }
  
  return description;
};

async function startMCPServer(transport: TransportType = 'sse') {
  console.error(`🚀 Starting Complete MCP Server (${transport} transport - OpenAPI)...`);

  try {
    // Create AgentPass instance with auto-discovery from OpenAPI spec URL
    const agentpass = await AgentPass.create({
      name: 'petstore-api',
      version: '1.0.0',
      description: 'Petstore API from OpenAPI specification',
      framework: 'openapi',
      openapi: 'https://petstore3.swagger.io/api/v3/openapi.json',
      baseUrl: 'https://petstore3.swagger.io/api/v3'
    });
    const endpoints = agentpass.getEndpoints();

    console.error(`✅ Discovered ${endpoints.length} API endpoints`);

    // Add authentication for protected endpoints
    agentpass.use('auth', async (context) => {
      // Simple API key auth for demo
      const apiKey = context.request.headers['api_key'];
      if (!apiKey && context.endpoint.security?.length) {
        throw new Error('API key required for this endpoint');
      }
      return apiKey ? { apiKey } : null;
    });

    // Add request logging
    agentpass.use('pre', async (context) => {
      console.error(`🌐 Making request: ${context.request.method} ${context.request.path}`);
      if (context.request.params && Object.keys(context.request.params).length > 0) {
        console.error(`  📋 Params:`, context.request.params);
      }
      if (context.request.query && Object.keys(context.request.query).length > 0) {
        console.error(`  🔍 Query:`, context.request.query);
      }
    });

    // Transform responses to add metadata
    agentpass.use('post', async (context, response) => {
      return {
        ...response,
        data: {
          ...response.data,
          _petstore_metadata: {
            endpoint: context.endpoint.path,
            method: context.endpoint.method,
            timestamp: new Date().toISOString(),
            openapi_operation: context.endpoint.metadata?.operationId,
          },
        },
      };
    });

    // Generate MCP server configuration based on transport
    const baseConfig = {
      name: `petstore-mcp-server-${transport}`,
      version: '1.0.0',
      description: `MCP Server for Petstore API - ${transport} transport`,
      transport,
      baseUrl: 'https://petstore3.swagger.io/api/v3',
      toolNaming,
      toolDescription,
      metadata: {
        source: 'OpenAPI Specification',
        documentation: 'https://petstore3.swagger.io',
      },
    };

    const mcpConfig = transport === 'stdio' 
      ? baseConfig 
      : { ...baseConfig, port: 0, host: 'localhost', cors: true };

    // Generate MCP server
    const mcpServer = await agentpass.generateMCPServer(mcpConfig);

    // Start MCP server
    await mcpServer.start();
    
    console.error('✅ MCP Server started successfully!');
    console.error(`📋 Server Info:`);
    console.error(`   Name: ${mcpServer.info.name}`);
    console.error(`   Transport: ${mcpServer.transport.type}`);
    
    if (transport !== 'stdio') {
      const mcpAddress = mcpServer.getAddress();
      console.error(`   MCP Server: ${mcpAddress}`);
    }
    
    console.error(`   Tools Available: ${endpoints.length}`);
    console.error('');
    console.error('🔧 Available Tools for Claude:');
    endpoints.forEach((endpoint, index) => {
      const toolName = toolNaming(endpoint);
      console.error(`   ${index + 1}. ${toolName} - ${endpoint.method} ${endpoint.path}`);
    });
    console.error('');

    // Display transport-specific configuration
    if (transport === 'stdio') {
      console.error('🎯 Claude Desktop Configuration (stdio):');
      console.error('   {');
      console.error('     "mcpServers": {');
      console.error('       "petstore-api": {');
      console.error('         "command": "npx",');
      console.error('         "args": [');
      console.error('           "ts-node",');
      console.error(`           "${process.cwd()}/examples/openapi/server.ts",`);
      console.error('           "stdio"');
      console.error('         ]');
      console.error('       }');
      console.error('     }');
      console.error('   }');
    } else if (transport === 'http') {
      const mcpAddress = mcpServer.getAddress();
      console.error('🌐 HTTP MCP Server Ready!');
      console.error(`📡 MCP Endpoint: ${mcpAddress}/mcp`);
      console.error('');
      console.error('🔧 Test with MCP SDK client:');
      console.error('   import { Client } from "@modelcontextprotocol/sdk/client/index.js";');
      console.error('   import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";');
      console.error('   ');
      console.error(`   const transport = new StreamableHTTPClientTransport(new URL("${mcpAddress}/mcp"));`);
      console.error('   const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: { tools: {} } });');
      console.error('   await client.connect(transport);');
      console.error('   const tools = await client.listTools();');
    } else if (transport === 'sse') {
      const mcpAddress = mcpServer.getAddress();
      console.error('🌐 SSE MCP Server Ready!');
      console.error(`📡 SSE Endpoint: ${mcpAddress}/sse`);
      console.error(`📡 Messages Endpoint: ${mcpAddress}/sse/messages`);
      console.error('');
      console.error('🎯 Claude Desktop Configuration (mcp-remote):');
      console.error('   {');
      console.error('     "mcpServers": {');
      console.error('       "petstore-api": {');
      console.error('         "command": "npx",');
      console.error('         "args": [');
      console.error('           "mcp-remote",');
      console.error(`           "${mcpAddress}/sse"`);
      console.error('         ]');
      console.error('       }');
      console.error('     }');
      console.error('   }');
    }

    console.error('');

    // Graceful shutdown
    const cleanup = async () => {
      console.error('\n🛑 Shutting down servers...');
      try {
        await mcpServer.stop();
        console.error('✅ Servers stopped gracefully');
      } catch (error) {
        console.error('❌ Error during shutdown:', (error as Error).message);
      }
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGQUIT', cleanup);
    
    // Keep the process running
    process.stdin.resume();

  } catch (error) {
    console.error('❌ Failed to start MCP server:', (error as Error).message);
    process.exit(1);
  }
}

// Parse command line arguments
const transport = (process.argv[2] as TransportType) || 'sse';
const validTransports: TransportType[] = ['stdio', 'http', 'sse'];

if (!validTransports.includes(transport)) {
  console.error(`❌ Invalid transport: ${transport}`);
  console.error(`Valid transports: ${validTransports.join(', ')}`);
  process.exit(1);
}

// Start the server
startMCPServer(transport);