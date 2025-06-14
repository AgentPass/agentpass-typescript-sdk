import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { DiscoverOptions, EndpointDefinition, DiscoveryError, HTTPMethod } from '../../core/types';
import { SUPPORTED_FRAMEWORKS } from '../../core/constants';

interface NestJSRoute {
  path: string;
  method: string;
  methodName: string;
  className: string;
  handler: any;
  metadata?: any;
  decorators?: any[];
  guards?: any[];
  interceptors?: any[];
  pipes?: any[];
  filters?: any[];
}

interface NestJSController {
  name: string;
  path: string;
  routes: NestJSRoute[];
  metadata?: any;
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
      
      const routes = await this.extractRoutes(options.app);
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
  private isNestJSApp(app: any): boolean {
    return (
      app &&
      typeof app === 'object' &&
      (app.constructor?.name === 'NestApplication' ||
       app.constructor?.name === 'NestExpressApplication' ||
       app.constructor?.name === 'NestFastifyApplication') &&
      typeof app.get === 'function' &&
      typeof app.listen === 'function' &&
      app.httpAdapter !== undefined
    );
  }

  /**
   * Extract routes from NestJS app
   */
  private async extractRoutes(app: any): Promise<NestJSRoute[]> {
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
  private hasRouteExplorer(app: any): boolean {
    try {
      return app.get && typeof app.get === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Get routes using NestJS route explorer
   */
  private async getRoutesFromExplorer(app: any): Promise<NestJSRoute[]> {
    const routes: NestJSRoute[] = [];
    
    try {
      // Try to get the router/routes explorer from the app
      const httpServer = app.getHttpServer();
      const router = httpServer._router;
      
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
  private getRoutesFromHttpAdapter(app: any): NestJSRoute[] {
    const routes: NestJSRoute[] = [];
    
    try {
      const httpAdapter = app.httpAdapter;
      
      if (httpAdapter && httpAdapter.getInstance) {
        const instance = httpAdapter.getInstance();
        
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
  private async getRoutesFromControllers(app: any): Promise<NestJSRoute[]> {
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
  private parseFastifyRoutes(fastifyInstance: any): NestJSRoute[] {
    const routes: NestJSRoute[] = [];
    
    try {
      // Capture printRoutes output
      let routesOutput = '';
      const originalLog = console.log;
      console.log = (str: string) => {
        routesOutput += str + '\n';
      };
      
      fastifyInstance.printRoutes();
      console.log = originalLog;
      
      // Parse the output
      const routeLines = routesOutput.split('\n').filter(line => line.trim());
      
      for (const line of routeLines) {
        const routeMatch = line.match(/^(\w+)\s+(.+)$/);
        if (routeMatch) {
          const [, method, path] = routeMatch;
          routes.push({
            path: path,
            method: method.toUpperCase(),
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
        ...routeInfo.queryParams,
        // Header parameters from decorators
        ...routeInfo.headerParams,
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
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>;
    headerParams: Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>;
    requestBody?: any;
    responses?: any;
    metadata?: Record<string, any>;
  } {
    const result = {
      queryParams: [] as Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>,
      headerParams: [] as Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>,
      metadata: {} as Record<string, any>,
      tags: [] as string[],
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
        result.description = route.metadata.description;
      }
      if (route.metadata.summary) {
        result.summary = route.metadata.summary;
      }
      if (route.metadata.tags) {
        result.tags.push(...route.metadata.tags);
      }
    }

    return result;
  }

  /**
   * Process NestJS decorators to extract metadata
   */
  private processDecorator(decorator: any, result: any): void {
    if (!decorator || !decorator.name) {
      return;
    }

    switch (decorator.name) {
      case 'ApiTags':
        if (decorator.args && decorator.args.length > 0) {
          result.tags.push(...decorator.args);
        }
        break;
        
      case 'ApiOperation':
        if (decorator.args && decorator.args[0]) {
          const operation = decorator.args[0];
          if (operation.summary) result.summary = operation.summary;
          if (operation.description) result.description = operation.description;
        }
        break;
        
      case 'ApiQuery':
        if (decorator.args && decorator.args[0]) {
          const query = decorator.args[0];
          result.queryParams.push({
            name: query.name,
            type: query.type || 'string',
            required: query.required || false,
            description: query.description,
            in: 'query',
          });
        }
        break;
        
      case 'ApiHeader':
        if (decorator.args && decorator.args[0]) {
          const header = decorator.args[0];
          result.headerParams.push({
            name: header.name,
            type: header.type || 'string',
            required: header.required || false,
            description: header.description,
            in: 'header',
          });
        }
        break;
        
      case 'ApiBody':
        if (decorator.args && decorator.args[0]) {
          const body = decorator.args[0];
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
        if (decorator.args && decorator.args[0]) {
          const response = decorator.args[0];
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