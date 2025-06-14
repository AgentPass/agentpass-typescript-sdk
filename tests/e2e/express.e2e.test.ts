import { AgentPass } from '../../src/core/AgentPass';
import express, { Request, Response } from 'express';
import { Server } from 'http';

describe('Express E2E Tests', () => {
  let app: express.Application;
  let server: Server;
  let agentpass: AgentPass;

  beforeEach(() => {
    app = express();
    agentpass = new AgentPass({
      name: 'express-test-api',
      version: '1.0.0',
      description: 'Express E2E Test API'
    });
  });

  afterEach((done) => {
    agentpass.reset();
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('Basic Express Discovery', () => {
    it('should discover simple GET route', async () => {
      // Setup Express app with a simple route
      app.get('/users', (req: Request, res: Response) => {
        res.json({ users: [] });
      });

      // Discover endpoints
      await agentpass.discover({ app, framework: 'express' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(1);
      
      const endpoint = endpoints[0]!;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.path).toBe('/users');
      expect(endpoint.description).toContain('GET /users');
    });

    it('should discover multiple HTTP methods', async () => {
      // Setup multiple routes
      app.get('/users', (req, res) => res.json({ users: [] }));
      app.post('/users', (req, res) => res.json({ message: 'User created' }));
      app.put('/users/:id', (req, res) => res.json({ message: 'User updated' }));
      app.delete('/users/:id', (req, res) => res.json({ message: 'User deleted' }));

      // Discover endpoints
      await agentpass.discover({ app, framework: 'express' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(4);
      
      const methods = endpoints.map(e => e.method).sort();
      expect(methods).toEqual(['DELETE', 'GET', 'POST', 'PUT']);
    });

    it('should discover routes with parameters', async () => {
      // Setup parameterized routes
      app.get('/users/:id', (req, res) => {
        res.json({ user: { id: req.params.id } });
      });
      
      app.get('/users/:userId/posts/:postId', (req, res) => {
        res.json({ 
          user: req.params.userId, 
          post: req.params.postId 
        });
      });

      // Discover endpoints
      await agentpass.discover({ app, framework: 'express' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(2);
      
      // Check parameter detection
      const userEndpoint = endpoints.find(e => e.path === '/users/{id}');
      expect(userEndpoint).toBeDefined();
      expect(userEndpoint?.parameters).toHaveLength(1);
      expect(userEndpoint?.parameters?.[0]?.name).toBe('id');
      expect(userEndpoint?.parameters?.[0]?.in).toBe('path');

      const userPostEndpoint = endpoints.find(e => e.path === '/users/{userId}/posts/{postId}');
      expect(userPostEndpoint).toBeDefined();
      expect(userPostEndpoint?.parameters).toHaveLength(2);
    });

    it('should discover nested routers', async () => {
      // Create nested router
      const userRouter = express.Router();
      userRouter.get('/', (req, res) => res.json({ users: [] }));
      userRouter.get('/:id', (req, res) => res.json({ user: req.params.id }));
      userRouter.post('/', (req, res) => res.json({ message: 'Created' }));

      const adminRouter = express.Router();
      adminRouter.get('/stats', (req, res) => res.json({ stats: {} }));
      adminRouter.delete('/users/:id', (req, res) => res.json({ deleted: true }));

      // Mount routers
      app.use('/users', userRouter);
      app.use('/admin', adminRouter);

      // Also add a root route
      app.get('/health', (req, res) => res.json({ status: 'ok' }));

      // Discover endpoints
      await agentpass.discover({ app, framework: 'express' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(5);

      // Check for nested routes
      const paths = endpoints.map(e => e.path).sort();
      expect(paths).toContain('/health');
      expect(paths).toContain('/users');
      expect(paths).toContain('/users/{id}');
      expect(paths).toContain('/admin/stats');
      expect(paths).toContain('/admin/users/{id}');
    });
  });

  describe('Express with Middleware Discovery', () => {
    it('should discover routes with middleware', async () => {
      // Add middleware
      const authMiddleware = (req: Request, res: Response, next: any) => {
        // Mock auth check
        next();
      };

      const logMiddleware = (req: Request, res: Response, next: any) => {
        console.log(`${req.method} ${req.path}`);
        next();
      };

      // Setup routes with middleware
      app.use(logMiddleware);
      app.get('/public', (req, res) => res.json({ message: 'Public' }));
      app.get('/protected', authMiddleware, (req, res) => res.json({ message: 'Protected' }));

      // Discover endpoints
      await agentpass.discover({ app, framework: 'express' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(2);
      
      const protectedEndpoint = endpoints.find(e => e.path === '/protected');
      expect(protectedEndpoint).toBeDefined();
      expect(protectedEndpoint?.metadata?.middleware).toBeDefined();
    });
  });

  describe('MCP Generation from Express', () => {
    it('should generate MCP server from discovered Express endpoints', async () => {
      // Setup comprehensive Express app
      app.use(express.json());

      // CRUD endpoints
      app.get('/users', (req, res) => {
        res.json({ 
          users: [
            { id: 1, name: 'John Doe', email: 'john@example.com' },
            { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
          ]
        });
      });

      app.get('/users/:id', (req, res) => {
        const userId = parseInt(req.params.id);
        res.json({ 
          user: { 
            id: userId, 
            name: userId === 1 ? 'John Doe' : 'Jane Smith',
            email: userId === 1 ? 'john@example.com' : 'jane@example.com'
          }
        });
      });

      app.post('/users', (req, res) => {
        res.status(201).json({ 
          message: 'User created',
          user: { id: 3, ...req.body }
        });
      });

      app.put('/users/:id', (req, res) => {
        res.json({ 
          message: 'User updated',
          user: { id: parseInt(req.params.id), ...req.body }
        });
      });

      app.delete('/users/:id', (req, res) => {
        res.json({ message: 'User deleted', id: req.params.id });
      });

      // Discover endpoints
      await agentpass.discover({ app, framework: 'express' });

      // Generate MCP server
      const mcpServer = await agentpass.generateMCPServer({
        toolNaming: (endpoint) => {
          const method = endpoint.method.toLowerCase();
          const resource = endpoint.path.split('/')[1];
          return `${method}_${resource}`;
        }
      });

      // Verify MCP server was created
      expect(mcpServer).toBeDefined();
      
      // Verify endpoints were discovered
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(5);

      // Verify all CRUD operations are present
      const methods = endpoints.map(e => e.method);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('DELETE');
    });
  });

  describe('Express with Real Server', () => {
    it('should work with a running Express server', (done) => {
      // Setup Express app
      app.get('/ping', (req, res) => {
        res.json({ message: 'pong', timestamp: new Date().toISOString() });
      });

      app.get('/echo/:message', (req, res) => {
        res.json({ echo: req.params.message });
      });

      // Start server
      server = app.listen(0, async () => {
        try {
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : 3000;

          // Discover endpoints from running app
          await agentpass.discover({ app, framework: 'express' });

          // Test URL discovery as well
          const agentpass2 = new AgentPass({
            name: 'url-test',
            version: '1.0.0'
          });

          // This should work but may not find all endpoints due to crawling limitations
          // The important thing is that it doesn't crash
          try {
            await agentpass2.discover({
              url: `http://localhost:${port}`,
              strategy: 'crawl',
              crawl: { maxDepth: 1, maxPages: 5, timeout: 5000 }
            });
          } catch (error) {
            // URL discovery might fail, but that's ok for this test
            console.log('URL discovery failed (expected):', error);
          }

          // Verify main discovery worked
          const endpoints = agentpass.getEndpoints();
          expect(endpoints).toHaveLength(2);

          const pingEndpoint = endpoints.find(e => e.path === '/ping');
          expect(pingEndpoint).toBeDefined();
          expect(pingEndpoint?.method).toBe('GET');

          const echoEndpoint = endpoints.find(e => e.path === '/echo/{message}');
          expect(echoEndpoint).toBeDefined();
          expect(echoEndpoint?.method).toBe('GET');
          expect(echoEndpoint?.parameters).toHaveLength(1);

          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle discovery errors gracefully', async () => {
      // Try to discover from invalid app
      await expect(agentpass.discover({ 
        app: null, 
        framework: 'express' 
      })).rejects.toThrow();
    });

    it('should handle empty Express app', async () => {
      // Empty app should not crash
      await agentpass.discover({ app, framework: 'express' });
      
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(0);
    });
  });
});