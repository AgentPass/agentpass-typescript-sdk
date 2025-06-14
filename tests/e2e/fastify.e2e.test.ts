import { AgentPass } from '../../src/core/AgentPass';
import Fastify, { FastifyInstance } from 'fastify';

describe('Fastify E2E Tests', () => {
  let app: FastifyInstance;
  let agentpass: AgentPass;

  beforeEach(() => {
    app = Fastify({ logger: false });
    agentpass = new AgentPass({
      name: 'fastify-test-api',
      version: '1.0.0',
      description: 'Fastify E2E Test API'
    });
  });

  afterEach(async () => {
    agentpass.reset();
    if (app) {
      await app.close();
    }
  });

  describe('Basic Fastify Discovery', () => {
    it('should discover simple GET route', async () => {
      // Setup Fastify app with a simple route
      app.get('/users', async (request, reply) => {
        return { users: [] };
      });

      // Register routes
      await app.ready();

      // Discover endpoints
      await agentpass.discover({ app, framework: 'fastify' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(1);
      
      const endpoint = endpoints[0];
      expect(endpoint?.method).toBe('GET');
      expect(endpoint?.path).toBe('/users');
    });

    it('should discover multiple HTTP methods', async () => {
      // Setup multiple routes
      app.get('/users', async () => ({ users: [] }));
      app.post('/users', async () => ({ message: 'User created' }));
      app.put('/users/:id', async () => ({ message: 'User updated' }));
      app.delete('/users/:id', async () => ({ message: 'User deleted' }));

      await app.ready();

      // Discover endpoints
      await agentpass.discover({ app, framework: 'fastify' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(4);
      
      const methods = endpoints.map(e => e.method).sort();
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('DELETE');
    });

    it('should discover routes with parameters', async () => {
      // Setup parameterized routes
      app.get('/users/:id', async (request) => {
        const { id } = request.params as { id: string };
        return { user: { id } };
      });
      
      app.get('/users/:userId/posts/:postId', async (request) => {
        const { userId, postId } = request.params as { userId: string; postId: string };
        return { user: userId, post: postId };
      });

      await app.ready();

      // Discover endpoints
      await agentpass.discover({ app, framework: 'fastify' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(2);
      
      // Check parameter detection
      const userEndpoint = endpoints.find(e => e.path.includes('users') && e.path.includes('{id}'));
      expect(userEndpoint).toBeDefined();
    });
  });

  describe('Fastify with JSON Schema', () => {
    it('should discover routes with schema validation', async () => {
      // Setup route with JSON schema
      const userSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          age: { type: 'number', minimum: 0 }
        },
        required: ['name', 'email']
      };

      const getUserSchema = {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100 },
            offset: { type: 'number', minimum: 0 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              users: {
                type: 'array',
                items: userSchema
              }
            }
          }
        }
      };

      const createUserSchema = {
        body: userSchema,
        response: {
          201: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              user: userSchema
            }
          }
        }
      };

      app.get('/users', { schema: getUserSchema }, async (request) => {
        const { limit = 10, offset = 0 } = request.query as any;
        return { 
          users: [
            { name: 'John Doe', email: 'john@example.com', age: 30 }
          ].slice(offset, offset + limit)
        };
      });

      app.post('/users', { schema: createUserSchema }, async (request) => {
        const user = request.body as any;
        return { 
          message: 'User created', 
          user: { id: 1, ...user }
        };
      });

      await app.ready();

      // Discover endpoints
      await agentpass.discover({ app, framework: 'fastify' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(2);

      // Check that schema information is captured
      const getUserEndpoint = endpoints.find(e => e.method === 'GET' && e.path === '/users');
      expect(getUserEndpoint).toBeDefined();
      expect(getUserEndpoint?.parameters?.length).toBeGreaterThanOrEqual(0);

      const createUserEndpoint = endpoints.find(e => e.method === 'POST' && e.path === '/users');
      expect(createUserEndpoint).toBeDefined();
      expect(createUserEndpoint?.requestBody).toBeDefined();
    });
  });

  describe('Fastify Plugins', () => {
    it('should discover routes in plugins', async () => {
      // Create a plugin
      async function userPlugin(fastify: FastifyInstance) {
        fastify.get('/users', async () => ({ users: [] }));
        fastify.get('/users/:id', async (request) => {
          const { id } = request.params as { id: string };
          return { user: { id } };
        });
        fastify.post('/users', async (request) => {
          return { message: 'User created', user: request.body };
        });
      }

      async function adminPlugin(fastify: FastifyInstance) {
        fastify.get('/admin/stats', async () => ({ stats: {} }));
        fastify.delete('/admin/users/:id', async (request) => {
          const { id } = request.params as { id: string };
          return { deleted: true, id };
        });
      }

      // Register plugins
      app.register(userPlugin);
      app.register(adminPlugin);

      // Add root route
      app.get('/health', async () => ({ status: 'ok' }));

      await app.ready();

      // Discover endpoints
      await agentpass.discover({ app, framework: 'fastify' });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(5);

      // Check for plugin routes
      const paths = endpoints.map(e => e.path);
      expect(paths).toContain('/health');
      expect(paths).toContain('/users');
      expect(paths.some(p => p.includes('admin'))).toBe(true);
    });
  });

  describe('MCP Generation from Fastify', () => {
    it('should generate MCP server from discovered Fastify endpoints', async () => {
      // Setup comprehensive Fastify app
      const userSchema = {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' }
        }
      };

      // CRUD endpoints with schemas
      app.get('/users', {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              limit: { type: 'number', default: 10 }
            }
          },
          response: {
            200: {
              type: 'object',
              properties: {
                users: { type: 'array', items: userSchema }
              }
            }
          }
        }
      }, async (request) => {
        return { 
          users: [
            { id: 1, name: 'John Doe', email: 'john@example.com' },
            { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
          ]
        };
      });

      app.get('/users/:id', {
        schema: {
          params: {
            type: 'object',
            properties: {
              id: { type: 'number' }
            }
          },
          response: {
            200: userSchema,
            404: {
              type: 'object',
              properties: {
                error: { type: 'string' }
              }
            }
          }
        }
      }, async (request) => {
        const { id } = request.params as { id: number };
        return { id, name: 'John Doe', email: 'john@example.com' };
      });

      app.post('/users', {
        schema: {
          body: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' }
            },
            required: ['name', 'email']
          },
          response: {
            201: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                user: userSchema
              }
            }
          }
        }
      }, async (request) => {
        const userData = request.body as any;
        return { 
          message: 'User created',
          user: { id: 3, ...userData }
        };
      });

      await app.ready();

      // Discover endpoints
      await agentpass.discover({ app, framework: 'fastify' });

      // Generate MCP server
      const mcpServer = await agentpass.generateMCPServer({
        toolNaming: (endpoint) => {
          const method = endpoint.method.toLowerCase();
          const pathParts = endpoint.path.split('/').filter(Boolean);
          return `${method}_${pathParts.join('_')}`;
        }
      });

      // Verify MCP server was created
      expect(mcpServer).toBeDefined();
      
      // Verify endpoints were discovered
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(3);

      // Verify schema information is preserved
      const getUsersEndpoint = endpoints.find(e => e.method === 'GET' && e.path === '/users');
      expect(getUsersEndpoint).toBeDefined();

      const createUserEndpoint = endpoints.find(e => e.method === 'POST' && e.path === '/users');
      expect(createUserEndpoint).toBeDefined();
      expect(createUserEndpoint?.requestBody).toBeDefined();
    });
  });

  describe('Fastify with Real Server', () => {
    it('should work with a running Fastify server', async () => {
      // Setup Fastify app
      app.get('/ping', async () => {
        return { message: 'pong', timestamp: new Date().toISOString() };
      });

      app.get('/echo/:message', async (request) => {
        const { message } = request.params as { message: string };
        return { echo: message };
      });

      // Start server
      await app.listen({ port: 0 });
      const address = app.server.address();
      const port = typeof address === 'object' && address ? address.port : 3000;

      // Discover endpoints from app instance
      await agentpass.discover({ app, framework: 'fastify' });

      // Verify discovery worked
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(2);

      const pingEndpoint = endpoints.find(e => e.path === '/ping');
      expect(pingEndpoint).toBeDefined();
      expect(pingEndpoint?.method).toBe('GET');

      const echoEndpoint = endpoints.find(e => e.path.includes('echo'));
      expect(echoEndpoint).toBeDefined();
      expect(echoEndpoint?.method).toBe('GET');
    });
  });

  describe('Error Handling', () => {
    it('should handle discovery errors gracefully', async () => {
      // Try to discover from invalid app
      await expect(agentpass.discover({ 
        app: null, 
        framework: 'fastify' 
      })).rejects.toThrow();
    });

    it('should handle empty Fastify app', async () => {
      await app.ready();
      
      // Empty app should not crash
      await agentpass.discover({ app, framework: 'fastify' });
      
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(0);
    });
  });
});