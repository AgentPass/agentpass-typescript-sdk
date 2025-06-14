import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { DiscoverOptions, EndpointDefinition, DiscoveryError, HTTPMethod, RequestBodyDefinition, ResponseDefinition } from '../../core/types';
import { SUPPORTED_FRAMEWORKS } from '../../core/constants';

interface NestJSRoute {
  path: string;
  method: string;
  methodName: string;
  className: string;
  handler: Function;
  metadata?: Record<string, unknown>;
  decorators?: unknown[];
  guards?: unknown[];
  interceptors?: unknown[];
  pipes?: unknown[];
  filters?: unknown[];
}

interface NestJSController {
  name: string;
  path: string;
  routes: NestJSRoute[];
  metadata?: Record<string, unknown>;
}

interface NestJSApp {
  get: Function;
  listen: Function;
  httpAdapter: unknown;
  getHttpServer?: () => unknown;
  constructor?: { name: string };
}

namespace Express {
  interface Route {
    path: string;
    methods: Record<string, boolean>;
    stack: unknown[];
  }
}

interface FastifyInstance {
  printRoutes?: Function;
}

export class NestJSDiscoverer extends BaseDiscoverer {
  constructor() {
    super('nestjs-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    if (options.framework === SUPPORTED_FRAMEWORKS.NESTJS) {
      return true;
    }

    if (options.app) {
      return this.isNestJSApp(options.app);
    }

    return false;
  }

