import {
  AgentPassConfig,
  DiscoverOptions,
  EndpointDefinition,
  MiddlewareConfig,
  EndpointTransformer,
  MCPOptions,
  MCPServer,
  Plugin,
  DiscoveryError,
  MCPError,
} from './types';
import { EventEmitter } from './EventEmitter';
import { BaseDiscoverer } from '../discovery/base/BaseDiscoverer';
import { ExpressDiscoverer } from '../discovery/express/ExpressDiscoverer';
import { OpenAPIDiscoverer } from '../discovery/openapi/OpenAPIDiscoverer';
import { KoaDiscoverer } from '../discovery/koa/KoaDiscoverer';
import { FastifyDiscoverer } from '../discovery/fastify/FastifyDiscoverer';
import { NestJSDiscoverer } from '../discovery/nestjs/NestJSDiscoverer';
import { NextJSDiscoverer } from '../discovery/nextjs/NextJSDiscoverer';
import { MCPGenerator } from '../mcp/MCPGenerator';
import { EVENT_TYPES, SUPPORTED_FRAMEWORKS } from './constants';
const uuidv4 = (): string => 'mock-uuid-' + Math.random().toString(36).substr(2, 9);

export class AgentPass extends EventEmitter {
  private config: AgentPassConfig;
  private endpoints: Map<string, EndpointDefinition> = new Map();
  private discoverers: Map<string, BaseDiscoverer> = new Map();
  private middleware: MiddlewareConfig = {};
  private transformers: EndpointTransformer[] = [];
  private plugins: Map<string, Plugin> = new Map();
  private mcpGenerator: MCPGenerator;

  constructor(config: AgentPassConfig) {
    super();
    this.config = { ...config };
    this.mcpGenerator = new MCPGenerator(this);
    this.initializeDefaultDiscoverers();
  }

  static async create(config: AgentPassConfig): Promise<AgentPass> {
    const instance = new AgentPass(config);
    
    // Auto-discover if framework is provided with appropriate source
    if (config.framework && (config.app || config.openapi)) {
      await instance.discover({
        app: config.app,
        framework: config.framework,
        openapi: config.openapi,
        baseUrl: config.baseUrl
      });
    }
    
    return instance;
  }

  private initializeDefaultDiscoverers(): void {
    this.discoverers.set(SUPPORTED_FRAMEWORKS.EXPRESS, new ExpressDiscoverer());
    this.discoverers.set(SUPPORTED_FRAMEWORKS.FASTIFY, new FastifyDiscoverer());
    this.discoverers.set(SUPPORTED_FRAMEWORKS.KOA, new KoaDiscoverer());
    this.discoverers.set(SUPPORTED_FRAMEWORKS.NESTJS, new NestJSDiscoverer());
    this.discoverers.set(SUPPORTED_FRAMEWORKS.NEXTJS, new NextJSDiscoverer());
    this.discoverers.set(SUPPORTED_FRAMEWORKS.OPENAPI, new OpenAPIDiscoverer());
  }

  getConfig(): AgentPassConfig {
    return { ...this.config };
  }

  getEndpoints(): EndpointDefinition[] {
    return Array.from(this.endpoints.values());
  }

  getEndpoint(id: string): EndpointDefinition | undefined {
    return this.endpoints.get(id);
  }

