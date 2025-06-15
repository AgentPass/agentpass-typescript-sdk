#!/usr/bin/env node

/**
 * Test SSE MCP Server - Fixed Port for mcp-remote testing
 * 
 * Usage: node test-sse-server.mjs
 * Then configure Claude Desktop with:
 * {
 *   "mcpServers": {
 *     "test-sse": {
 *       "command": "npx",
 *       "args": ["mcp-remote", "http://localhost:3001"]
 *     }
 *   }
 * }
 */

import { AgentPass } from './dist/core/AgentPass.js';
import express from 'express';

async function startTestSSEServer() {
  console.error('🚀 Starting Test SSE MCP Server (Fixed Port 3001)...');

  try {
    // Create Express app with test endpoints
    const app = express();
    app.use(express.json());

    // Simple test endpoints
    app.get('/api/test', (req, res) => {
      res.json({ message: 'Hello from test API!', timestamp: new Date().toISOString() });
    });

    app.get('/api/users', (req, res) => {
      res.json({
        users: [
          { id: 1, name: 'Alice', email: 'alice@test.com' },
          { id: 2, name: 'Bob', email: 'bob@test.com' }
        ]
      });
    });

    app.get('/api/users/:id', (req, res) => {
      const user = { id: parseInt(req.params.id), name: 'Test User', email: 'test@test.com' };
      res.json({ user });
    });

    // Start API server on fixed port
    const apiPort = 3002;
    const apiServer = app.listen(apiPort, () => {
      console.error(`✅ Test API server running on http://localhost:${apiPort}`);
    });

    // Create AgentPass instance
    const agentpass = new AgentPass({
      name: 'test-sse-api',
      version: '1.0.0',
      description: 'Test SSE API for mcp-remote'
    });

    // Discover endpoints
    await agentpass.discover({ app, framework: 'express' });
    const endpoints = agentpass.getEndpoints();
    
    console.error(`✅ Discovered ${endpoints.length} API endpoints`);

    // Generate SSE MCP server on fixed port
    const mcpServer = await agentpass.generateMCPServer({
      name: 'test-sse-mcp-server',
      version: '1.0.0',
      description: 'Test SSE MCP Server for mcp-remote',
      transport: 'sse',
      port: 3001, // Fixed port for easy testing
      host: 'localhost',
      cors: true,
      baseUrl: `http://localhost:${apiPort}`,
      toolNaming: (endpoint) => {
        const method = endpoint.method.toLowerCase();
        let pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
        pathParts = pathParts.filter(p => p !== 'api');
        const resource = pathParts[pathParts.length - 1] || 'endpoint';
        
        if (endpoint.path.includes('{')) {
          return `${method}_${resource}_by_id`;
        }
        return `${method}_${resource}`;
      }
    });

    // Start MCP server
    await mcpServer.start();
    
    console.error('');
    console.error('✅ SSE MCP Server started successfully!');
    console.error('📋 Server Info:');
    console.error(`   Name: ${mcpServer.info.name}`);
    console.error(`   Transport: ${mcpServer.transport.type}`);
    console.error(`   MCP Server: http://localhost:3001`);
    console.error(`   API Server: http://localhost:3002`);
    console.error('');
    console.error('🔧 Available Tools:');
    endpoints.forEach((endpoint, index) => {
      const method = endpoint.method.toLowerCase();
      let pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
      pathParts = pathParts.filter(p => p !== 'api');
      const resource = pathParts[pathParts.length - 1] || 'endpoint';
      
      let toolName;
      if (endpoint.path.includes('{')) {
        toolName = `${method}_${resource}_by_id`;
      } else {
        toolName = `${method}_${resource}`;
      }
      
      console.error(`   ${index + 1}. ${toolName} - ${endpoint.method} ${endpoint.path}`);
    });
    console.error('');
    console.error('🌐 SSE Endpoints:');
    console.error('   GET  http://localhost:3001/sse         # SSE stream');
    console.error('   POST http://localhost:3001/sse/messages # Messages');
    console.error('');
    console.error('🎯 Claude Desktop Configuration:');
    console.error('   Add to claude_desktop_config.json:');
    console.error('   {');
    console.error('     "mcpServers": {');
    console.error('       "test-sse": {');
    console.error('         "command": "npx",');
    console.error('         "args": ["mcp-remote", "http://localhost:3001"]');
    console.error('       }');
    console.error('     }');
    console.error('   }');
    console.error('');
    console.error('🔍 Debug: All HTTP requests will be logged below...');
    console.error('');

    // Graceful shutdown
    const cleanup = async () => {
      console.error('\n🛑 Shutting down...');
      try {
        await mcpServer.stop();
        apiServer.close();
        console.error('✅ Servers stopped gracefully');
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
      }
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGQUIT', cleanup);
    
    // Keep running
    process.stdin.resume();

  } catch (error) {
    console.error('❌ Failed to start test SSE server:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

startTestSSEServer();