  async discover(options: DiscoverOptions): Promise<EndpointDefinition[]> {
    this.validateOptions(options);

    if (!options.app) {
      throw new DiscoveryError('NestJS app instance is required for framework discovery');
    }

    try {
      this.log('info', 'Starting NestJS endpoint discovery');
      
      const routes = await this.extractRoutes(options.app as NestJSApp);
      const endpoints = this.convertRoutesToEndpoints(routes);
      
      this.log('info', `Discovered ${endpoints.length} endpoints from NestJS app`);
      
      return this.filterEndpoints(endpoints, options.include, options.exclude);
    } catch (error) {
      this.log('error', 'Failed to discover NestJS endpoints', { error });
      throw new DiscoveryError(
        `NestJS discovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if the given object is a NestJS app
   */
  private isNestJSApp(app: unknown): app is NestJSApp {
    const nestApp = app as NestJSApp;
    return (
      nestApp &&
      typeof nestApp === 'object' &&
      (nestApp.constructor?.name === 'NestApplication' ||
       nestApp.constructor?.name === 'NestExpressApplication' ||
       nestApp.constructor?.name === 'NestFastifyApplication') &&
      typeof nestApp.get === 'function' &&
      typeof nestApp.listen === 'function' &&
      nestApp.httpAdapter !== undefined
    );
  }

  /**
   * Extract routes from NestJS app
   */
  private async extractRoutes(app: NestJSApp): Promise<NestJSRoute[]> {
    const routes: NestJSRoute[] = [];
    
    try {
      // Method 1: Use NestJS internal route explorer
      if (this.hasRouteExplorer(app)) {
        const explorerRoutes = await this.getRoutesFromExplorer(app);
        routes.push(...explorerRoutes);
      }
      
      // Method 2: Access HTTP adapter routes
      if (app.httpAdapter && routes.length === 0) {
        const adapterRoutes = this.getRoutesFromHttpAdapter(app);
        routes.push(...adapterRoutes);
      }
      
      // Method 3: Analyze controllers directly
      if (routes.length === 0) {
        const controllerRoutes = await this.getRoutesFromControllers(app);
        routes.push(...controllerRoutes);
      }
      
    } catch (error) {
      this.log('warn', 'Failed to extract routes from NestJS app', { error });
    }

    return routes;
  }

  /**
   * Check if app has route explorer functionality
   */
  private hasRouteExplorer(app: NestJSApp): boolean {
    try {
      return app.get && typeof app.get === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Get routes using NestJS route explorer
   */
  private async getRoutesFromExplorer(app: NestJSApp): Promise<NestJSRoute[]> {
    const routes: NestJSRoute[] = [];
    
    try {
      // Try to get the router/routes explorer from the app
      const httpServer = app.getHttpServer?.();
      const router = (httpServer as any)?._router;
      
      if (router && router.stack) {
        for (const layer of router.stack) {
          if (layer.route) {
            const route = this.parseExpressRoute(layer.route);
            if (route) {
              routes.push(route);
            }
          }
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to get routes from explorer', { error });
    }
    
    return routes;
  }

  /**
   * Get routes from HTTP adapter
   */
  private getRoutesFromHttpAdapter(app: NestJSApp): NestJSRoute[] {
    const routes: NestJSRoute[] = [];
    
    try {
      const httpAdapter = app.httpAdapter;
      
      if (httpAdapter && (httpAdapter as any).getInstance) {
        const instance = (httpAdapter as any).getInstance();
        
        // For Express adapter
        if (instance._router && instance._router.stack) {
          for (const layer of instance._router.stack) {
            if (layer.route) {
              const route = this.parseExpressRoute(layer.route);
              if (route) {
                routes.push(route);
              }
            }
          }
        }
        
        // For Fastify adapter
        if (instance.printRoutes) {
          const fastifyRoutes = this.parseFastifyRoutes(instance);
          routes.push(...fastifyRoutes);
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to get routes from HTTP adapter', { error });
    }
    
    return routes;
  }

  /**
   * Get routes by analyzing controllers
   */
  private async getRoutesFromControllers(app: NestJSApp): Promise<NestJSRoute[]> {
    const routes: NestJSRoute[] = [];
    
    try {
      // This would require access to NestJS metadata and reflection
      // In a real implementation, you'd use @nestjs/core utilities
      this.log('info', 'Controller analysis requires @nestjs/core reflection utilities');
      
      // Placeholder for controller analysis
      // const moduleRef = app.get(ModuleRef);
      // const discoveryService = app.get(DiscoveryService);
      // const controllers = discoveryService.getControllers();
      
    } catch (error) {
      this.log('warn', 'Failed to analyze controllers', { error });
    }
    
    return routes;
  }

  /**
   * Parse Express route (for NestJS with Express adapter)
   */
  private parseExpressRoute(route: any): NestJSRoute | null {
    if (!route.path || !route.methods) {
      return null;
    }

    const methods = Object.keys(route.methods).filter(method => 
      route.methods[method] && method !== '_all'
    );

    if (methods.length === 0) {
      return null;
    }

    // NestJS typically has one method per route
    const method = methods[0];
    if (!method) return null;

    return {
      path: route.path,
      method: method.toUpperCase(),
      methodName: 'unknown',
      className: 'unknown',
      handler: route.stack?.[0]?.handle,
      metadata: {
        source: 'express-adapter',
      },
    };
  }

  /**
   * Parse Fastify routes (for NestJS with Fastify adapter)
   */
  private parseFastifyRoutes(fastifyInstance: FastifyInstance): NestJSRoute[] {
    const routes: NestJSRoute[] = [];
    
    try {
      // Capture printRoutes output
      let routesOutput = '';
      const originalLog = console.log;
      console.log = (str: string) => {
        routesOutput += str + '\n';
      };
      
      (fastifyInstance as any).printRoutes?.();
      console.log = originalLog;
      
      // Parse the output
      const routeLines = routesOutput.split('\n').filter(line => line.trim());
      
      for (const line of routeLines) {
        const routeMatch = line.match(/^(\w+)\s+(.+)$/);
        if (routeMatch) {
          const [, method, path] = routeMatch;
          routes.push({
            path: path || '',
            method: method ? method.toUpperCase() : 'GET',
            methodName: 'unknown',
            className: 'unknown',
            handler: () => {},
            metadata: {
              source: 'fastify-adapter',
            },
          });
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to parse Fastify routes', { error });
    }
    
    return routes;
  }

  /**
   * Convert NestJS routes to endpoint definitions
   */
  private convertRoutesToEndpoints(routes: NestJSRoute[]): EndpointDefinition[] {
    const endpoints: EndpointDefinition[] = [];
    
    for (const route of routes) {
      try {
        const endpoint = this.convertRouteToEndpoint(route);
        endpoints.push(endpoint);
      } catch (error) {
        this.log('warn', `Failed to convert route to endpoint: ${route.method} ${route.path}`, { error });
      }
    }
    
    return endpoints;
  }

  /**
   * Convert a single NestJS route to an endpoint definition
   */
  private convertRouteToEndpoint(route: NestJSRoute): EndpointDefinition {
    const normalizedPath = this.normalizePath(route.path);
    
    // Extract path parameters
    const pathParams = this.extractPathParameters(normalizedPath);
    
    // Analyze route metadata for additional information
    const routeInfo = this.analyzeRouteMetadata(route);
    
    return this.createBaseEndpoint(route.method, normalizedPath, {
      description: routeInfo.description || `${route.method} ${normalizedPath}`,
      summary: routeInfo.summary || `${route.className}.${route.methodName}`,
      tags: routeInfo.tags,
      parameters: [
        // Path parameters
        ...pathParams.map(param => ({
          name: param,
          type: 'string' as const,
          required: true,
          in: 'path' as const,
          description: `Path parameter: ${param}`,
        })),
        // Query parameters from decorators
        ...routeInfo.queryParams.map(qp => ({
          ...qp,
          type: qp.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
          in: qp.in as 'query' | 'header'
        })),
        // Header parameters from decorators
        ...routeInfo.headerParams.map(hp => ({
          ...hp,
          type: hp.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
          in: hp.in as 'query' | 'header'
        })),
      ],
      requestBody: routeInfo.requestBody,
      responses: routeInfo.responses || {
        '200': {
          description: 'Successful response',
          schema: { type: 'object' },
        },
        '400': {
          description: 'Bad request',
          schema: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              message: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          schema: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              message: { type: 'string' },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          schema: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              message: { type: 'string' },
            },
          },
        },
      },
      metadata: {
        ...routeInfo.metadata,
        nestjsRoute: {
          originalPath: route.path,
          method: route.method,
          methodName: route.methodName,
          className: route.className,
          hasGuards: route.guards && route.guards.length > 0,
          hasInterceptors: route.interceptors && route.interceptors.length > 0,
          hasPipes: route.pipes && route.pipes.length > 0,
          hasFilters: route.filters && route.filters.length > 0,
        },
      },
    });
  }

  /**
   * Analyze route metadata and decorators
   */
  private analyzeRouteMetadata(route: NestJSRoute): {
    description?: string;
    summary?: string;
    tags?: string[];
    queryParams: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array'; required?: boolean; description?: string; in: string }>;
    headerParams: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array'; required?: boolean; description?: string; in: string }>;
    requestBody?: any;
    responses?: any;
    metadata?: Record<string, any>;
  } {
    const result = {
      queryParams: [] as Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array'; required?: boolean; description?: string; in: string }>,
      headerParams: [] as Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array'; required?: boolean; description?: string; in: string }>,
      metadata: {} as Record<string, any>,
      tags: [] as string[],
      description: undefined as string | undefined,
      summary: undefined as string | undefined,
      requestBody: undefined as any,
      responses: undefined as any,
    };

    // Extract information from decorators and metadata
    if (route.decorators) {
      for (const decorator of route.decorators) {
        this.processDecorator(decorator, result);
      }
    }

    // Add controller-based tags
    if (route.className && route.className !== 'unknown') {
      const tag = route.className.replace(/Controller$/, '').toLowerCase();
      if (!result.tags.includes(tag)) {
        result.tags.push(tag);
      }
    }

    // Extract from metadata
    if (route.metadata) {
      if (route.metadata.description) {
        result.description = route.metadata.description as string;
      }
      if (route.metadata.summary) {
        result.summary = route.metadata.summary as string;
      }
      if (route.metadata.tags) {
        result.tags?.push(...(route.metadata.tags as string[]));
      }
    }

    return result;
  }

  /**
   * Process NestJS decorators to extract metadata
   */
  private processDecorator(decorator: unknown, result: ReturnType<NestJSDiscoverer['analyzeRouteMetadata']>): void {
    const decoratorObj = decorator as { name?: string; args?: unknown[] };
    if (!decoratorObj || !decoratorObj.name) {
      return;
    }

    switch (decoratorObj.name) {
      case 'ApiTags':
        if (decoratorObj.args && decoratorObj.args.length > 0) {
          result.tags?.push(...(decoratorObj.args as string[]));
        }
        break;
        
      case 'ApiOperation':
        if (decoratorObj.args && decoratorObj.args[0]) {
          const operation = decoratorObj.args[0] as { summary?: string; description?: string };
          if (operation.summary) result.summary = operation.summary;
          if (operation.description) result.description = operation.description;
        }
        break;
        
      case 'ApiQuery':
        if (decoratorObj.args && decoratorObj.args[0]) {
          const query = decoratorObj.args[0] as { name: string; type?: string; required?: boolean; description?: string };
          result.queryParams.push({
            name: query.name,
            type: (query.type || 'string') as 'string' | 'number' | 'boolean' | 'object' | 'array',
            required: query.required || false,
            description: query.description,
            in: 'query' as const,
          });
        }
        break;
        
      case 'ApiHeader':
        if (decoratorObj.args && decoratorObj.args[0]) {
          const header = decoratorObj.args[0] as { name: string; type?: string; required?: boolean; description?: string };
          result.headerParams.push({
            name: header.name,
            type: (header.type || 'string') as 'string' | 'number' | 'boolean' | 'object' | 'array',
            required: header.required || false,
            description: header.description,
            in: 'header' as const,
          });
        }
        break;
        
      case 'ApiBody':
        if (decoratorObj.args && decoratorObj.args[0]) {
          const body = decoratorObj.args[0] as { description?: string; type?: { name: string } };
          result.requestBody = {
            description: body.description || 'Request body',
            required: true,
            content: {
              'application/json': {
                schema: body.type ? { $ref: `#/components/schemas/${body.type.name}` } : { type: 'object' },
              },
            },
          };
        }
        break;
        
      case 'ApiResponse':
        if (decoratorObj.args && decoratorObj.args[0]) {
          const response = decoratorObj.args[0] as { status?: string; description?: string; type?: { name: string } };
          if (!result.responses) result.responses = {};
          result.responses[response.status || '200'] = {
            description: response.description || 'Response',
            schema: response.type ? { $ref: `#/components/schemas/${response.type.name}` } : { type: 'object' },
          };
        }
        break;
    }
  }
}