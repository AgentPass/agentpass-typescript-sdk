import { AgentPass } from '../../src/core/AgentPass';
import { MCPServer } from '../../src/core/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('MCP Stdio Client E2E Tests', () => {
  let expressApp: express.Application;
  let expressServer: Server;
  let expressPort: number;
  let agentpass: AgentPass;
  let mcpClient: Client;
  let mcpProcess: ChildProcess;
  let stdioTransport: StdioClientTransport;

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
  }, 15000);

  afterAll(async () => {
    if (mcpClient) {
      await mcpClient.close();
    }
    if (mcpProcess) {
      mcpProcess.kill();
    }
    if (expressServer) {
      await new Promise<void>((resolve) => {
        expressServer.close(() => resolve());
      });
    }
  });

  // Helper function to create a standalone MCP server script
  async function createMCPServerScript(): Promise<string> {
    const scriptContent = `
import { AgentPass } from '../../src/core/AgentPass.js';
import express from 'express';

async function startMCPServer() {
  // Create Express app with same endpoints as test
  const app = express();
  app.use(express.json());

  app.get('/api/users', (req, res) => {
    const { page = '1', limit = '5' } = req.query;
    res.json({
      users: [
        { id: 1, name: 'Alice Johnson', email: 'alice@company.com', role: 'admin' },
        { id: 2, name: 'Bob Smith', email: 'bob@company.com', role: 'user' },
        { id: 3, name: 'Carol Davis', email: 'carol@company.com', role: 'manager' }
      ],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 3
      }
    });
  });

  app.get('/api/users/:id', (req, res) => {
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

  app.post('/api/users', (req, res) => {
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

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: 'test'
    });
  });

  // Create AgentPass instance
  const agentpass = new AgentPass({
    name: 'stdio-test-api',
    version: '1.0.0',
    description: 'Stdio E2E Test API'
  });

  // Discover endpoints
  await agentpass.discover({ app, framework: 'express' });

  // Generate MCP server with stdio transport
  const mcpServer = await agentpass.generateMCPServer({
    name: 'stdio-e2e-mcp-server',
    version: '1.0.0',
    description: 'Stdio E2E Test MCP Server',
    transport: 'stdio',
    baseUrl: 'http://localhost:${expressPort}',
    toolNaming: (endpoint) => {
      const method = endpoint.method.toLowerCase();
      let pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
      pathParts = pathParts.filter(p => p !== 'api');
      const resource = pathParts[pathParts.length - 1] || 'endpoint';
      
      if (endpoint.path.includes('{')) {
        return \`\${method}_\${resource}_by_id\`;
      }
      
      return \`\${method}_\${resource}\`;
    }
  });

  // Start MCP server (stdio)
  await mcpServer.start();
}

startMCPServer().catch(console.error);
`;

    const scriptPath = path.join(__dirname, 'temp-stdio-server.mjs');
    fs.writeFileSync(scriptPath, scriptContent.replace('${expressPort}', expressPort.toString()));
    return scriptPath;
  }

  describe('Stdio Transport E2E Flow', () => {
    it('should create stdio MCP server and connect with stdio client', async () => {
      // 1. Create temporary MCP server script
      console.log('\n📝 Step 1: Creating stdio MCP server script...');
      const serverScriptPath = await createMCPServerScript();

      try {
        // 2. Spawn stdio MCP server process
        console.log('\n🚀 Step 2: Spawning stdio MCP server process...');
        mcpProcess = spawn('node', [serverScriptPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Give the server time to start
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Create stdio client transport and connect
        console.log('\n🔌 Step 3: Creating stdio client and connecting...');
        stdioTransport = new StdioClientTransport({
          command: 'node',
          args: [serverScriptPath]
        });

        mcpClient = new Client(
          {
            name: "stdio-test-client",
            version: "1.0.0",
          },
          {
            capabilities: {
              tools: {}
            }
          }
        );

        await mcpClient.connect(stdioTransport);
        console.log('✅ Stdio client connected successfully');

        // 4. Test tools/list
        console.log('\n🔧 Step 4: Testing tools/list...');
        const toolsResponse = await mcpClient.request(
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
        const healthResult = await mcpClient.request(
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

        // 6. Test tool execution: Get users
        console.log('\n👥 Step 6: Testing get users tool...');
        const usersResult = await mcpClient.request(
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
        const usersData = JSON.parse(usersResult.content[0].text);
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
        const userByIdResult = await mcpClient.request(
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

        console.log('\n🎉 All Stdio E2E tests passed successfully!');

      } finally {
        // Cleanup
        if (fs.existsSync(serverScriptPath)) {
          fs.unlinkSync(serverScriptPath);
        }
      }
    }, 60000); // 60 second timeout for comprehensive test

    it('should handle stdio connection errors gracefully', async () => {
      console.log('\n🚫 Testing stdio connection error handling...');
      
      // Try to connect to non-existent command
      const badTransport = new StdioClientTransport({
        command: 'non-existent-command',
        args: []
      });

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
      console.log('✅ Stdio connection errors handled correctly');
    });
  });
});