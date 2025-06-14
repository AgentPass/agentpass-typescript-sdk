import { AgentPass } from '../../src/core/AgentPass';
import { MCPServer } from '../../src/core/types';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import axios from 'axios';

describe('MCP Real Server E2E Tests', () => {
  let expressApp: express.Application;
  let expressServer: Server;
  let expressPort: number;
  let agentpass: AgentPass;
  let mcpServer: MCPServer;

  beforeAll(async () => {
    // Create a real Express server
    expressApp = express();
    expressApp.use(express.json());

    // Add comprehensive test endpoints
    expressApp.get('/users', (req: Request, res: Response) => {
      const { page = '1', limit = '10' } = req.query;
      res.json({
        users: [
          { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin' },
          { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'user' },
          { id: 3, name: 'Bob Wilson', email: 'bob@example.com', role: 'user' }
        ],
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: 3
        }
      });
    });

    expressApp.get('/users/:id', (req: Request, res: Response) => {
      const userId = parseInt(req.params.id || '0');
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

    expressApp.post('/users', (req: Request, res: Response) => {
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

    expressApp.get('/products', (req: Request, res: Response) => {
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
        products = products.filter(p => p.price >= parseFloat(minPrice as string));
      }
      if (maxPrice) {
        products = products.filter(p => p.price <= parseFloat(maxPrice as string));
      }
      if (search) {
        const searchTerm = (search as string).toLowerCase();
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

    expressApp.get('/health', (req: Request, res: Response) => {
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

    // Create AgentPass instance
    agentpass = new AgentPass({
      name: 'real-test-api',
      version: '1.0.0',
      description: 'Real E2E Test API'
    });
  });

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

  describe('Full End-to-End MCP Workflow', () => {
    it('should discover endpoints, create MCP server, and execute tools successfully', async () => {
      // 1. Discover endpoints from the running Express app
      console.log('\n🔍 Step 1: Discovering endpoints...');
      await agentpass.discover({ 
        app: expressApp, 
        framework: 'express' 
      });

      const endpoints = agentpass.getEndpoints();
      console.log(`✅ Discovered ${endpoints.length} endpoints:`);
      endpoints.forEach(endpoint => {
        console.log(`  - ${endpoint.method} ${endpoint.path}`);
      });

      expect(endpoints.length).toBeGreaterThanOrEqual(5);
      
      // Verify specific endpoints
      const userListEndpoint = endpoints.find(e => e.path === '/users' && e.method === 'GET');
      const userByIdEndpoint = endpoints.find(e => e.path === '/users/{id}' && e.method === 'GET');
      const createUserEndpoint = endpoints.find(e => e.path === '/users' && e.method === 'POST');
      const productsEndpoint = endpoints.find(e => e.path === '/products' && e.method === 'GET');
      const healthEndpoint = endpoints.find(e => e.path === '/health' && e.method === 'GET');

      expect(userListEndpoint).toBeDefined();
      expect(userByIdEndpoint).toBeDefined();
      expect(createUserEndpoint).toBeDefined();
      expect(productsEndpoint).toBeDefined();
      expect(healthEndpoint).toBeDefined();

      // 2. Generate MCP server with HTTP transport
      console.log('\n🚀 Step 2: Generating MCP server...');
      mcpServer = await agentpass.generateMCPServer({
        name: 'real-e2e-mcp-server',
        version: '1.0.0',
        description: 'Real E2E Test MCP Server',
        transport: 'http',
        port: 0, // Use random available port
        host: 'localhost',
        cors: true,
        baseUrl: `http://localhost:${expressPort}`, // Point to our real Express server
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

      expect(mcpServer).toBeDefined();
      expect(mcpServer.transport.type).toBe('http');

      // 3. Start MCP server
      console.log('\n▶️ Step 3: Starting MCP server...');
      await mcpServer.start();
      expect(mcpServer.isRunning()).toBe(true);

      const mcpAddress = mcpServer.getAddress?.();
      expect(mcpAddress).toBeDefined();
      console.log(`✅ MCP Server running at: ${mcpAddress}`);

      const mcpPort = mcpAddress!.split(':')[2];
      const mcpBaseUrl = `http://localhost:${mcpPort}/mcp`;

      // 4. Test tools/list endpoint
      console.log('\n🔧 Step 4: Testing tools/list...');
      const listResponse = await axios.post(mcpBaseUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });

      expect(listResponse.status).toBe(200);
      expect(listResponse.data.result).toBeDefined();
      expect(listResponse.data.result.tools).toBeDefined();
      expect(Array.isArray(listResponse.data.result.tools)).toBe(true);

      const tools = listResponse.data.result.tools;
      console.log(`✅ Found ${tools.length} MCP tools:`);
      tools.forEach((tool: any) => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });

      expect(tools.length).toBeGreaterThanOrEqual(5);

      // Verify specific tools exist
      const getUsersTool = tools.find((t: any) => t.name === 'get_users');
      const getUserByIdTool = tools.find((t: any) => t.name === 'get_users_by_id');
      const getHealthTool = tools.find((t: any) => t.name === 'get_health');
      const getProductsTool = tools.find((t: any) => t.name === 'get_products');

      expect(getUsersTool).toBeDefined();
      expect(getUserByIdTool).toBeDefined();
      expect(getHealthTool).toBeDefined();
      expect(getProductsTool).toBeDefined();

      // 5. Test tool execution: Get health
      console.log('\n💊 Step 5: Testing health check tool...');
      const healthToolResponse = await axios.post(mcpBaseUrl, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'get_health',
          arguments: {}
        }
      });

      expect(healthToolResponse.status).toBe(200);
      expect(healthToolResponse.data.result).toBeDefined();
      expect(healthToolResponse.data.result.content).toBeDefined();

      const healthResult = JSON.parse(healthToolResponse.data.result.content[0].text);
      console.log('✅ Health check result:', healthResult);
      
      // Handle different response structures
      if (healthResult.status === 200 && healthResult.data) {
        // HTTP response wrapper
        expect(healthResult.data.status).toBe('healthy');
        expect(healthResult.data.version).toBe('1.0.0');
      } else {
        // Direct response
        expect(healthResult.status).toBe('healthy');
        expect(healthResult.version).toBe('1.0.0');
      }

      // 6. Test tool execution: Get users
      console.log('\n👥 Step 6: Testing get users tool...');
      const usersToolResponse = await axios.post(mcpBaseUrl, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_users',
          arguments: {}
        }
      });

      expect(usersToolResponse.status).toBe(200);
      const usersResult = JSON.parse(usersToolResponse.data.result.content[0].text);
      console.log('✅ Users result:', usersResult);
      
      // Handle different response structures
      if (usersResult.status === 200 && usersResult.data) {
        // HTTP response wrapper
        expect(usersResult.data.users).toBeDefined();
        expect(Array.isArray(usersResult.data.users)).toBe(true);
        expect(usersResult.data.users.length).toBe(3);
        expect(usersResult.data.pagination).toBeDefined();
      } else {
        // Direct response
        expect(usersResult.users).toBeDefined();
        expect(Array.isArray(usersResult.users)).toBe(true);
        expect(usersResult.users.length).toBe(3);
        expect(usersResult.pagination).toBeDefined();
      }

      // 7. Test tool execution: Get user by ID
      console.log('\n👤 Step 7: Testing get user by ID tool...');
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

      expect(userByIdResponse.status).toBe(200);
      const userResult = JSON.parse(userByIdResponse.data.result.content[0].text);
      console.log('✅ User by ID result:', userResult);
      
      // Handle different response structures
      if (userResult.status === 200 && userResult.data) {
        // HTTP response wrapper
        expect(userResult.data.user).toBeDefined();
        expect(userResult.data.user.id).toBe(1);
        expect(userResult.data.user.name).toBe('John Doe');
      } else {
        // Direct response
        expect(userResult.user).toBeDefined();
        expect(userResult.user.id).toBe(1);
        expect(userResult.user.name).toBe('John Doe');
      }

      // 8. Test tool execution: Get products with filters
      console.log('\n🛍️ Step 8: Testing get products with filters...');
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

      expect(productsResponse.status).toBe(200);
      const productsResult = JSON.parse(productsResponse.data.result.content[0].text);
      console.log('✅ Filtered products result:', productsResult);
      
      // Handle different response structures
      if (productsResult.status === 200 && productsResult.data) {
        // HTTP response wrapper
        expect(productsResult.data.products).toBeDefined();
        expect(Array.isArray(productsResult.data.products)).toBe(true);
        expect(productsResult.data.filters.category).toBe('electronics');
        expect(productsResult.data.filters.minPrice).toBe('25');
      } else {
        // Direct response
        expect(productsResult.products).toBeDefined();
        expect(Array.isArray(productsResult.products)).toBe(true);
        expect(productsResult.filters.category).toBe('electronics');
        expect(productsResult.filters.minPrice).toBe('25');
      }

      // 9. Test error handling: Invalid user ID
      console.log('\n❌ Step 9: Testing error handling...');
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

      expect(errorResponse.status).toBe(200); // MCP call succeeds, but HTTP call returns 404
      const errorResult = JSON.parse(errorResponse.data.result.content[0].text);
      console.log('✅ Error handling result:', errorResult);
      expect(errorResult.status).toBe(404);
      expect(errorResult.data.error).toBe('User not found');

      // 10. Test invalid tool name
      console.log('\n🚫 Step 10: Testing invalid tool name...');
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
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(500);
        expect(error.response.data.error.message).toContain('Tool not found');
        console.log('✅ Invalid tool correctly rejected');
      }

      console.log('\n🎉 All E2E tests passed successfully!');
    }, 30000); // 30 second timeout for comprehensive test
  });

  describe('MCP Server Configuration Tests', () => {
    it('should handle different server configurations', async () => {
      await agentpass.discover({ app: expressApp, framework: 'express' });

      // Test with custom capabilities
      const customMcpServer = await agentpass.generateMCPServer({
        name: 'custom-config-server',
        version: '2.0.0',
        transport: 'http',
        port: 0,
        baseUrl: `http://localhost:${expressPort}`,
        capabilities: {
          tools: true,
          resources: false,
          prompts: false,
          logging: true
        }
      });

      expect(customMcpServer.info.name).toBe('custom-config-server');
      expect(customMcpServer.info.version).toBe('2.0.0');
      expect(customMcpServer.capabilities.tools).toBe(true);
      expect(customMcpServer.capabilities.resources).toBe(false);
      expect(customMcpServer.capabilities.logging).toBe(true);

      await customMcpServer.start();
      expect(customMcpServer.isRunning()).toBe(true);
      await customMcpServer.stop();
      expect(customMcpServer.isRunning()).toBe(false);
    });

    it('should handle CORS properly', async () => {
      await agentpass.discover({ app: expressApp, framework: 'express' });

      const corsServer = await agentpass.generateMCPServer({
        transport: 'http',
        port: 0,
        cors: true,
        baseUrl: `http://localhost:${expressPort}`
      });

      await corsServer.start();
      const address = corsServer.getAddress?.();
      const port = address!.split(':')[2];

      // Test CORS preflight
      const optionsResponse = await axios.options(`http://localhost:${port}/mcp`);
      expect(optionsResponse.status).toBe(200);

      await corsServer.stop();
    });
  });
});