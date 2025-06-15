#!/usr/bin/env ts-node

/**
 * Complete MCP Server with Built-in API - Fastify
 * 
 * This example demonstrates a complete MCP server setup with:
 * 1. Real Fastify API server with sample endpoints
 * 2. AgentPass auto-discovery of API endpoints
 * 3. MCP server generation with configurable transport
 * 
 * Usage: 
 *   npx ts-node examples/fastify/server.ts [transport]
 *   - transport: stdio (default), http, sse
 * 
 * Examples:
 *   npx ts-node examples/fastify/server.ts
 *   npx ts-node examples/fastify/server.ts stdio
 *   npx ts-node examples/fastify/server.ts http
 *   npx ts-node examples/fastify/server.ts sse
 */

import { AgentPass } from '../../src';
import { createSampleAPI } from './api-implementation';
import { toolNaming, toolDescription } from '../shared/api-data';

type TransportType = 'stdio' | 'http' | 'sse';

async function startMCPServer(transport: TransportType = 'sse') {
  console.error(`🚀 Starting Complete MCP Server (${transport} transport - Fastify)...`);

  try {
    // Create Fastify API server
    const app = await createSampleAPI();

    // Create AgentPass instance with auto-discovery BEFORE starting server
    const agentpass = await AgentPass.create({
      name: 'company-management-api-fastify',
      version: '1.0.0',
      description: 'Company Management API - User, Project, and Analytics Tools (Fastify)',
      app,
      framework: 'fastify'
    });
    const endpoints = agentpass.getEndpoints();

    // Now start the Fastify server
    await app.listen({ port: 0, host: 'localhost' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    console.error(`✅ Fastify API server running on http://localhost:${port}`);
    
    console.error(`✅ Discovered ${endpoints.length} API endpoints`);

    // Generate MCP server configuration based on transport
    const baseConfig = {
      name: `company-management-mcp-server-${transport}-fastify`,
      version: '1.0.0',
      description: `MCP Server for Company Management - ${transport} transport (Fastify)`,
      transport,
      baseUrl: `http://localhost:${port}`,
      toolNaming,
      toolDescription
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
      console.error('       "company-api-fastify": {');
      console.error('         "command": "npx",');
      console.error('         "args": [');
      console.error('           "ts-node",');
      console.error(`           "${process.cwd()}/examples/fastify/server.ts",`);
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
      console.error('       "company-api-fastify": {');
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
    console.error('🔍 Debug: All HTTP requests will be logged below...');

    // Graceful shutdown
    const cleanup = async () => {
      console.error('\n🛑 Shutting down servers...');
      try {
        await mcpServer.stop();
        await app.close();
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