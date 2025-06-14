#!/usr/bin/env node

/**
 * Complete End-to-End MCP Example
 * 
 * This example demonstrates:
 * 1. Starting an Express API server
 * 2. Creating an MCP server from the Express endpoints using AgentPass
 * 3. Connecting an MCP client to the server
 * 4. Listing and calling tools via the MCP protocol
 */

import { AgentPass } from './dist/core/AgentPass.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import express from 'express';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { setTimeout } from 'timers/promises';

async function runFullE2EExample() {
  console.log('🚀 Full End-to-End MCP Example\n');
  
  let expressServer, mcpServerProcess;
  const tempServerFile = './temp-mcp-server.mjs';

  try {
    // =============================================================================
    // STEP 1: CREATE AND START EXPRESS API SERVER
    // =============================================================================
    console.log('📦 Step 1: Creating Express API server...');
    
    const app = express();
    app.use(express.json());

    // Create a realistic API with multiple endpoints
    app.get('/api/users', (req, res) => {
      const { page = 1, limit = 10, role } = req.query;
      let users = [
        { id: 1, name: 'Alice Johnson', email: 'alice@company.com', role: 'admin', department: 'Engineering' },
        { id: 2, name: 'Bob Smith', email: 'bob@company.com', role: 'user', department: 'Sales' },
        { id: 3, name: 'Carol Davis', email: 'carol@company.com', role: 'manager', department: 'Marketing' },
        { id: 4, name: 'David Wilson', email: 'david@company.com', role: 'user', department: 'Support' }
      ];

      // Filter by role if provided
      if (role) {
        users = users.filter(user => user.role === role);
      }

      // Pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      const paginatedUsers = users.slice(startIndex, endIndex);

      res.json({
        users: paginatedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: users.length,
          hasMore: endIndex < users.length
        }
      });
    });

    app.get('/api/users/:id', (req, res) => {
      const userId = parseInt(req.params.id);
      const users = [
        { id: 1, name: 'Alice Johnson', email: 'alice@company.com', role: 'admin', department: 'Engineering', joinDate: '2022-01-15' },
        { id: 2, name: 'Bob Smith', email: 'bob@company.com', role: 'user', department: 'Sales', joinDate: '2022-03-20' },
        { id: 3, name: 'Carol Davis', email: 'carol@company.com', role: 'manager', department: 'Marketing', joinDate: '2021-11-10' },
        { id: 4, name: 'David Wilson', email: 'david@company.com', role: 'user', department: 'Support', joinDate: '2023-02-05' }
      ];

      const user = users.find(u => u.id === userId);
      if (user) {
        res.json({ user });
      } else {
        res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
      }
    });

    app.post('/api/users', (req, res) => {
      const { name, email, role = 'user', department } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({ 
          error: 'Name and email are required', 
          code: 'VALIDATION_ERROR' 
        });
      }

      const newUser = {
        id: Math.floor(Math.random() * 10000),
        name,
        email,
        role,
        department: department || 'General',
        joinDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };

      res.status(201).json({ 
        user: newUser, 
        message: 'User created successfully' 
      });
    });

    app.get('/api/departments', (req, res) => {
      res.json({
        departments: [
          { id: 1, name: 'Engineering', userCount: 12, budget: 500000 },
          { id: 2, name: 'Sales', userCount: 8, budget: 300000 },
          { id: 3, name: 'Marketing', userCount: 6, budget: 200000 },
          { id: 4, name: 'Support', userCount: 4, budget: 150000 }
        ]
      });
    });

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: 'development'
      });
    });

    // Start Express server
    const expressPort = await new Promise((resolve) => {
      expressServer = app.listen(0, () => {
        const port = expressServer.address().port;
        console.log(`✅ Express API server running on port ${port}`);
        console.log(`   Available endpoints:`);
        console.log(`   • GET  /api/users (with pagination and role filtering)`);
        console.log(`   • GET  /api/users/:id`);
        console.log(`   • POST /api/users`);
        console.log(`   • GET  /api/departments`);
        console.log(`   • GET  /api/health`);
        resolve(port);
      });
    });

    // =============================================================================
    // STEP 2: CREATE MCP SERVER SCRIPT
    // =============================================================================
    console.log('\n🔧 Step 2: Creating MCP server...');
    
    const mcpServerScript = `#!/usr/bin/env node
import { AgentPass } from './dist/core/AgentPass.js';
import express from 'express';

async function startMCPServer() {
  try {
    // Create Express app for endpoint discovery
    const app = express();
    app.use(express.json());
    
    // Define the same routes for discovery (these won't be called, just analyzed)
    app.get('/api/users', (req, res) => res.json({}));
    app.get('/api/users/:id', (req, res) => res.json({}));
    app.post('/api/users', (req, res) => res.json({}));
    app.get('/api/departments', (req, res) => res.json({}));
    app.get('/api/health', (req, res) => res.json({}));

    // Initialize AgentPass
    const agentpass = new AgentPass({
      name: 'company-api',
      version: '1.0.0',
      description: 'Company Management API'
    });

    // Discover endpoints
    await agentpass.discover({ app, framework: 'express' });
    
    // Generate MCP server
    const mcpServer = await agentpass.generateMCPServer({
      name: 'company-api-mcp-server',
      version: '1.0.0',
      description: 'MCP Server for Company API',
      transport: 'stdio',
      baseUrl: 'http://localhost:${expressPort}',
      toolNaming: (endpoint) => {
        const method = endpoint.method.toLowerCase();
        const pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
        const resource = pathParts[pathParts.length - 1] || 'endpoint';
        
        if (endpoint.path.includes('{')) {
          return \`\${method}_\${resource}_by_id\`;
        }
        return \`\${method}_\${resource}\`;
      }
    });

    await mcpServer.start();
    
    // Handle graceful shutdown
    const cleanup = async () => {
      await mcpServer.stop();
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
  } catch (error) {
    console.error('MCP Server Error:', error.message);
    process.exit(1);
  }
}

startMCPServer();
`;

    // Write the MCP server script to a temporary file
    writeFileSync(tempServerFile, mcpServerScript);
    console.log('✅ MCP server script created');

    // =============================================================================
    // STEP 3: CONNECT MCP CLIENT AND LIST TOOLS
    // =============================================================================
    console.log('\n🔌 Step 3: Connecting MCP client...');
    
    // Create MCP client
    const mcpClient = new Client(
      { name: 'company-api-client', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    // Create stdio transport
    const transport = new StdioClientTransport({
      command: 'node',
      args: [tempServerFile]
    });

    // Connect to MCP server
    await mcpClient.connect(transport);
    console.log('✅ MCP client connected successfully!');

    // Get server information
    const serverInfo = mcpClient.getServerVersion();
    const serverCapabilities = mcpClient.getServerCapabilities();
    
    console.log('\n📋 MCP Server Information:');
    console.log(`   Name: ${serverInfo?.name}`);
    console.log(`   Version: ${serverInfo?.version}`);
    console.log(`   Capabilities: ${JSON.stringify(serverCapabilities)}`);

    // =============================================================================
    // STEP 4: LIST ALL TOOLS
    // =============================================================================
    console.log('\n🛠️ Step 4: Listing all available tools...');
    
    const toolsResult = await mcpClient.listTools();
    console.log(`\n✅ Found ${toolsResult.tools.length} tools generated from Express endpoints:\n`);

    toolsResult.tools.forEach((tool, index) => {
      console.log(`${index + 1}. 🔧 ${tool.name}`);
      console.log(`   Description: ${tool.description}`);
      console.log(`   Input Schema: ${tool.inputSchema.type}`);
      
      const properties = tool.inputSchema.properties || {};
      const required = tool.inputSchema.required || [];
      const paramCount = Object.keys(properties).length;
      
      if (paramCount > 0) {
        console.log(`   Parameters (${paramCount}):`);
        Object.entries(properties).forEach(([paramName, paramSchema]) => {
          const isRequired = required.includes(paramName);
          const requiredText = isRequired ? ' (required)' : ' (optional)';
          console.log(`     • ${paramName}: ${paramSchema.type}${requiredText}`);
          if (paramSchema.description) {
            console.log(`       ${paramSchema.description}`);
          }
        });
      } else {
        console.log(`   Parameters: None`);
      }
      console.log('');
    });

    // =============================================================================
    // STEP 5: DEMONSTRATE TOOL EXECUTION
    // =============================================================================
    console.log('🚀 Step 5: Demonstrating tool execution...\n');

    // Test 1: Get health status
    console.log('1. 💊 Testing health check...');
    const healthResult = await mcpClient.callTool({
      name: 'get_health',
      arguments: {}
    });
    const healthData = JSON.parse(healthResult.content[0].text);
    console.log(`   ✅ Health Status: ${healthData.data.status} (uptime: ${Math.round(healthData.data.uptime)}s)`);

    // Test 2: Get departments
    console.log('\n2. 🏢 Getting departments...');
    const deptResult = await mcpClient.callTool({
      name: 'get_departments',
      arguments: {}
    });
    const deptData = JSON.parse(deptResult.content[0].text);
    console.log(`   ✅ Found ${deptData.data.departments.length} departments:`);
    deptData.data.departments.forEach(dept => {
      console.log(`      • ${dept.name}: ${dept.userCount} users, $${dept.budget.toLocaleString()} budget`);
    });

    // Test 3: Get users with filtering
    console.log('\n3. 👥 Getting users (filtered by role=admin)...');
    const usersResult = await mcpClient.callTool({
      name: 'get_users',
      arguments: { role: 'admin', limit: '5' }
    });
    const usersData = JSON.parse(usersResult.content[0].text);
    console.log(`   ✅ Found ${usersData.data.users.length} admin users:`);
    usersData.data.users.forEach(user => {
      console.log(`      • ${user.name} (${user.email}) - ${user.department}`);
    });

    // Test 4: Get specific user
    console.log('\n4. 👤 Getting specific user (ID: 2)...');
    const userResult = await mcpClient.callTool({
      name: 'get_users_by_id',
      arguments: { id: '2' }
    });
    const userData = JSON.parse(userResult.content[0].text);
    console.log(`   ✅ User Details:`);
    console.log(`      • Name: ${userData.data.user.name}`);
    console.log(`      • Email: ${userData.data.user.email}`);
    console.log(`      • Role: ${userData.data.user.role}`);
    console.log(`      • Department: ${userData.data.user.department}`);
    console.log(`      • Join Date: ${userData.data.user.joinDate}`);

    // Test 5: Create new user
    console.log('\n5. ➕ Creating new user...');
    const createResult = await mcpClient.callTool({
      name: 'post_users',
      arguments: {
        body: {
          name: 'Eve Martinez',
          email: 'eve@company.com',
          role: 'designer',
          department: 'Design'
        }
      }
    });
    const createData = JSON.parse(createResult.content[0].text);
    console.log(`   ✅ User Created:`);
    console.log(`      • ID: ${createData.data.user.id}`);
    console.log(`      • Name: ${createData.data.user.name}`);
    console.log(`      • Role: ${createData.data.user.role}`);
    console.log(`      • Department: ${createData.data.user.department}`);

    // =============================================================================
    // SUCCESS SUMMARY
    // =============================================================================
    console.log('\n🎉 Full End-to-End Example Complete!\n');
    console.log('📊 Summary:');
    console.log(`   ✅ Express API server: Running on port ${expressPort}`);
    console.log(`   ✅ MCP server: Generated from ${toolsResult.tools.length} endpoints`);
    console.log(`   ✅ MCP client: Connected via stdio transport`);
    console.log(`   ✅ Tools: Listed and executed successfully`);
    console.log(`   ✅ Real API calls: Made to Express server via MCP tools`);
    console.log('\n🚀 This demonstrates the complete AgentPass → MCP → Client workflow!');

    // Close MCP client connection
    await transport.close();
    console.log('\n✅ MCP client disconnected');

  } catch (error) {
    console.error('\n❌ Example failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    
    if (mcpServerProcess) {
      mcpServerProcess.kill();
      console.log('✅ MCP server process stopped');
    }
    
    if (expressServer) {
      expressServer.close();
      console.log('✅ Express server stopped');
    }

    // Clean up temp file
    try {
      unlinkSync(tempServerFile);
      console.log('✅ Temporary files cleaned up');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run the example
runFullE2EExample();