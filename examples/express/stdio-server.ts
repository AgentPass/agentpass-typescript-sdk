#!/usr/bin/env ts-node

/**
 * Complete MCP Server with Built-in API - stdio Transport
 * 
 * This example demonstrates a complete MCP server setup with:
 * 1. Real Express API server with sample endpoints
 * 2. AgentPass auto-discovery of API endpoints
 * 3. MCP server generation with stdio transport for Claude Desktop
 * 
 * Usage: npx ts-node examples/express/stdio-server.ts
 */

import { AgentPass } from '../../src';
import { createSampleAPI } from './api-implementation';
import { toolNaming, toolDescription } from '../shared/api-data';

async function startStdioMCPServer() {
  console.error('🚀 Starting Complete MCP Server (stdio transport for Claude Desktop)...');

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

    // Generate MCP server with stdio transport
    const mcpServer = await agentpass.generateMCPServer({
      name: 'company-management-mcp-server',
      version: '1.0.0',
      description: 'MCP Server for Company Management - stdio transport for Claude Desktop',
      transport: 'stdio',
      baseUrl: `http://localhost:${(apiServer.address() as any)?.port}`,
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
    console.error('       "company-api": {');
    console.error('         "command": "npx",');
    console.error('         "args": [');
    console.error('           "ts-node",');
    console.error(`           "${process.cwd()}/examples/express/stdio-server.ts"`);
    console.error('         ]');
    console.error('       }');
    console.error('     }');
    console.error('   }');

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
startStdioMCPServer();