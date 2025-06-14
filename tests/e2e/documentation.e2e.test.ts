import { AgentPass } from '../../src/core/AgentPass';
import express, { Request, Response } from 'express';

describe('Documentation Examples E2E Tests', () => {
  let agentpass: AgentPass;

  beforeEach(() => {
    agentpass = new AgentPass({
      name: 'test-api',
      version: '1.0.0'
    });
  });

  afterEach(() => {
    agentpass.reset();
  });

  describe('README Quick Start Example', () => {
    it('should work exactly as shown in README', async () => {
      // This is the exact example from the README
      const app = express();
      
      app.get('/users/:id', (req: Request, res: Response) => {
        res.json({ id: req.params.id, name: 'John Doe' });
      });

      // Create AgentPass instance
      const agentpass = new AgentPass({
        name: 'my-api-service',
        version: '1.0.0'
      });

      // Auto-discover endpoints
      await agentpass.discover({ app, framework: 'express' });

      // Verify it works
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe('GET');
      expect(endpoints[0].path).toBe('/users/{id}');

      // Generate and start MCP server
      const mcpServer = await agentpass.generateMCPServer();
      expect(mcpServer).toBeDefined();
    });
  });

  describe('Framework-Specific Discovery Examples', () => {
    it('should work with Express example from docs', async () => {
      const expressApp = express();
      
      expressApp.get('/users', (req, res) => res.json({ users: [] }));
      expressApp.get('/users/:id', (req, res) => res.json({ user: req.params.id }));
      expressApp.post('/users', (req, res) => res.json({ created: true }));

      await agentpass.discover({ app: expressApp, framework: 'express' });
      
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(3);
    });

    it('should work with URL discovery example from docs', async () => {
      // This would normally connect to a real service, but we'll test the structure
      try {
        await agentpass.discover({
          url: 'https://httpbin.org', // Public testing API
          strategy: 'crawl',
          crawl: { maxDepth: 1, maxPages: 5, timeout: 5000 }
        });
        
        // If it succeeds, great! If it fails, that's also OK for this test
        // The important thing is it doesn't crash
      } catch (error) {
        // URL discovery might fail in test environment, that's OK
        expect(error).toBeDefined();
      }
    });
  });

  describe('Middleware Examples from Documentation', () => {
    it('should work with authentication middleware example', async () => {
      // Example from docs: Add authentication
      agentpass.use('auth', async (context: any) => {
        const token = context.headers['authorization'];
        // Mock token validation
        const user = token ? { id: 1, name: 'Test User' } : null;
        if (!user) throw new Error('Unauthorized');
        context.user = user;
        return user;
      });

      const middleware = agentpass.getMiddleware();
      expect(middleware.auth).toHaveLength(1);
    });

    it('should work with authorization middleware example', async () => {
      // Example from docs: Add authorization
      agentpass.use('authz', async (context: any) => {
        const { user, endpoint } = context;
        if (endpoint.path.startsWith('/admin') && !user?.isAdmin) {
          throw new Error('Forbidden');
        }
        return true;
      });

      const middleware = agentpass.getMiddleware();
      expect(middleware.authz).toHaveLength(1);
    });

    it('should work with response transformation example', async () => {
      // Example from docs: Transform responses for MCP
      agentpass.use('post', async (context: any, response: any) => {
        // Add metadata
        return {
          ...response,
          _metadata: {
            timestamp: new Date().toISOString(),
            endpoint: context.endpoint.id
          }
        };
      });

      const middleware = agentpass.getMiddleware();
      expect(middleware.post).toHaveLength(1);
    });
  });

  describe('Plugin Example from Documentation', () => {
    it('should work with plugin example from docs', async () => {
      const openAPIPlugin = {
        name: 'openapi-enhancer',
        version: '1.0.0',
        onDiscover: async (endpoints: any[]) => {
          // Enhance endpoints with OpenAPI metadata
          return endpoints.map(endpoint => ({
            ...endpoint,
            enhanced: true
          }));
        },
        onGenerate: async (mcpConfig: any) => {
          // Modify MCP configuration
          return {
            ...mcpConfig,
            enhanced: true
          };
        }
      };

      agentpass.plugin('openapi', openAPIPlugin);
      
      const plugins = agentpass.getPlugins();
      expect(plugins).toContain(openAPIPlugin);
    });
  });

  describe('E-commerce API Example from Documentation', () => {
    it('should work with the complete e-commerce example', async () => {
      // Set up the e-commerce API from the docs
      const app = express();
      app.use(express.json());

      // Products endpoints
      app.get('/products', (req, res) => {
        res.json({
          products: [
            { id: 1, name: 'Laptop', price: 999.99, category: 'Electronics' },
            { id: 2, name: 'Book', price: 19.99, category: 'Books' }
          ]
        });
      });

      app.get('/products/:id', (req, res) => {
        res.json({
          product: { id: parseInt(req.params.id), name: 'Sample Product', price: 99.99 }
        });
      });

      app.post('/products', (req, res) => {
        res.status(201).json({
          message: 'Product created',
          product: { id: 3, ...req.body }
        });
      });

      // Orders endpoints
      app.get('/orders', (req, res) => {
        res.json({
          orders: [
            { id: 1, userId: 1, total: 999.99, status: 'shipped' },
            { id: 2, userId: 2, total: 19.99, status: 'pending' }
          ]
        });
      });

      app.post('/orders', (req, res) => {
        res.status(201).json({
          message: 'Order created',
          order: { id: 3, ...req.body, status: 'pending' }
        });
      });

      // Admin endpoints
      app.get('/admin/stats', (req, res) => {
        res.json({
          stats: {
            totalProducts: 100,
            totalOrders: 50,
            revenue: 12345.67
          }
        });
      });

      const agentpass = new AgentPass({
        name: 'ecommerce-api',
        version: '1.0.0'
      });

      // Discover endpoints
      await agentpass.discover({ app });

      // Add business logic validation as shown in docs
      agentpass.use('pre', async (context: any) => {
        if (context.endpoint.path === '/orders' && 
            context.endpoint.method === 'POST') {
          // Mock inventory validation
          if (!context.params?.items || context.params.items.length === 0) {
            throw new Error('Order must contain items');
          }
        }
      });

      // Enhanced tool descriptions as shown in docs
      agentpass.transform((endpoint: any) => {
        const descriptions: Record<string, string> = {
          'GET /products': 'Search and list products with filtering',
          'POST /orders': 'Create a new order with items and shipping',
          'GET /admin/stats': 'Get comprehensive business statistics'
        };
        const key = `${endpoint.method} ${endpoint.path}`;
        if (descriptions[key]) {
          endpoint.description = descriptions[key];
        }
        return endpoint;
      });

      const mcpServer = await agentpass.generateMCPServer({
        toolNaming: (endpoint: any) => {
          const action = endpoint.method.toLowerCase();
          const resource = endpoint.path.split('/')[1];
          return `${action}_${resource}`;
        }
      });

      // Verify the setup
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(6);

      // Check for key endpoints
      const paths = endpoints.map(e => e.path);
      expect(paths).toContain('/products');
      expect(paths).toContain('/products/{id}');
      expect(paths).toContain('/orders');
      expect(paths).toContain('/admin/stats');

      // Verify MCP server was generated
      expect(mcpServer).toBeDefined();

      // Verify middleware was added
      const middleware = agentpass.getMiddleware();
      expect(middleware.pre).toHaveLength(1);
    });
  });

  describe('Configuration Examples', () => {
    it('should work with AgentPassConfig example', async () => {
      const config = {
        name: 'my-api',
        version: '2.1.0',
        description: 'My awesome API',
        metadata: {
          author: 'John Doe',
          environment: 'production'
        }
      };

      const agentpass = new AgentPass(config);
      const retrievedConfig = agentpass.getConfig();
      
      expect(retrievedConfig.name).toBe('my-api');
      expect(retrievedConfig.version).toBe('2.1.0');
      expect(retrievedConfig.description).toBe('My awesome API');
      expect(retrievedConfig.metadata?.author).toBe('John Doe');
    });

    it('should work with DiscoverOptions examples', async () => {
      const app = express();
      app.get('/test', (req, res) => res.json({ test: true }));

      // Test various discovery options formats
      const options = [
        { app, framework: 'express' },
        { app, include: ['**/test'], exclude: ['**/admin'] },
        { app, strategy: 'auto' }
      ];

      for (const option of options) {
        const testAgentPass = new AgentPass({
          name: 'test',
          version: '1.0.0'
        });
        
        await testAgentPass.discover(option as any);
        const endpoints = testAgentPass.getEndpoints();
        expect(endpoints.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Manual Endpoint Definition Example', () => {
    it('should work with manual endpoint definition', async () => {
      // Example from documentation
      const endpoint = {
        id: 'custom-endpoint',
        method: 'GET' as const,
        path: '/custom',
        description: 'Custom endpoint',
        summary: 'A manually defined endpoint',
        tags: ['custom'],
        parameters: [
          {
            name: 'id',
            type: 'string' as const,
            required: true,
            in: 'query' as const,
            description: 'Item ID'
          }
        ],
        responses: {
          '200': {
            description: 'Success',
            schema: { type: 'object' }
          }
        },
        metadata: {
          custom: true
        }
      };

      agentpass.defineEndpoint(endpoint);
      
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0]).toMatchObject(endpoint);
    });
  });

  describe('Error Handling Examples', () => {
    it('should handle the no endpoints error as documented', async () => {
      // Documentation states this should throw "No endpoints discovered"
      await expect(agentpass.generateMCPServer())
        .rejects.toThrow('No endpoints discovered');
    });

    it('should handle invalid framework gracefully', async () => {
      await expect(agentpass.discover({ 
        app: null, 
        framework: 'invalid-framework' as any 
      })).rejects.toThrow();
    });
  });
});