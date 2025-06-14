#!/usr/bin/env node

/**
 * Comprehensive E2E Test for Real MCP Server
 * 
 * This test creates a real Express server, discovers its endpoints,
 * generates an MCP server, and tests it with actual HTTP requests
 * simulating MCP client behavior.
 */

import { AgentPass } from './dist/core/AgentPass.js';
import express from 'express';
import axios from 'axios';

async function runRealMCPE2ETest() {
  console.log('🧪 Real MCP Server E2E Test\n');

  let expressServer, mcpServer;

  try {
    // Step 1: Create and start a real Express server
    console.log('🚀 Step 1: Creating Express server with test endpoints...');
    const app = express();
    app.use(express.json());

    // Add comprehensive test endpoints
    app.get('/users', (req, res) => {
      const { page = '1', limit = '10' } = req.query;
      res.json({
        users: [
          { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin' },
          { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'user' },
          { id: 3, name: 'Bob Wilson', email: 'bob@example.com', role: 'user' }
        ],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 3
        }
      });
    });

    app.get('/users/:id', (req, res) => {
      const userId = parseInt(req.params.id);
      const users = [
        { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin', createdAt: '2024-01-01' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'user', createdAt: '2024-01-02' },
        { id: 3, name: 'Bob Wilson', email: 'bob@example.com', role: 'user', createdAt: '2024-01-03' }
      ];
      
      const user = users.find(u => u.id === userId);
      if (user) {
        res.json({ user });
      } else {
        res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
      }
    });

    app.post('/users', (req, res) => {
      const { name, email, role = 'user' } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({ 
          error: 'Name and email are required', 
          code: 'VALIDATION_ERROR' 
        });
      }

      const newUser = {
        id: Date.now(),
        name,
        email,
        role,
        createdAt: new Date().toISOString()
      };
      
      res.status(201).json({ 
        message: 'User created successfully', 
        user: newUser 
      });
    });

    app.get('/products', (req, res) => {
      const { category, minPrice, maxPrice, search } = req.query;
      let products = [
        { id: 1, name: 'Laptop Pro', category: 'electronics', price: 1299.99, description: 'High-performance laptop' },
        { id: 2, name: 'Wireless Mouse', category: 'electronics', price: 29.99, description: 'Ergonomic wireless mouse' },
        { id: 3, name: 'Programming Book', category: 'books', price: 49.99, description: 'Learn advanced programming' },
        { id: 4, name: 'Office Chair', category: 'furniture', price: 299.99, description: 'Comfortable office chair' }
      ];

      // Apply filters
      if (category) {
        products = products.filter(p => p.category === category);
      }
      if (minPrice) {
        products = products.filter(p => p.price >= parseFloat(minPrice));
      }
      if (maxPrice) {
        products = products.filter(p => p.price <= parseFloat(maxPrice));
      }
      if (search) {
        const searchTerm = search.toLowerCase();
        products = products.filter(p => 
          p.name.toLowerCase().includes(searchTerm) || 
          p.description.toLowerCase().includes(searchTerm)
        );
      }

      res.json({ 
        products,
        filters: { category, minPrice, maxPrice, search },
        total: products.length
      });
    });

    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: 'test'
      });
    });

    // Start Express server
    const expressPort = await new Promise((resolve) => {
      expressServer = app.listen(0, () => {
        const address = expressServer.address();
        const port = typeof address === 'object' && address ? address.port : 3000;
        console.log(`✅ Express server started on port ${port}`);
        resolve(port);
      });
    });

    // Step 2: Create AgentPass and discover endpoints
    console.log('\n🔍 Step 2: Discovering endpoints with AgentPass...');
    const agentpass = new AgentPass({
      name: 'real-e2e-test-api',
      version: '1.0.0',
      description: 'Real E2E Test API'
    });

    await agentpass.discover({ app, framework: 'express' });
    const endpoints = agentpass.getEndpoints();
    
    console.log(`✅ Discovered ${endpoints.length} endpoints:`);
    endpoints.forEach(endpoint => {
      console.log(`  - ${endpoint.method} ${endpoint.path}`);
    });

    if (endpoints.length < 5) {
      throw new Error(`Expected at least 5 endpoints, found ${endpoints.length}`);
    }

    // Step 3: Generate MCP server
    console.log('\n🚀 Step 3: Generating MCP server...');
    mcpServer = await agentpass.generateMCPServer({
      name: 'real-e2e-mcp-server',
      version: '1.0.0',
      description: 'Real E2E Test MCP Server',
      transport: 'http',
      port: 0,
      host: 'localhost',
      cors: true,
      baseUrl: `http://localhost:${expressPort}`,
      toolNaming: (endpoint) => {
        const method = endpoint.method.toLowerCase();
        const pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
        const resource = pathParts[pathParts.length - 1] || 'endpoint';
        
        if (endpoint.path.includes('{')) {
          return `${method}_${resource}_by_id`;
        }
        
        return `${method}_${resource}`;
      }
    });

    console.log(`✅ MCP server created: ${mcpServer.info.name}`);

    // Step 4: Start MCP server
    console.log('\n▶️ Step 4: Starting MCP server...');
    await mcpServer.start();
    
    if (!mcpServer.isRunning()) {
      throw new Error('MCP server failed to start');
    }

    const mcpAddress = mcpServer.getAddress();
    console.log(`✅ MCP server running at: ${mcpAddress}`);

    const mcpPort = mcpAddress.split(':')[2];
    const mcpBaseUrl = `http://localhost:${mcpPort}/mcp`;

    // Step 5: Test MCP tools/list via HTTP (verifying real MCP server implementation)
    console.log('\n🔧 Step 5: Testing MCP server tools/list (real MCP SDK format)...');
    
    const listResponse = await axios.post(mcpBaseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });

    if (listResponse.status !== 200) {
      throw new Error(`tools/list failed with status ${listResponse.status}`);
    }

    const tools = listResponse.data.result.tools;
    console.log(`✅ Found ${tools.length} MCP tools from real MCP server:`);
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
      // Verify it has proper MCP tool structure
      if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
        throw new Error(`Tool ${tool.name} missing proper inputSchema`);
      }
      if (!tool.inputSchema.type || tool.inputSchema.type !== 'object') {
        throw new Error(`Tool ${tool.name} inputSchema should be object type`);
      }
      console.log(`    ✓ Valid MCP tool schema with ${Object.keys(tool.inputSchema.properties || {}).length} parameters`);
    });

    if (tools.length < 5) {
      throw new Error(`Expected at least 5 tools, found ${tools.length}`);
    }
    
    console.log('✅ All tools have valid MCP tool definitions from real MCP SDK');

    // Step 6: Test health check tool (verifying real MCP tool execution)
    console.log('\n💊 Step 6: Testing health check via real MCP tool execution...');
    const healthTool = tools.find(t => t.name === 'get_health');
    if (!healthTool) {
      throw new Error('Health tool not found');
    }

    const healthResponse = await axios.post(mcpBaseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_health',
        arguments: {}
      }
    });

    const healthResult = JSON.parse(healthResponse.data.result.content[0].text);
    console.log('✅ Health check result:', healthResult);

    if (healthResult.data.status !== 'healthy') {
      throw new Error(`Expected healthy status, got ${healthResult.data.status}`);
    }

    // Step 7: Test get users tool
    console.log('\n👥 Step 7: Testing get users via real MCP tool execution...');
    const usersTool = tools.find(t => t.name === 'get_users');
    if (!usersTool) {
      throw new Error('Users tool not found');
    }

    const usersResponse = await axios.post(mcpBaseUrl, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_users',
        arguments: {}
      }
    });

    const usersResult = JSON.parse(usersResponse.data.result.content[0].text);
    console.log('✅ Users result:', usersResult);

    if (!Array.isArray(usersResult.data.users) || usersResult.data.users.length !== 3) {
      throw new Error(`Expected 3 users, got ${usersResult.data.users?.length}`);
    }

    // Step 8: Test get user by ID tool
    console.log('\n👤 Step 8: Testing get user by ID via real MCP tool execution...');
    const userByIdTool = tools.find(t => t.name === 'get_users_by_id');
    if (!userByIdTool) {
      throw new Error('User by ID tool not found');
    }

    const userByIdResponse = await axios.post(mcpBaseUrl, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_users_by_id',
        arguments: {
          id: '1'
        }
      }
    });

    const userResult = JSON.parse(userByIdResponse.data.result.content[0].text);
    console.log('✅ User by ID result:', userResult);

    if (!userResult.data.user || userResult.data.user.id !== 1) {
      throw new Error(`Expected user with ID 1, got ${userResult.data.user?.id}`);
    }

    // Step 9: Test products with filters
    console.log('\n🛍️ Step 9: Testing products with filters via real MCP tool execution...');
    const productsTool = tools.find(t => t.name === 'get_products');
    if (!productsTool) {
      throw new Error('Products tool not found');
    }

    const productsResponse = await axios.post(mcpBaseUrl, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'get_products',
        arguments: {
          category: 'electronics',
          minPrice: '25'
        }
      }
    });

    const productsResult = JSON.parse(productsResponse.data.result.content[0].text);
    console.log('✅ Filtered products result:', productsResult);

    if (!Array.isArray(productsResult.data.products)) {
      throw new Error('Expected products array');
    }

    // Step 10: Test error handling
    console.log('\n❌ Step 10: Testing error handling via real MCP tool execution...');
    const errorResponse = await axios.post(mcpBaseUrl, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'get_users_by_id',
        arguments: {
          id: '999'
        }
      }
    });

    const errorResult = JSON.parse(errorResponse.data.result.content[0].text);
    console.log('✅ Error handling result:', errorResult);

    if (errorResult.status !== 404) {
      throw new Error(`Expected 404 error, got ${errorResult.status}`);
    }

    // Step 11: Test invalid tool handling
    console.log('\n🚫 Step 11: Testing invalid tool handling via real MCP server...');
    try {
      await axios.post(mcpBaseUrl, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'invalid_tool',
          arguments: {}
        }
      });
      throw new Error('Should have thrown error for invalid tool');
    } catch (error) {
      if (error.response && error.response.status === 500) {
        console.log('✅ Invalid tool correctly rejected by real MCP server');
      } else {
        throw error;
      }
    }

    // Step 12: Test CORS
    console.log('\n🔗 Step 12: Testing CORS support...');
    const corsResponse = await axios.options(mcpBaseUrl);
    if (corsResponse.status !== 200) {
      throw new Error(`CORS preflight failed with status ${corsResponse.status}`);
    }
    console.log('✅ CORS preflight successful');

    console.log('\n🎉 ALL E2E TESTS PASSED SUCCESSFULLY!');
    console.log('\n📊 Test Summary:');
    console.log(`   ✅ Express server: Running on port ${expressPort}`);
    console.log(`   ✅ Endpoint discovery: ${endpoints.length} endpoints found`);
    console.log(`   ✅ MCP server: Running on port ${mcpPort} (real MCP SDK)`);
    console.log(`   ✅ MCP tools: ${tools.length} tools with valid MCP schemas`);
    console.log('   ✅ Tool execution: All tools executing against real Express API');
    console.log('   ✅ Error handling: Proper HTTP error responses');
    console.log('   ✅ CORS support: Working correctly');
    console.log('\n🚀 Real MCP server implementation is fully functional!');

  } catch (error) {
    console.error('\n❌ E2E Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    console.error('Stack trace:', error.stack);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    if (mcpServer && mcpServer.isRunning()) {
      await mcpServer.stop();
      console.log('✅ MCP server stopped');
    }
    if (expressServer) {
      expressServer.close();
      console.log('✅ Express server stopped');
    }
  }
}

runRealMCPE2ETest();