import { AgentPass } from '../../src/core/AgentPass';
import { MCPServer } from '../../src/core/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListToolsResult, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import { Server } from 'http';

describe('MCP SSE Client E2E Tests', () => {
  let expressApp: express.Application;
  let expressServer: Server;
  let expressPort: number;
  let agentpass: AgentPass;
  let mcpServer: MCPServer;
  let mcpClient: Client;
  let sseTransport: SSEClientTransport;

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
      const userId = parseInt(req.params.id);
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
      
      res.status(201).json({ 
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
      name: 'sse-test-api',
      version: '1.0.0',
      description: 'SSE E2E Test API'
    });

    await agentpass.discover({ app: expressApp, framework: 'express' });
  }, 15000);

  afterAll(async () => {
    if (mcpClient) {
      await mcpClient.close();
    }
    if (mcpServer && mcpServer.isRunning()) {
      await mcpServer.stop();
    }
    if (expressServer) {
      await new Promise<void>((resolve) => {
        expressServer.close(() => resolve());
      });
    }
  });

  describe('SSE Transport E2E Flow', () => {
    it('should create SSE MCP server, connect with SSE client, and execute tools', async () => {
      // 1. Generate MCP server with SSE transport
      console.log('\n🚀 Step 1: Generating MCP server with SSE transport...');
      mcpServer = await agentpass.generateMCPServer({
        name: 'sse-e2e-mcp-server',
        version: '1.0.0',
        description: 'SSE E2E Test MCP Server',
        transport: 'sse',
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
      expect(mcpServer.transport.type).toBe('sse');

      // 2. Start MCP server
      console.log('\n▶️ Step 2: Starting SSE MCP server...');
      await mcpServer.start();
      expect(mcpServer.isRunning()).toBe(true);

      const mcpAddress = mcpServer.getAddress?.();
      expect(mcpAddress).toBeDefined();
      console.log(`✅ SSE MCP Server running at: ${mcpAddress}`);

      // 3. Create SSE client transport and connect
      console.log('\n🔌 Step 3: Creating SSE client and connecting...');
      const sseUrl = `${mcpAddress}/sse`;
      
      sseTransport = new SSEClientTransport(new URL(sseUrl));
      mcpClient = new Client(
        {
          name: "sse-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await mcpClient.connect(sseTransport);
      console.log('✅ SSE client connected successfully');

      // 4. Test tools/list
      console.log('\n🔧 Step 4: Testing tools/list...');
      const toolsResponse: ListToolsResult = await mcpClient.request(
        { method: "tools/list" },
        ListToolsRequestSchema
      );

      expect(toolsResponse.tools).toBeDefined();
      expect(Array.isArray(toolsResponse.tools)).toBe(true);
      expect(toolsResponse.tools.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ Found ${toolsResponse.tools.length} MCP tools:`);
      toolsResponse.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });

      // Verify specific tools exist
      const getUsersTool = toolsResponse.tools.find(t => t.name === 'get_users');
      const getUserByIdTool = toolsResponse.tools.find(t => t.name === 'get_users_by_id');
      const getHealthTool = toolsResponse.tools.find(t => t.name === 'get_health');
      const postUsersTool = toolsResponse.tools.find(t => t.name === 'post_users');

      expect(getUsersTool).toBeDefined();
      expect(getUserByIdTool).toBeDefined();
      expect(getHealthTool).toBeDefined();
      expect(postUsersTool).toBeDefined();

      // 5. Test tool execution: Get health
      console.log('\n💊 Step 5: Testing health check tool...');
      const healthResult: CallToolResult = await mcpClient.request(
        {
          method: "tools/call",
          params: {
            name: "get_health",
            arguments: {}
          }
        },
        CallToolRequestSchema
      );

      expect(healthResult.content).toBeDefined();
      expect(Array.isArray(healthResult.content)).toBe(true);
      expect(healthResult.content[0].type).toBe('text');

      const healthData = JSON.parse((healthResult.content[0] as any).text);
      console.log('✅ Health check result:', healthData);
      
      // Handle different response structures
      if (healthData.status === 200 && healthData.data) {
        expect(healthData.data.status).toBe('healthy');
        expect(healthData.data.version).toBe('1.0.0');
      } else {
        expect(healthData.status).toBe('healthy');
        expect(healthData.version).toBe('1.0.0');
      }

      // 6. Test tool execution: Get users
      console.log('\n👥 Step 6: Testing get users tool...');
      const usersResult: CallToolResult = await mcpClient.request(
        {
          method: "tools/call",
          params: {
            name: "get_users",
            arguments: {}
          }
        },
        CallToolRequestSchema
      );

      expect(usersResult.content).toBeDefined();
      const usersData = JSON.parse((usersResult.content[0] as any).text);
      console.log('✅ Users result:', usersData);
      
      // Handle different response structures
      if (usersData.status === 200 && usersData.data) {
        expect(usersData.data.users).toBeDefined();
        expect(Array.isArray(usersData.data.users)).toBe(true);
        expect(usersData.data.users.length).toBe(3);
        expect(usersData.data.pagination).toBeDefined();
      } else {
        expect(usersData.users).toBeDefined();
        expect(Array.isArray(usersData.users)).toBe(true);
        expect(usersData.users.length).toBe(3);
        expect(usersData.pagination).toBeDefined();
      }

      // 7. Test tool execution: Get user by ID
      console.log('\n👤 Step 7: Testing get user by ID tool...');
      const userByIdResult: CallToolResult = await mcpClient.request(
        {
          method: "tools/call",
          params: {
            name: "get_users_by_id",
            arguments: {
              id: "1"
            }
          }
        },
        CallToolRequestSchema
      );

      expect(userByIdResult.content).toBeDefined();
      const userData = JSON.parse((userByIdResult.content[0] as any).text);
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

      // 8. Test tool execution: Create user
      console.log('\n🆕 Step 8: Testing create user tool...');
      const createUserResult: CallToolResult = await mcpClient.request(
        {
          method: "tools/call",
          params: {
            name: "post_users",
            arguments: {
              name: "Test User",
              email: "test@example.com",
              role: "user"
            }
          }
        },
        CallToolRequestSchema
      );

      expect(createUserResult.content).toBeDefined();
      const createData = JSON.parse((createUserResult.content[0] as any).text);
      console.log('✅ Create user result:', createData);
      
      // Handle different response structures
      if (createData.status === 201 && createData.data) {
        expect(createData.data.message).toBe('User created successfully');
        expect(createData.data.user).toBeDefined();
        expect(createData.data.user.name).toBe('Test User');
        expect(createData.data.user.email).toBe('test@example.com');
      } else {
        expect(createData.message).toBe('User created successfully');
        expect(createData.user).toBeDefined();
        expect(createData.user.name).toBe('Test User');
        expect(createData.user.email).toBe('Test User');
      }

      // 9. Test error handling: Invalid user ID
      console.log('\n❌ Step 9: Testing error handling...');
      const errorResult: CallToolResult = await mcpClient.request(
        {
          method: "tools/call",
          params: {
            name: "get_users_by_id",
            arguments: {
              id: "999"
            }
          }
        },
        CallToolRequestSchema
      );

      expect(errorResult.content).toBeDefined();
      const errorData = JSON.parse((errorResult.content[0] as any).text);
      console.log('✅ Error handling result:', errorData);
      expect(errorData.status).toBe(404);
      expect(errorData.data.error).toBe('User not found');

      console.log('\n🎉 All SSE E2E tests passed successfully!');
    }, 60000); // 60 second timeout for comprehensive test

    it('should handle SSE connection errors gracefully', async () => {
      console.log('\n🚫 Testing SSE connection error handling...');
      
      // Try to connect to non-existent SSE server
      const badTransport = new SSEClientTransport(new URL('http://localhost:99999/sse'));
      const badClient = new Client(
        {
          name: "bad-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await expect(badClient.connect(badTransport)).rejects.toThrow();
      console.log('✅ SSE connection errors handled correctly');
    });
  });
});