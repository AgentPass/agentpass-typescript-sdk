import { AgentPass } from '../../src/core/AgentPass';
import { MCPServer } from '../../src/core/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { createSampleAPI as createSampleAPIFastify } from '../../examples/fastify/api-implementation';
import { FastifyInstance } from 'fastify';

describe('MCP Real Clients E2E Tests', () => {
  let expressApp: express.Application;
  let expressServer: Server;
  let expressPort: number;
  let agentpass: AgentPass;
  
  let fastifyApp: FastifyInstance;
  let fastifyPort: number;
  let fastifyAgentpass: AgentPass;
  
  let openApiAgentpass: AgentPass;

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

    // Create AgentPass instance with auto-discovery
    agentpass = await AgentPass.create({
      name: 'real-clients-test-api',
      version: '1.0.0',
      description: 'Real MCP Clients E2E Test API',
      app: expressApp,
      framework: 'express'
    });

    // Create Fastify server and discover endpoints BEFORE starting
    fastifyApp = await createSampleAPIFastify();
    
    // Create Fastify AgentPass instance with auto-discovery
    fastifyAgentpass = await AgentPass.create({
      name: 'real-clients-test-api-fastify',
      version: '1.0.0',
      description: 'Real MCP Clients E2E Test API (Fastify)',
      app: fastifyApp,
      framework: 'fastify'
    });

    // Now start the Fastify server
    await fastifyApp.listen({ port: 0, host: 'localhost' });
    const fastifyAddress = fastifyApp.server.address();
    fastifyPort = typeof fastifyAddress === 'object' && fastifyAddress ? fastifyAddress.port : 3001;
    console.log(`Test Fastify server started on port ${fastifyPort}`);

    // Create OpenAPI AgentPass instance with real API URL
    openApiAgentpass = await AgentPass.create({
      name: 'test-petstore-api',
      version: '1.0.0',
      description: 'Test Petstore API from OpenAPI specification',
      framework: 'openapi',
      openapi: 'https://petstore3.swagger.io/api/v3/openapi.json',
      baseUrl: 'https://petstore3.swagger.io/api/v3'
    });
    console.log(`Test OpenAPI AgentPass created with ${openApiAgentpass.getEndpoints().length} endpoints`);
  }, 30000); // Increased timeout for HTTP fetching

  afterAll(async () => {
    if (expressServer) {
      await new Promise<void>((resolve) => {
        expressServer.close(() => resolve());
      });
    }
    if (fastifyApp) {
      await fastifyApp.close();
    }
  });

  describe('HTTP Transport with MCP SDK Client', () => {
    let httpMcpServer: MCPServer;
    let httpClient: Client;
    let httpTransport: StreamableHTTPClientTransport;

    afterEach(async () => {
      if (httpClient) {
        try {
          await httpClient.close();
        } catch (error) {
          console.log('HTTP client close error:', error);
        }
      }
      if (httpMcpServer && httpMcpServer.isRunning()) {
        await httpMcpServer.stop();
      }
    });

    it('should start HTTP MCP server and connect with MCP SDK HTTP client', async () => {
      console.log('\n🚀 Testing HTTP MCP Server with MCP SDK Client...');
      
      // 1. Generate and start HTTP MCP server
      httpMcpServer = await agentpass.generateMCPServer({
        name: 'http-real-test-server',
        version: '1.0.0',
        transport: 'http',
        port: 0,
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

      await httpMcpServer.start();
      expect(httpMcpServer.isRunning()).toBe(true);

      const mcpAddress = httpMcpServer.getAddress?.();
      expect(mcpAddress).toBeDefined();
      console.log(`✅ HTTP MCP Server running at: ${mcpAddress}`);

      // 2. Create HTTP client transport and connect
      console.log('\n🔌 Connecting MCP SDK HTTP client...');
      const httpUrl = `${mcpAddress}/mcp`;
      
      httpTransport = new StreamableHTTPClientTransport(new URL(httpUrl));
      httpClient = new Client(
        {
          name: "http-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await httpClient.connect(httpTransport);
      console.log('✅ HTTP MCP client connected successfully');

      // 3. Test listTools with MCP SDK client
      console.log('\n🔧 Testing listTools() via MCP SDK HTTP client...');
      const toolsResult = await httpClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools:`);
      toolsResult.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });

      // 4. Test callTool - Get users
      console.log('\n👥 Testing callTool() get_users via MCP SDK HTTP client...');
      const usersResult = await httpClient.callTool({
        name: "get_users",
        arguments: {}
      });

      expect(usersResult.content).toBeDefined();
      const usersData = JSON.parse((usersResult.content as any)[0].text);
      console.log('✅ Users result:', usersData);

      console.log('\n🎉 HTTP MCP SDK Client test completed successfully!');
    }, 30000);
  });

  describe('SSE Transport with MCP SDK Client', () => {
    let sseMcpServer: MCPServer;
    let sseClient: Client;
    let sseTransport: SSEClientTransport;

    afterEach(async () => {
      if (sseClient) {
        try {
          await sseClient.close();
        } catch (error) {
          console.log('SSE client close error:', error);
        }
      }
      if (sseMcpServer && sseMcpServer.isRunning()) {
        await sseMcpServer.stop();
      }
    });

    it('should start SSE MCP server and connect with MCP SDK SSE client', async () => {
      console.log('\n🚀 Testing SSE MCP Server with MCP SDK Client...');
      
      // 1. Generate and start SSE MCP server
      sseMcpServer = await agentpass.generateMCPServer({
        name: 'sse-real-test-server',
        version: '1.0.0',
        transport: 'sse',
        port: 0,
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

      await sseMcpServer.start();
      expect(sseMcpServer.isRunning()).toBe(true);

      const sseAddress = sseMcpServer.getAddress?.();
      expect(sseAddress).toBeDefined();
      console.log(`✅ SSE MCP Server running at: ${sseAddress}`);

      // 2. Create SSE client transport and connect
      console.log('\n🔌 Connecting MCP SDK SSE client...');
      const sseUrl = `${sseAddress}/sse`;
      
      sseTransport = new SSEClientTransport(new URL(sseUrl));
      sseClient = new Client(
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

      await sseClient.connect(sseTransport);
      console.log('✅ SSE MCP client connected successfully');

      // 3. Test listTools with MCP SDK SSE client
      console.log('\n🔧 Testing listTools() via MCP SDK SSE client...');
      const toolsResult = await sseClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools via SSE`);

      console.log('\n🎉 SSE MCP SDK Client test completed successfully!');
    }, 30000);
  });

  describe('Stdio Transport with MCP SDK Client', () => {
    let stdioClient: Client;
    let stdioTransport: StdioClientTransport;

    afterEach(async () => {
      if (stdioClient) {
        try {
          await stdioClient.close();
        } catch (error) {
          console.log('Stdio client close error:', error);
        }
      }
    });

    it('should connect to stdio MCP server using MCP SDK stdio client', async () => {
      console.log('\n🚀 Testing Stdio MCP Server with MCP SDK Client...');
      
      // Create a command that runs our stdio server
      // This simulates how Claude Desktop would connect to a stdio MCP server
      const command = 'npx';
      const args = [
        'ts-node', 
        '--project', 
        'examples/tsconfig.json', 
        'examples/express/server.ts',
        'stdio'
      ];

      // 1. Create stdio client transport 
      console.log('\n🔌 Connecting MCP SDK Stdio client...');
      stdioTransport = new StdioClientTransport({
        command,
        args
      });

      stdioClient = new Client(
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

      await stdioClient.connect(stdioTransport);
      console.log('✅ Stdio MCP client connected successfully');

      // 2. Test listTools with MCP SDK stdio client
      console.log('\n🔧 Testing listTools() via MCP SDK Stdio client...');
      const toolsResult = await stdioClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools via Stdio`);

      // 3. Test callTool with MCP SDK stdio client
      console.log('\n👥 Testing callTool() get_users via MCP SDK Stdio client...');
      const usersResult = await stdioClient.callTool({
        name: "get_users",
        arguments: {}
      });

      expect(usersResult.content).toBeDefined();
      expect(Array.isArray(usersResult.content)).toBe(true);
      console.log('✅ Get users via Stdio successful');

      console.log('\n🎉 Stdio MCP SDK Client test completed successfully!');
    }, 45000); // Longer timeout for process spawning
  });

  // Fastify Tests
  describe('Fastify HTTP Transport with MCP SDK Client', () => {
    let httpMcpServer: MCPServer;
    let httpClient: Client;
    let httpTransport: StreamableHTTPClientTransport;

    afterEach(async () => {
      if (httpClient) {
        try {
          await httpClient.close();
        } catch (error) {
          console.log('Fastify HTTP client close error:', error);
        }
      }
      if (httpMcpServer && httpMcpServer.isRunning()) {
        await httpMcpServer.stop();
      }
    });

    it('should start Fastify HTTP MCP server and connect with MCP SDK HTTP client', async () => {
      console.log('\n🚀 Testing Fastify HTTP MCP Server with MCP SDK Client...');
      
      // 1. Generate and start HTTP MCP server with Fastify
      httpMcpServer = await fastifyAgentpass.generateMCPServer({
        name: 'fastify-http-real-test-server',
        version: '1.0.0',
        transport: 'http',
        port: 0,
        cors: true,
        baseUrl: `http://localhost:${fastifyPort}`,
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

      await httpMcpServer.start();
      expect(httpMcpServer.isRunning()).toBe(true);

      const mcpAddress = httpMcpServer.getAddress?.();
      expect(mcpAddress).toBeDefined();
      console.log(`✅ Fastify HTTP MCP Server running at: ${mcpAddress}`);

      // 2. Create HTTP client transport and connect
      console.log('\n🔌 Connecting MCP SDK HTTP client to Fastify...');
      const httpUrl = `${mcpAddress}/mcp`;
      
      httpTransport = new StreamableHTTPClientTransport(new URL(httpUrl));
      httpClient = new Client(
        {
          name: "fastify-http-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await httpClient.connect(httpTransport);
      console.log('✅ Fastify HTTP MCP client connected successfully');

      // 3. Test listTools with MCP SDK client
      console.log('\n🔧 Testing listTools() via MCP SDK Fastify HTTP client...');
      const toolsResult = await httpClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools from Fastify:`);
      toolsResult.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });

      // 4. Test callTool - Get users
      console.log('\n👥 Testing callTool() get_users via MCP SDK Fastify HTTP client...');
      const usersResult = await httpClient.callTool({
        name: "get_users",
        arguments: {}
      });

      expect(usersResult.content).toBeDefined();
      const usersData = JSON.parse((usersResult.content as any)[0].text);
      console.log('✅ Fastify Users result:', usersData);

      console.log('\n🎉 Fastify HTTP MCP SDK Client test completed successfully!');
    }, 30000);
  });

  describe('Fastify SSE Transport with MCP SDK Client', () => {
    let sseMcpServer: MCPServer;
    let sseClient: Client;
    let sseTransport: SSEClientTransport;

    afterEach(async () => {
      if (sseClient) {
        try {
          await sseClient.close();
        } catch (error) {
          console.log('Fastify SSE client close error:', error);
        }
      }
      if (sseMcpServer && sseMcpServer.isRunning()) {
        await sseMcpServer.stop();
      }
    });

    it('should start Fastify SSE MCP server and connect with MCP SDK SSE client', async () => {
      console.log('\n🚀 Testing Fastify SSE MCP Server with MCP SDK Client...');
      
      // 1. Generate and start SSE MCP server with Fastify
      sseMcpServer = await fastifyAgentpass.generateMCPServer({
        name: 'fastify-sse-real-test-server',
        version: '1.0.0',
        transport: 'sse',
        port: 0,
        cors: true,
        baseUrl: `http://localhost:${fastifyPort}`,
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

      await sseMcpServer.start();
      expect(sseMcpServer.isRunning()).toBe(true);

      const sseAddress = sseMcpServer.getAddress?.();
      expect(sseAddress).toBeDefined();
      console.log(`✅ Fastify SSE MCP Server running at: ${sseAddress}`);

      // 2. Create SSE client transport and connect
      console.log('\n🔌 Connecting MCP SDK SSE client to Fastify...');
      const sseUrl = `${sseAddress}/sse`;
      
      sseTransport = new SSEClientTransport(new URL(sseUrl));
      sseClient = new Client(
        {
          name: "fastify-sse-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await sseClient.connect(sseTransport);
      console.log('✅ Fastify SSE MCP client connected successfully');

      // 3. Test listTools with MCP SDK SSE client
      console.log('\n🔧 Testing listTools() via MCP SDK Fastify SSE client...');
      const toolsResult = await sseClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools via Fastify SSE`);

      console.log('\n🎉 Fastify SSE MCP SDK Client test completed successfully!');
    }, 30000);
  });

  describe('Fastify Stdio Transport with MCP SDK Client', () => {
    let stdioClient: Client;
    let stdioTransport: StdioClientTransport;

    afterEach(async () => {
      if (stdioClient) {
        try {
          await stdioClient.close();
        } catch (error) {
          console.log('Fastify Stdio client close error:', error);
        }
      }
    });

    it('should connect to Fastify stdio MCP server using MCP SDK stdio client', async () => {
      console.log('\n🚀 Testing Fastify Stdio MCP Server with MCP SDK Client...');
      
      // Create a command that runs our Fastify stdio server
      const command = 'npx';
      const args = [
        'ts-node', 
        '--project', 
        'examples/tsconfig.json', 
        'examples/fastify/server.ts',
        'stdio'
      ];

      // 1. Create stdio client transport 
      console.log('\n🔌 Connecting MCP SDK Stdio client to Fastify...');
      stdioTransport = new StdioClientTransport({
        command,
        args
      });

      stdioClient = new Client(
        {
          name: "fastify-stdio-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await stdioClient.connect(stdioTransport);
      console.log('✅ Fastify Stdio MCP client connected successfully');

      // 2. Test listTools with MCP SDK stdio client
      console.log('\n🔧 Testing listTools() via MCP SDK Fastify Stdio client...');
      const toolsResult = await stdioClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools via Fastify Stdio`);

      // 3. Test callTool with MCP SDK stdio client
      console.log('\n👥 Testing callTool() get_users via MCP SDK Fastify Stdio client...');
      const usersResult = await stdioClient.callTool({
        name: "get_users",
        arguments: {}
      });

      expect(usersResult.content).toBeDefined();
      expect(Array.isArray(usersResult.content)).toBe(true);
      console.log('✅ Get users via Fastify Stdio successful');

      console.log('\n🎉 Fastify Stdio MCP SDK Client test completed successfully!');
    }, 45000); // Longer timeout for process spawning
  });

  // OpenAPI Tests
  describe('OpenAPI HTTP Transport with MCP SDK Client', () => {
    let httpMcpServer: MCPServer;
    let httpClient: Client;
    let httpTransport: StreamableHTTPClientTransport;

    afterEach(async () => {
      if (httpClient) {
        try {
          await httpClient.close();
        } catch (error) {
          console.log('OpenAPI HTTP client close error:', error);
        }
      }
      if (httpMcpServer && httpMcpServer.isRunning()) {
        await httpMcpServer.stop();
      }
    });

    it('should start OpenAPI HTTP MCP server and connect with MCP SDK HTTP client', async () => {
      console.log('\n🚀 Testing OpenAPI HTTP MCP Server with MCP SDK Client...');
      
      // 1. Generate and start HTTP MCP server with OpenAPI
      httpMcpServer = await openApiAgentpass.generateMCPServer({
        name: 'openapi-http-real-test-server',
        version: '1.0.0',
        transport: 'http',
        port: 0,
        cors: true,
        baseUrl: 'https://petstore3.swagger.io/api/v3',
        toolNaming: (endpoint) => {
          // Use OpenAPI operation ID if available, otherwise generate
          if (endpoint.metadata?.operationId && typeof endpoint.metadata.operationId === 'string') {
            return endpoint.metadata.operationId;
          }
          
          const method = endpoint.method.toLowerCase();
          const pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
          const resource = pathParts[pathParts.length - 1] || 'resource';
          
          return `${method}_${resource}`;
        }
      });

      await httpMcpServer.start();
      expect(httpMcpServer.isRunning()).toBe(true);

      const mcpAddress = httpMcpServer.getAddress?.();
      expect(mcpAddress).toBeDefined();
      console.log(`✅ OpenAPI HTTP MCP Server running at: ${mcpAddress}`);

      // 2. Create HTTP client transport and connect
      console.log('\n🔌 Connecting MCP SDK HTTP client to OpenAPI...');
      const httpUrl = `${mcpAddress}/mcp`;
      
      httpTransport = new StreamableHTTPClientTransport(new URL(httpUrl));
      httpClient = new Client(
        {
          name: "openapi-http-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await httpClient.connect(httpTransport);
      console.log('✅ OpenAPI HTTP MCP client connected successfully');

      // 3. Test listTools with MCP SDK client
      console.log('\n🔧 Testing listTools() via MCP SDK OpenAPI HTTP client...');
      const toolsResult = await httpClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBe(19); // Real Petstore API has 19 endpoints

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools from OpenAPI:`);
      toolsResult.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });

      // Verify some key tool names match OpenAPI operationIds from real API
      const toolNames = toolsResult.tools.map(tool => tool.name);
      expect(toolNames).toContain('addPet');
      expect(toolNames).toContain('updatePet');
      expect(toolNames).toContain('findPetsByStatus');
      expect(toolNames).toContain('getPetById');
      expect(toolNames).toContain('deletePet');
      expect(toolNames).toContain('placeOrder');
      expect(toolNames).toContain('getInventory');
      expect(toolNames).toContain('createUser');

      // 4. Test callTool - Get store inventory (simple GET request)
      console.log('\n📦 Testing callTool() getInventory via MCP SDK OpenAPI HTTP client...');
      const inventoryResult = await httpClient.callTool({
        name: "getInventory",
        arguments: {}
      });

      expect(inventoryResult.content).toBeDefined();
      expect(Array.isArray(inventoryResult.content)).toBe(true);
      
      // Try to parse the actual response data like we do in Express tests
      try {
        const inventoryData = JSON.parse((inventoryResult.content as any)[0].text);
        console.log('✅ Inventory result:', typeof inventoryData === 'object' ? 'valid JSON response' : 'unexpected format');
      } catch (error) {
        console.log('✅ Inventory result received (non-JSON):', (inventoryResult.content as any[]).length > 0 ? 'success' : 'empty');
      }

      console.log('\n🎉 OpenAPI HTTP MCP SDK Client test completed successfully!');
    }, 30000);
  });

  describe('OpenAPI SSE Transport with MCP SDK Client', () => {
    let sseMcpServer: MCPServer;
    let sseClient: Client;
    let sseTransport: SSEClientTransport;

    afterEach(async () => {
      if (sseClient) {
        try {
          await sseClient.close();
        } catch (error) {
          console.log('OpenAPI SSE client close error:', error);
        }
      }
      if (sseMcpServer && sseMcpServer.isRunning()) {
        await sseMcpServer.stop();
      }
    });

    it('should start OpenAPI SSE MCP server and connect with MCP SDK SSE client', async () => {
      console.log('\n🚀 Testing OpenAPI SSE MCP Server with MCP SDK Client...');
      
      // 1. Generate and start SSE MCP server with OpenAPI
      sseMcpServer = await openApiAgentpass.generateMCPServer({
        name: 'openapi-sse-real-test-server',
        version: '1.0.0',
        transport: 'sse',
        port: 0,
        cors: true,
        baseUrl: 'https://petstore3.swagger.io/api/v3',
        toolNaming: (endpoint) => {
          // Use OpenAPI operation ID if available, otherwise generate
          if (endpoint.metadata?.operationId && typeof endpoint.metadata.operationId === 'string') {
            return endpoint.metadata.operationId;
          }
          
          const method = endpoint.method.toLowerCase();
          const pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
          const resource = pathParts[pathParts.length - 1] || 'resource';
          
          return `${method}_${resource}`;
        }
      });

      await sseMcpServer.start();
      expect(sseMcpServer.isRunning()).toBe(true);

      const sseAddress = sseMcpServer.getAddress?.();
      expect(sseAddress).toBeDefined();
      console.log(`✅ OpenAPI SSE MCP Server running at: ${sseAddress}`);

      // 2. Create SSE client transport and connect
      console.log('\n🔌 Connecting MCP SDK SSE client to OpenAPI...');
      const sseUrl = `${sseAddress}/sse`;
      
      sseTransport = new SSEClientTransport(new URL(sseUrl));
      sseClient = new Client(
        {
          name: "openapi-sse-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await sseClient.connect(sseTransport);
      console.log('✅ OpenAPI SSE MCP client connected successfully');

      // 3. Test listTools with MCP SDK SSE client
      console.log('\n🔧 Testing listTools() via MCP SDK OpenAPI SSE client...');
      const toolsResult = await sseClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBe(19);

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools via OpenAPI SSE`);

      // Verify some key tool names match OpenAPI operationIds from real API
      const toolNames = toolsResult.tools.map(tool => tool.name);
      expect(toolNames).toContain('addPet');
      expect(toolNames).toContain('updatePet');
      expect(toolNames).toContain('findPetsByStatus');
      expect(toolNames).toContain('getPetById');
      expect(toolNames).toContain('deletePet');
      expect(toolNames).toContain('placeOrder');
      expect(toolNames).toContain('getInventory');
      expect(toolNames).toContain('createUser');

      // 4. Test callTool - Get store inventory (simple GET request)
      console.log('\n📦 Testing callTool() getInventory via MCP SDK OpenAPI SSE client...');
      const inventoryResult = await sseClient.callTool({
        name: "getInventory",
        arguments: {}
      });

      expect(inventoryResult.content).toBeDefined();
      expect(Array.isArray(inventoryResult.content)).toBe(true);
      
      // Try to parse the actual response data like we do in Express tests
      try {
        const inventoryData = JSON.parse((inventoryResult.content as any)[0].text);
        console.log('✅ Inventory result via SSE:', typeof inventoryData === 'object' ? 'valid JSON response' : 'unexpected format');
      } catch (error) {
        console.log('✅ Inventory result received via SSE (non-JSON):', (inventoryResult.content as any[]).length > 0 ? 'success' : 'empty');
      }

      console.log('\n🎉 OpenAPI SSE MCP SDK Client test completed successfully!');
    }, 30000);
  });

  describe('OpenAPI Stdio Transport with MCP SDK Client', () => {
    let stdioClient: Client;
    let stdioTransport: StdioClientTransport;

    afterEach(async () => {
      if (stdioClient) {
        try {
          await stdioClient.close();
        } catch (error) {
          console.log('OpenAPI Stdio client close error:', error);
        }
      }
    });

    it('should connect to OpenAPI stdio MCP server using MCP SDK stdio client', async () => {
      console.log('\n🚀 Testing OpenAPI Stdio MCP Server with MCP SDK Client...');
      
      // Create a command that runs our OpenAPI stdio server
      const command = 'npx';
      const args = [
        'ts-node', 
        '--project', 
        'examples/tsconfig.json', 
        'examples/openapi/server.ts',
        'stdio'
      ];

      // 1. Create stdio client transport 
      console.log('\n🔌 Connecting MCP SDK Stdio client to OpenAPI...');
      stdioTransport = new StdioClientTransport({
        command,
        args
      });

      stdioClient = new Client(
        {
          name: "openapi-stdio-test-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await stdioClient.connect(stdioTransport);
      console.log('✅ OpenAPI Stdio MCP client connected successfully');

      // 2. Test listTools with MCP SDK stdio client
      console.log('\n🔧 Testing listTools() via MCP SDK OpenAPI Stdio client...');
      const toolsResult = await stdioClient.listTools();

      expect(toolsResult.tools).toBeDefined();
      expect(Array.isArray(toolsResult.tools)).toBe(true);
      expect(toolsResult.tools.length).toBe(19);

      console.log(`✅ Found ${toolsResult.tools.length} MCP tools via OpenAPI Stdio`);

      // Verify some key tool names match OpenAPI operationIds from real API
      const toolNames = toolsResult.tools.map(tool => tool.name);
      expect(toolNames).toContain('addPet');
      expect(toolNames).toContain('updatePet');
      expect(toolNames).toContain('findPetsByStatus');
      expect(toolNames).toContain('getPetById');
      expect(toolNames).toContain('deletePet');
      expect(toolNames).toContain('placeOrder');
      expect(toolNames).toContain('getInventory');
      expect(toolNames).toContain('createUser');

      // 3. Test callTool - Get store inventory (simple GET request)
      console.log('\n📦 Testing callTool() getInventory via MCP SDK OpenAPI Stdio client...');
      const inventoryResult = await stdioClient.callTool({
        name: "getInventory",
        arguments: {}
      });

      expect(inventoryResult.content).toBeDefined();
      expect(Array.isArray(inventoryResult.content)).toBe(true);
      
      // Try to parse the actual response data like we do in Express tests
      try {
        const inventoryData = JSON.parse((inventoryResult.content as any)[0].text);
        console.log('✅ Inventory result via Stdio:', typeof inventoryData === 'object' ? 'valid JSON response' : 'unexpected format');
      } catch (error) {
        console.log('✅ Inventory result received via Stdio (non-JSON):', (inventoryResult.content as any[]).length > 0 ? 'success' : 'empty');
      }

      console.log('\n🎉 OpenAPI Stdio MCP SDK Client test completed successfully!');
    }, 45000); // Longer timeout for process spawning
  });
});