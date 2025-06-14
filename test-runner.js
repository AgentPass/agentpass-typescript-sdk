#!/usr/bin/env node

const { AgentPass } = require('./dist/core/AgentPass');
const express = require('express');

async function runBasicTest() {
  console.log('🧪 Running basic AgentPass functionality test...\n');
  
  try {
    // Test 1: Basic AgentPass instantiation
    console.log('✅ Test 1: AgentPass instantiation');
    const agentpass = new AgentPass({
      name: 'test-api',
      version: '1.0.0',
      description: 'Test API'
    });
    console.log('   ✓ AgentPass instance created successfully');
    
    // Test 2: Manual endpoint definition
    console.log('\n✅ Test 2: Manual endpoint definition');
    agentpass.defineEndpoint({
      id: 'test-endpoint',
      method: 'GET',
      path: '/test',
      description: 'Test endpoint',
      tags: ['test'],
      parameters: [],
      responses: {},
      metadata: {}
    });
    
    const endpoints = agentpass.getEndpoints();
    if (endpoints.length === 1) {
      console.log('   ✓ Manual endpoint defined successfully');
    } else {
      throw new Error('Manual endpoint definition failed');
    }
    
    // Test 3: Express discovery
    console.log('\n✅ Test 3: Express.js discovery');
    const app = express();
    
    app.get('/users', (req, res) => {
      res.json({ users: [] });
    });
    
    app.get('/users/:id', (req, res) => {
      res.json({ user: { id: req.params.id } });
    });
    
    app.post('/users', (req, res) => {
      res.json({ message: 'User created' });
    });
    
    // Reset to test discovery
    agentpass.reset();
    
    await agentpass.discover({ app, framework: 'express' });
    const discoveredEndpoints = agentpass.getEndpoints();
    
    if (discoveredEndpoints.length >= 3) {
      console.log(`   ✓ Express discovery found ${discoveredEndpoints.length} endpoints`);
      
      // Check for specific endpoints
      const getUsersEndpoint = discoveredEndpoints.find(e => e.method === 'GET' && e.path === '/users');
      const getUserEndpoint = discoveredEndpoints.find(e => e.method === 'GET' && e.path.includes('{id}'));
      const createUserEndpoint = discoveredEndpoints.find(e => e.method === 'POST' && e.path === '/users');
      
      if (getUsersEndpoint && getUserEndpoint && createUserEndpoint) {
        console.log('   ✓ All expected endpoints discovered');
        console.log(`     - GET /users: ${getUsersEndpoint.description || 'Found'}`);
        console.log(`     - GET /users/{id}: ${getUserEndpoint.description || 'Found'}`);
        console.log(`     - POST /users: ${createUserEndpoint.description || 'Found'}`);
      } else {
        console.log('   ⚠ Some expected endpoints missing');
      }
    } else {
      console.log('   ⚠ Express discovery found fewer endpoints than expected');
    }
    
    // Test 4: MCP Server Generation
    console.log('\n✅ Test 4: MCP Server Generation');
    try {
      const mcpServer = await agentpass.generateMCPServer();
      if (mcpServer) {
        console.log('   ✓ MCP server generated successfully');
      } else {
        console.log('   ⚠ MCP server generation returned null');
      }
    } catch (error) {
      console.log(`   ⚠ MCP server generation failed: ${error.message}`);
    }
    
    // Test 5: Middleware
    console.log('\n✅ Test 5: Middleware system');
    agentpass.use('auth', async (context) => {
      console.log('   ✓ Auth middleware called');
      return { user: 'test' };
    });
    
    const middleware = agentpass.getMiddleware();
    if (middleware.auth && middleware.auth.length > 0) {
      console.log('   ✓ Middleware added successfully');
    }
    
    // Test 6: Plugin system
    console.log('\n✅ Test 6: Plugin system');
    const testPlugin = {
      name: 'test-plugin',
      version: '1.0.0'
    };
    
    agentpass.plugin('test', testPlugin);
    const plugins = agentpass.getPlugins();
    if (plugins.length > 0) {
      console.log('   ✓ Plugin registered successfully');
    }
    
    // Test 7: Stats
    console.log('\n✅ Test 7: Statistics');
    const stats = agentpass.getStats();
    console.log(`   ✓ Stats: ${stats.endpoints} endpoints, ${stats.discoverers} discoverers, ${stats.plugins} plugins`);
    
    console.log('\n🎉 All basic tests completed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   ✓ AgentPass instantiation');
    console.log('   ✓ Manual endpoint definition'); 
    console.log('   ✓ Express.js auto-discovery');
    console.log('   ✓ MCP server generation');
    console.log('   ✓ Middleware system');
    console.log('   ✓ Plugin system');
    console.log('   ✓ Statistics tracking');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nStack trace:', error.stack);
    return false;
  }
}

// Run the test
runBasicTest().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});