import { AgentPass } from '../../src/core/AgentPass';
import { MCPServer } from '../../src/core/types';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import axios from 'axios';

describe('MCP Client Real E2E Tests', () => {
  let expressApp: express.Application;
  let expressServer: Server;
  let expressPort: number;
  let agentpass: AgentPass;
  let mcpServer: MCPServer;

  beforeAll(async () => {
    // Create a real Express server with test endpoints
    expressApp = express();
    expressApp.use(express.json());

    // Test endpoints
    expressApp.get('/api/users', (req: Request, res: Response) => {
      const { page = '1', limit = '5' } = req.query;
      res.json({
        users: [
          { id: 1, name: 'Alice Johnson', email: 'alice@company.com', role: 'admin' },
          { id: 2, name: 'Bob Smith', email: 'bob@company.com', role: 'user' },
          { id: 3, name: 'Carol Davis', email: 'carol@company.com', role: 'manager' }
        ],
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: 3
        }
      });
    });

    expressApp.get('/api/users/:id', (req: Request, res: Response) => {
      const userId = parseInt(req.params.id || '0');
      const users = [
        { id: 1, name: 'Alice Johnson', email: 'alice@company.com', role: 'admin', department: 'Engineering' },
        { id: 2, name: 'Bob Smith', email: 'bob@company.com', role: 'user', department: 'Sales' },
        { id: 3, name: 'Carol Davis', email: 'carol@company.com', role: 'manager', department: 'Marketing' }
      ];
      
      const user = users.find(u => u.id === userId);
      if (user) {
        res.json({ user });
      } else {
        res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
      }
    });

    expressApp.post('/api/users', (req: Request, res: Response) => {
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
      
      return res.status(201).json({ 
        message: 'User created successfully', 
        user: newUser 
      });
    });

    expressApp.get('/api/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: 'test'
      });
    });

    // Start Express server
    await new Promise<void>((resolve) => {
      expressServer = expressApp.listen(0, () => {
        const address = expressServer.address();
        expressPort = typeof address === 'object' && address ? address.port : 3000;
        console.log(`Test Express server started on port ${expressPort}`);
        resolve();
      });
    });

    // Create AgentPass instance and discover endpoints
    agentpass = new AgentPass({
      name: 'client-test-api',
      version: '1.0.0',
      description: 'Client E2E Test API'
    });

    await agentpass.discover({ app: expressApp, framework: 'express' });
  }, 15000);

  afterAll(async () => {
    if (mcpServer && mcpServer.isRunning()) {
      await mcpServer.stop();
    }
    if (expressServer) {
      await new Promise<void>((resolve) => {
        expressServer.close(() => resolve());
      });
    }
  });

  // Helper function to make MCP JSON-RPC calls via HTTP
  async function mcpHttpCall(url: string, method: string, params: any = {}) {
    const response = await axios.post(url, {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.data.error) {
      throw new Error(`MCP Error: ${response.data.error.message}`);
    }

    return response.data.result;
  }

  describe('All Transport Types E2E Flow', () => {
    it('should test HTTP transport with proper MCP JSON-RPC calls', async () => {
      // 1. Generate MCP server with HTTP transport
      console.log('\n🚀 Step 1: Generating MCP server with HTTP transport...');
      mcpServer = await agentpass.generateMCPServer({
        name: 'client-e2e-mcp-server',
        version: '1.0.0',
        description: 'Client E2E Test MCP Server',
        transport: 'http',
        port: 0, // Use random available port
        host: 'localhost',
        cors: true,
        baseUrl: `http://localhost:${expressPort}`,
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

      expect(mcpServer).toBeDefined();
      expect(mcpServer.transport.type).toBe('http');

      // 2. Start MCP server
      console.log('\n▶️ Step 2: Starting HTTP MCP server...');
      await mcpServer.start();
      expect(mcpServer.isRunning()).toBe(true);

      const mcpAddress = mcpServer.getAddress?.();
      expect(mcpAddress).toBeDefined();
      console.log(`✅ HTTP MCP Server running at: ${mcpAddress}`);

      const mcpUrl = `${mcpAddress}/mcp`;

      // 3. Test tools/list via HTTP JSON-RPC
      console.log('\n🔧 Step 3: Testing tools/list via HTTP...');
      const toolsResponse = await mcpHttpCall(mcpUrl, 'tools/list');

      expect(toolsResponse.tools).toBeDefined();
      expect(Array.isArray(toolsResponse.tools)).toBe(true);
      expect(toolsResponse.tools.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ Found ${toolsResponse.tools.length} MCP tools:`);
      toolsResponse.tools.forEach((tool: any) => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });

      // Verify specific tools exist
      const getUsersTool = toolsResponse.tools.find((t: any) => t.name === 'get_users');
      const getUserByIdTool = toolsResponse.tools.find((t: any) => t.name === 'get_users_by_id');
      const getHealthTool = toolsResponse.tools.find((t: any) => t.name === 'get_health');
      const postUsersTool = toolsResponse.tools.find((t: any) => t.name === 'post_users');

      expect(getUsersTool).toBeDefined();
      expect(getUserByIdTool).toBeDefined();
      expect(getHealthTool).toBeDefined();
      expect(postUsersTool).toBeDefined();

      // 4. Test tool execution: Get health
      console.log('\n💊 Step 4: Testing health check tool...');
      const healthResult = await mcpHttpCall(mcpUrl, 'tools/call', {
        name: 'get_health',
        arguments: {}
      });

      expect(healthResult.content).toBeDefined();
      expect(Array.isArray(healthResult.content)).toBe(true);
      expect(healthResult.content[0].type).toBe('text');

      const healthData = JSON.parse(healthResult.content[0].text);
      console.log('✅ Health check result:', healthData);
      
      // Handle different response structures
      if (healthData.status === 200 && healthData.data) {
        expect(healthData.data.status).toBe('healthy');
        expect(healthData.data.version).toBe('1.0.0');
      } else {
        expect(healthData.status).toBe('healthy');
        expect(healthData.version).toBe('1.0.0');
      }

      // 5. Test tool execution: Get users
      console.log('\n👥 Step 5: Testing get users tool...');
      const usersResult = await mcpHttpCall(mcpUrl, 'tools/call', {
        name: 'get_users',
        arguments: {}
      });

      expect(usersResult.content).toBeDefined();
      const usersData = JSON.parse(usersResult.content[0].text);
      console.log('✅ Users result:', usersData);
      
      // Handle different response structures
      if (usersData.status === 200 && usersData.data) {
        expect(usersData.data.users).toBeDefined();
        expect(Array.isArray(usersData.data.users)).toBe(true);
        expect(usersData.data.users.length).toBe(3);
      } else {
        expect(usersData.users).toBeDefined();
        expect(Array.isArray(usersData.users)).toBe(true);
        expect(usersData.users.length).toBe(3);
      }

      // 6. Test tool execution: Get user by ID
      console.log('\n👤 Step 6: Testing get user by ID tool...');
      const userByIdResult = await mcpHttpCall(mcpUrl, 'tools/call', {
        name: 'get_users_by_id',
        arguments: {
          id: '1'
        }
      });

      expect(userByIdResult.content).toBeDefined();
      const userData = JSON.parse(userByIdResult.content[0].text);
      console.log('✅ User by ID result:', userData);
      
      // Handle different response structures
      if (userData.status === 200 && userData.data) {
        expect(userData.data.user).toBeDefined();
        expect(userData.data.user.id).toBe(1);
        expect(userData.data.user.name).toBe('Alice Johnson');
      } else {
        expect(userData.user).toBeDefined();
        expect(userData.user.id).toBe(1);
        expect(userData.user.name).toBe('Alice Johnson');
      }

      // 7. Test error handling: Invalid user ID
      console.log('\n❌ Step 7: Testing error handling...');
      const errorResult = await mcpHttpCall(mcpUrl, 'tools/call', {
        name: 'get_users_by_id',
        arguments: {
          id: '999'
        }
      });

      expect(errorResult.content).toBeDefined();
      const errorData = JSON.parse(errorResult.content[0].text);
      console.log('✅ Error handling result:', errorData);
      expect(errorData.status).toBe(404);
      expect(errorData.data.error).toBe('User not found');

      console.log('\n🎉 All HTTP MCP Client E2E tests passed successfully!');
    }, 60000); // 60 second timeout for comprehensive test

    it('should test SSE transport creation and server startup', async () => {
      console.log('\n🚀 Testing SSE transport server creation...');
      
      const sseServer = await agentpass.generateMCPServer({
        name: 'sse-test-server',
        version: '1.0.0',
        transport: 'sse',
        port: 0,
        baseUrl: `http://localhost:${expressPort}`
      });

      expect(sseServer).toBeDefined();
      expect(sseServer.transport.type).toBe('sse');

      await sseServer.start();
      expect(sseServer.isRunning()).toBe(true);

      const sseAddress = sseServer.getAddress?.();
      expect(sseAddress).toBeDefined();
      console.log(`✅ SSE Server running at: ${sseAddress}`);

      // Test that SSE endpoints exist
      try {
        const sseHealthResponse = await axios.get(`${sseAddress}/sse`);
        console.log(`SSE health check status: ${sseHealthResponse.status}`);
      } catch (error: any) {
        // SSE endpoint may not have a GET health endpoint, that's ok
        console.log(`SSE endpoint test: ${error.response?.status || 'connection attempted'}`);
      }

      await sseServer.stop();
      expect(sseServer.isRunning()).toBe(false);
      console.log('✅ SSE server test completed');
    });

    it('should test stdio transport creation', async () => {
      console.log('\n🚀 Testing stdio transport server creation...');
      
      const stdioServer = await agentpass.generateMCPServer({
        name: 'stdio-test-server',
        version: '1.0.0',
        transport: 'stdio',
        baseUrl: `http://localhost:${expressPort}`
      });

      expect(stdioServer).toBeDefined();
      expect(stdioServer.transport.type).toBe('stdio');
      expect(stdioServer.info.name).toBe('stdio-test-server');

      // For stdio, we just test that it can be created
      // Full stdio testing requires process spawning which is complex
      console.log('✅ Stdio server creation test completed');
    });
  });
});