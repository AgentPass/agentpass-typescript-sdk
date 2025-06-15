#!/usr/bin/env ts-node

/**
 * Complete MCP Server with Built-in API - HTTP Transport
 * 
 * This example demonstrates a complete MCP server setup with:
 * 1. Real Express API server with sample endpoints
 * 2. AgentPass auto-discovery of API endpoints
 * 3. MCP server generation with HTTP transport for web clients
 * 
 * Usage: npx ts-node examples/express/http-server.ts
 */

import { AgentPass } from '../../src';
import { createSampleAPI } from './api-implementation';
import { toolNaming, toolDescription } from '../shared/api-data';

async function startHttpMCPServer() {
  console.error('🚀 Starting Complete MCP Server (HTTP transport for web clients)...');

  try {
    // Create Express API server
    const app = createSampleAPI();
    const apiServer = app.listen(0, () => {
      const port = (apiServer.address() as any)?.port;
      console.error(`✅ Express API server running on http://localhost:${port}`);
    });

    // Create AgentPass instance
    const agentpass = new AgentPass({
      name: 'company-management-api',
      version: '1.0.0',
      description: 'Company Management API - User, Project, and Analytics Tools'
    });

    // Discover endpoints from Express app
    await agentpass.discover({ app, framework: 'express' });
    const endpoints = agentpass.getEndpoints();
    
    console.error(`✅ Discovered ${endpoints.length} API endpoints`);

    // Generate MCP server with HTTP transport
    const mcpServer = await agentpass.generateMCPServer({
      name: 'company-management-mcp-server-http',
      version: '1.0.0',
      description: 'MCP Server for Company Management - HTTP transport for web clients',
      transport: 'http',
      port: 0, // Use random available port
      host: 'localhost',
      cors: true,
      baseUrl: `http://localhost:${(apiServer.address() as any)?.port}`,
      toolNaming,
      toolDescription
    });

    // Start MCP server
    await mcpServer.start();
    const mcpAddress = mcpServer.getAddress();
    
    console.error('✅ MCP Server started successfully!');
    console.error(`📋 Server Info:`);
    console.error(`   Name: ${mcpServer.info.name}`);
    console.error(`   Transport: ${mcpServer.transport.type}`);
    console.error(`   MCP Server: ${mcpAddress}`);
    console.error(`   Tools Available: ${endpoints.length}`);
    console.error('');
    console.error('🔧 Available Tools for Claude:');
    endpoints.forEach((endpoint, index) => {
      const toolName = toolNaming(endpoint);
      console.error(`   ${index + 1}. ${toolName} - ${endpoint.method} ${endpoint.path}`);
    });
    console.error('');
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

    // Graceful shutdown
    const cleanup = async () => {
      console.error('\n🛑 Shutting down servers...');
      try {
        await mcpServer.stop();
        apiServer.close();
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

// Start the server
startHttpMCPServer();