  async discover(options: DiscoverOptions): Promise<void> {
    this.emit(EVENT_TYPES.DISCOVERY_START, {
      type: EVENT_TYPES.DISCOVERY_START,
      timestamp: new Date(),
      data: { options },
    });

    try {
      const discoverer = this.selectDiscoverer(options);
      if (!discoverer) {
        throw new DiscoveryError(`No discoverer found for options: ${JSON.stringify(options)}`);
      }

      const discoveredEndpoints = await discoverer.discover(options);
      
      const filteredEndpoints = this.filterEndpoints(discoveredEndpoints, options.include, options.exclude);
      
      const transformedEndpoints = this.applyTransformers(filteredEndpoints);
      
      for (const endpoint of transformedEndpoints) {
        this.endpoints.set(endpoint.id, endpoint);
        this.emit(EVENT_TYPES.DISCOVERY_ENDPOINT, {
          type: EVENT_TYPES.DISCOVERY_ENDPOINT,
          timestamp: new Date(),
          data: { endpoint },
        });
      }

      for (const plugin of this.plugins.values()) {
        if (plugin.onDiscover) {
          await plugin.onDiscover(transformedEndpoints, this);
        }
      }

      this.emit(EVENT_TYPES.DISCOVERY_COMPLETE, {
        type: EVENT_TYPES.DISCOVERY_COMPLETE,
        timestamp: new Date(),
        data: { count: transformedEndpoints.length },
      });

    } catch (error) {
      const discoveryError = error instanceof DiscoveryError ? error : new DiscoveryError(
        `Discovery failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );

      this.emit(EVENT_TYPES.DISCOVERY_ERROR, {
        type: EVENT_TYPES.DISCOVERY_ERROR,
        timestamp: new Date(),
        data: { error: discoveryError },
      });

      throw discoveryError;
    }
  }

  defineEndpoint(endpoint: EndpointDefinition): void {
    if (!endpoint.id) {
      endpoint.id = this.generateEndpointId(endpoint.method, endpoint.path);
    }

    this.endpoints.set(endpoint.id, endpoint);
    
    this.emit(EVENT_TYPES.DISCOVERY_ENDPOINT, {
      type: EVENT_TYPES.DISCOVERY_ENDPOINT,
      timestamp: new Date(),
      data: { endpoint },
    });
  }

  use(phase: keyof MiddlewareConfig, middleware: unknown): void {
    if (!this.middleware[phase]) {
      this.middleware[phase] = [];
    }
    (this.middleware[phase] as unknown[])?.push(middleware);
  }

  transform(transformer: EndpointTransformer): void {
    this.transformers.push(transformer);
  }

  plugin(name: string, plugin: Plugin): void {
    this.plugins.set(name, plugin);
    
    if (plugin.middleware) {
      const entries = Object.entries(plugin.middleware) as Array<[keyof MiddlewareConfig, unknown[]]>;
      entries.forEach(([phase, middlewares]) => {
        if (middlewares && Array.isArray(middlewares)) {
          middlewares.forEach((middleware) => {
            // Type assertion is safe here because we know the middleware structure from the plugin
            this.use(phase, middleware as never);
          });
        }
      });
    }
    
    if (plugin.transformers) {
      plugin.transformers.forEach(transformer => {
        this.transform(transformer);
      });
    }
  }

  async generateMCPServer(options: MCPOptions = {}): Promise<MCPServer> {
    try {
      if (this.endpoints.size === 0) {
        throw new MCPError('No endpoints discovered. Run discover() first.');
      }

      for (const plugin of this.plugins.values()) {
        if (plugin.onGenerate) {
          await plugin.onGenerate(options, this);
        }
      }

      const mcpServer = await this.mcpGenerator.generate(this.getEndpoints(), options);
      
      this.emit(EVENT_TYPES.MCP_START, {
        type: EVENT_TYPES.MCP_START,
        timestamp: new Date(),
        data: { endpoints: this.endpoints.size },
      });

      return mcpServer;
    } catch (error) {
      const mcpError = error instanceof MCPError ? error : new MCPError(
        `MCP generation failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );

      this.emit(EVENT_TYPES.MCP_ERROR, {
        type: EVENT_TYPES.MCP_ERROR,
        timestamp: new Date(),
        data: { error: mcpError },
      });

      throw mcpError;
    }
  }

  getMiddleware(): MiddlewareConfig {
    return { ...this.middleware };
  }

  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  registerDiscoverer(name: string, discoverer: BaseDiscoverer): void {
    this.discoverers.set(name, discoverer);
  }

  /**
   * Select the appropriate discoverer for the given options
   */
  private selectDiscoverer(options: DiscoverOptions): BaseDiscoverer | null {
    // Check for explicit strategy
    if (options.strategy) {
      const discoverer = this.discoverers.get(options.strategy);
      if (discoverer && discoverer.supports(options)) {
        return discoverer;
      }
    }

    // Check for framework-specific discoverer
    if (options.framework) {
      const discoverer = this.discoverers.get(options.framework);
      if (discoverer && discoverer.supports(options)) {
        return discoverer;
      }
    }

    // Check for OpenAPI spec
    if (options.openapi) {
      const discoverer = this.discoverers.get('openapi');
      if (discoverer && discoverer.supports(options)) {
        return discoverer;
      }
    }

    // Auto-detect based on app instance
    if (options.app) {
      for (const [, discoverer] of this.discoverers) {
        if (discoverer.supports(options)) {
          return discoverer;
        }
      }
    }

    return null;
  }

  /**
   * Filter endpoints based on include/exclude patterns
   */
  private filterEndpoints(
    endpoints: EndpointDefinition[],
    include?: string[],
    exclude?: string[]
  ): EndpointDefinition[] {
    let filtered = endpoints;

    if (include && include.length > 0) {
      filtered = filtered.filter(endpoint => {
        return include.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(endpoint.path) || regex.test(`${endpoint.method} ${endpoint.path}`);
        });
      });
    }

    if (exclude && exclude.length > 0) {
      filtered = filtered.filter(endpoint => {
        return !exclude.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(endpoint.path) || regex.test(`${endpoint.method} ${endpoint.path}`);
        });
      });
    }

    return filtered;
  }

  /**
   * Apply all registered transformers to endpoints
   */
  private applyTransformers(endpoints: EndpointDefinition[]): EndpointDefinition[] {
    return endpoints.map(endpoint => {
      return this.transformers.reduce((acc, transformer) => {
        return transformer(acc);
      }, endpoint);
    });
  }

  /**
   * Generate a unique endpoint ID
   */
  private generateEndpointId(method: string, path: string): string {
    const normalized = `${method.toUpperCase()}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return `${normalized}_${uuidv4().substring(0, 8)}`;
  }

  getStats(): {
    endpoints: number;
    discoverers: number;
    plugins: number;
    middlewarePhases: number;
  } {
    return {
      endpoints: this.endpoints.size,
      discoverers: this.discoverers.size,
      plugins: this.plugins.size,
      middlewarePhases: Object.keys(this.middleware).length,
    };
  }

  reset(): void {
    this.endpoints.clear();
    this.middleware = {};
    this.transformers = [];
    this.removeAllListeners();
  }
}