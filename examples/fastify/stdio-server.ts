#!/usr/bin/env ts-node

/**
 * Complete MCP Server with Built-in API - stdio Transport (Fastify)
 * 
 * This example demonstrates a complete MCP server setup with:
 * 1. Real Fastify API server with sample endpoints
 * 2. AgentPass auto-discovery of API endpoints
 * 3. MCP server generation with stdio transport for Claude Desktop
 * 
 * Usage: npx ts-node examples/fastify/stdio-server.ts
 */

import { AgentPass } from '../../src';
import { createSampleAPI } from './api-implementation';
import { toolNaming, toolDescription } from '../shared/api-data';

async function startStdioMCPServer() {
  console.error('🚀 Starting Complete MCP Server (stdio transport for Claude Desktop - Fastify)...');

  try {
    // Create Fastify API server
    const app = await createSampleAPI();

    // Create AgentPass instance and discover endpoints BEFORE starting server
    const agentpass = new AgentPass({
      name: 'company-management-api-fastify',
      version: '1.0.0',
      description: 'Company Management API - User, Project, and Analytics Tools (Fastify)'
    });

    // Discover endpoints from Fastify app
    await agentpass.discover({ app, framework: 'fastify' });
    const endpoints = agentpass.getEndpoints();

    // Now start the Fastify server
    await app.listen({ port: 0, host: 'localhost' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    console.error(`✅ Fastify API server running on http://localhost:${port}`);
    
    console.error(`✅ Discovered ${endpoints.length} API endpoints`);

    // Generate MCP server with stdio transport
    const mcpServer = await agentpass.generateMCPServer({
      name: 'company-management-mcp-server-fastify',
      version: '1.0.0',
      description: 'MCP Server for Company Management - stdio transport for Claude Desktop (Fastify)',
      transport: 'stdio',
      baseUrl: `http://localhost:${port}`,
      toolNaming,
      toolDescription
    });

    // Start MCP server
    await mcpServer.start();
    
    console.error('✅ MCP Server started successfully!');
    console.error(`📋 Server Info:`);
    console.error(`   Name: ${mcpServer.info.name}`);
    console.error(`   Transport: ${mcpServer.transport.type}`);
    console.error(`   Tools Available: ${endpoints.length}`);
    console.error('');
    console.error('🔧 Available Tools for Claude:');
    endpoints.forEach((endpoint, index) => {
      const toolName = toolNaming(endpoint);
      console.error(`   ${index + 1}. ${toolName} - ${endpoint.method} ${endpoint.path}`);
    });
    console.error('');
    console.error('🎯 Claude Desktop Configuration (stdio):');
    console.error('   {');
    console.error('     "mcpServers": {');
    console.error('       "company-api-fastify": {');
    console.error('         "command": "npx",');
    console.error('         "args": [');
    console.error('           "ts-node",');
    console.error(`           "${process.cwd()}/examples/fastify/stdio-server.ts"`);
    console.error('         ]');
    console.error('       }');
    console.error('     }');
    console.error('   }');

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

// Start the server
startStdioMCPServer();