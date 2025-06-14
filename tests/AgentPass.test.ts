import { AgentPass } from '../src/core/AgentPass';
import { ExpressDiscoverer } from '../src/discovery/express/ExpressDiscoverer';
import express from 'express';

describe('AgentPass', () => {
  let agentpass: AgentPass;

  beforeEach(() => {
    agentpass = new AgentPass({
      name: 'test-api',
      version: '1.0.0',
      description: 'Test API',
    });
  });

  afterEach(() => {
    agentpass.reset();
  });

  describe('Configuration', () => {
    it('should initialize with provided config', () => {
      const config = agentpass.getConfig();
      expect(config.name).toBe('test-api');
      expect(config.version).toBe('1.0.0');
      expect(config.description).toBe('Test API');
    });

    it('should return stats', () => {
      const stats = agentpass.getStats();
      expect(stats.endpoints).toBe(0);
      expect(stats.discoverers).toBeGreaterThan(0);
      expect(stats.plugins).toBe(0);
    });
  });

  describe('Manual Endpoint Definition', () => {
    it('should allow manual endpoint definition', () => {
      const endpoint = {
        id: 'test-endpoint',
        method: 'GET' as const,
        path: '/test',
        description: 'Test endpoint',
        tags: [],
        parameters: [],
        responses: {},
        metadata: {},
      };

      agentpass.defineEndpoint(endpoint);
      
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0]).toMatchObject(endpoint);
    });

    it('should generate ID if not provided', () => {
      const endpoint = {
        method: 'GET' as const,
        path: '/test',
        description: 'Test endpoint',
        tags: [],
        parameters: [],
        responses: {},
        metadata: {},
      } as any;

      agentpass.defineEndpoint(endpoint);
      
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0]?.id).toBeDefined();
      expect(typeof endpoints[0]?.id).toBe('string');
    });
  });

  describe('Middleware', () => {
    it('should allow adding middleware', () => {
      const authMiddleware = jest.fn();
      agentpass.use('auth', authMiddleware);

      const middleware = agentpass.getMiddleware();
      expect(middleware.auth).toContain(authMiddleware);
    });

    it('should allow adding multiple middleware', () => {
      const auth1 = jest.fn();
      const auth2 = jest.fn();
      
      agentpass.use('auth', auth1);
      agentpass.use('auth', auth2);

      const middleware = agentpass.getMiddleware();
      expect(middleware.auth).toEqual([auth1, auth2]);
    });
  });

  describe('Transformers', () => {
    it('should allow adding endpoint transformers', () => {
      const transformer = jest.fn((endpoint) => ({
        ...endpoint,
        description: 'Transformed',
      }));

      agentpass.transform(transformer);
      
      const endpoint = {
        id: 'test',
        method: 'GET' as const,
        path: '/test',
        description: 'Original',
        tags: [],
        parameters: [],
        responses: {},
        metadata: {},
      };

      agentpass.defineEndpoint(endpoint);
      // Note: transformers are applied during discovery, not manual definition
    });
  });

  describe('Plugins', () => {
    it('should allow registering plugins', () => {
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0',
      };

      agentpass.plugin('test', plugin);
      
      const plugins = agentpass.getPlugins();
      expect(plugins).toContain(plugin);
    });

    it('should apply plugin middleware', () => {
      const authMiddleware = jest.fn();
      const plugin = {
        name: 'test-plugin',
        middleware: {
          auth: [authMiddleware],
        },
      };

      agentpass.plugin('test', plugin);
      
      const middleware = agentpass.getMiddleware();
      expect(middleware.auth).toContain(authMiddleware);
    });
  });

  describe('Reset', () => {
    it('should clear all data when reset', () => {
      // Add some data
      agentpass.defineEndpoint({
        id: 'test',
        method: 'GET' as const,
        path: '/test',
        tags: [],
        parameters: [],
        responses: {},
        metadata: {},
      });
      
      agentpass.use('auth', jest.fn());
      agentpass.transform(jest.fn());

      // Reset
      agentpass.reset();

      // Verify everything is cleared
      expect(agentpass.getEndpoints()).toHaveLength(0);
      expect(Object.keys(agentpass.getMiddleware())).toHaveLength(0);
      expect(agentpass.getStats().endpoints).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when generating MCP without endpoints', async () => {
      await expect(agentpass.generateMCPServer()).rejects.toThrow('No endpoints discovered');
    });
  });
});