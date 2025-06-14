import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { DiscoverOptions, EndpointDefinition, DiscoveryError, HTTPMethod } from '../../core/types';
import { SUPPORTED_FRAMEWORKS } from '../../core/constants';

interface FastifyRoute {
  method: string | string[];
  url: string;
  schema?: any;
  handler: any;
  preHandler?: any[];
  preValidation?: any[];
  preSerialization?: any[];
  onRequest?: any[];
  onResponse?: any[];
  onSend?: any[];
  onError?: any[];
  config?: any;
  constraints?: any;
}

export class FastifyDiscoverer extends BaseDiscoverer {
  constructor() {
    super('fastify-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    if (options.framework === SUPPORTED_FRAMEWORKS.FASTIFY) {
      return true;
    }

    if (options.app) {
      return this.isFastifyApp(options.app);
    }

    return false;
  }

  async discover(options: DiscoverOptions): Promise<EndpointDefinition[]> {
    this.validateOptions(options);

    if (!options.app) {
      throw new DiscoveryError('Fastify app instance is required for framework discovery');
    }

    try {
      this.log('info', 'Starting Fastify endpoint discovery');
      
      const routes = this.extractRoutes(options.app);
      const endpoints = this.convertRoutesToEndpoints(routes);
      
      this.log('info', `Discovered ${endpoints.length} endpoints from Fastify app`);
      
      return this.filterEndpoints(endpoints, options.include, options.exclude);
    } catch (error) {
      this.log('error', 'Failed to discover Fastify endpoints', { error });
      throw new DiscoveryError(
        `Fastify discovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if the given object is a Fastify app
   */
  private isFastifyApp(app: any): boolean {
    return (
      app &&
      typeof app === 'object' &&
      typeof app.get === 'function' &&
      typeof app.post === 'function' &&
      typeof app.listen === 'function' &&
      typeof app.register === 'function' &&
      (app.version !== undefined || app.pluginName !== undefined)
    );
  }

  /**
   * Extract routes from Fastify app
   */
  private extractRoutes(app: any): FastifyRoute[] {
    const routes: FastifyRoute[] = [];
    
    try {
      // Try to access routes through different Fastify internal properties
      if (app.printRoutes) {
        // Use Fastify's built-in route printing functionality
        const routesList = this.getRoutesFromPrintRoutes(app);
        routes.push(...routesList);
      } else if (app.hasRoute) {
        // Try to access internal route storage
        const routesList = this.getRoutesFromInternalStorage(app);
        routes.push(...routesList);
      } else {
        this.log('warn', 'Unable to access Fastify routes - may need to register routes first');
      }
    } catch (error) {
      this.log('warn', 'Failed to extract routes from Fastify app', { error });
    }

    return routes;
  }

  /**
   * Get routes using Fastify's printRoutes functionality
   */
  private getRoutesFromPrintRoutes(app: any): FastifyRoute[] {
    const routes: FastifyRoute[] = [];
    
    try {
      // Capture output from printRoutes
      let routesOutput = '';
      const originalLog = console.log;
      console.log = (str: string) => {
        routesOutput += str + '\n';
      };
      
      app.printRoutes();
      console.log = originalLog;
      
      // Parse the output to extract route information
      const routeLines = routesOutput.split('\n').filter(line => line.trim());
      
      for (const line of routeLines) {
        const routeMatch = line.match(/^(\w+)\s+(.+)$/);
        if (routeMatch) {
          const [, method, url] = routeMatch;
          routes.push({
            method: method,
            url: url,
            handler: () => {}, // Placeholder
          });
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to get routes from printRoutes', { error });
    }
    
    return routes;
  }

  /**
   * Get routes from Fastify's internal route storage
   */
  private getRoutesFromInternalStorage(app: any): FastifyRoute[] {
    const routes: FastifyRoute[] = [];
    
    try {
      // Access internal route tree or registry
      if (app[Symbol.for('fastify.routes')]) {
        const routeMap = app[Symbol.for('fastify.routes')];
        this.extractRoutesFromMap(routeMap, routes);
      } else if (app._router && app._router.routes) {
        // Some versions store routes differently
        for (const route of app._router.routes) {
          routes.push(route);
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to access internal route storage', { error });
    }
    
    return routes;
  }

  /**
   * Extract routes from Fastify route map
   */
  private extractRoutesFromMap(routeMap: any, routes: FastifyRoute[]): void {
    if (!routeMap || typeof routeMap !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(routeMap)) {
      if (value && typeof value === 'object') {
        if (this.isRouteDefinition(value)) {
          routes.push(value as FastifyRoute);
        } else {
          // Recursively search nested structures
          this.extractRoutesFromMap(value, routes);
        }
      }
    }
  }

  /**
   * Check if an object is a route definition
   */
  private isRouteDefinition(obj: any): boolean {
    return (
      obj &&
      typeof obj === 'object' &&
      (obj.method || obj.url || obj.handler)
    );
  }

  /**
   * Convert Fastify routes to endpoint definitions
   */
  private convertRoutesToEndpoints(routes: FastifyRoute[]): EndpointDefinition[] {
    const endpoints: EndpointDefinition[] = [];
    
    for (const route of routes) {
      try {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        
        for (const method of methods) {
          const endpoint = this.convertRouteToEndpoint(route, method);
          endpoints.push(endpoint);
        }
      } catch (error) {
        this.log('warn', `Failed to convert route to endpoint: ${route.method} ${route.url}`, { error });
      }
    }
    
    return endpoints;
  }

  /**
   * Convert a single Fastify route to an endpoint definition
   */
  private convertRouteToEndpoint(route: FastifyRoute, method: string): EndpointDefinition {
    const normalizedPath = this.normalizePath(route.url);
    
    // Extract information from Fastify schema if available
    const routeInfo = this.analyzeRouteSchema(route.schema);
    
    // Extract path parameters from URL pattern
    const pathParams = this.extractPathParameters(normalizedPath);
    
    // Build parameters from schema and path
    const parameters = [
      // Path parameters
      ...pathParams.map(param => ({
        name: param,
        type: 'string' as const,
        required: true,
        in: 'path' as const,
        description: `Path parameter: ${param}`,
      })),
      // Query parameters from schema
      ...routeInfo.queryParams,
      // Header parameters from schema
      ...routeInfo.headerParams,
    ];

    return this.createBaseEndpoint(method, normalizedPath, {
      description: routeInfo.description || `${method} ${normalizedPath}`,
      summary: routeInfo.summary,
      tags: routeInfo.tags,
      parameters,
      requestBody: routeInfo.requestBody,
      responses: routeInfo.responses || {
        '200': {
          description: 'Successful response',
          schema: routeInfo.responseSchema || { type: 'object' },
        },
        '400': {
          description: 'Bad request',
          schema: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          schema: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      metadata: {
        ...routeInfo.metadata,
        fastifyRoute: {
          originalUrl: route.url,
          method: method,
          hasSchema: !!route.schema,
          config: route.config,
          constraints: route.constraints,
        },
      },
    });
  }

  /**
   * Analyze Fastify route schema to extract information
   */
  private analyzeRouteSchema(schema: any): {
    description?: string;
    summary?: string;
    tags?: string[];
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>;
    headerParams: Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>;
    requestBody?: any;
    responses?: any;
    responseSchema?: any;
    metadata?: Record<string, any>;
  } {
    const result = {
      queryParams: [] as Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>,
      headerParams: [] as Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>,
      metadata: {} as Record<string, any>,
      tags: [] as string[],
    };

    if (!schema) {
      return result;
    }

    // Extract description and summary
    if (schema.description) {
      result.description = schema.description;
    }
    if (schema.summary) {
      result.summary = schema.summary;
    }
    if (schema.tags) {
      result.tags = Array.isArray(schema.tags) ? schema.tags : [schema.tags];
    }

    // Extract query parameters
    if (schema.querystring && schema.querystring.properties) {
      for (const [name, prop] of Object.entries(schema.querystring.properties)) {
        const propSchema = prop as any;
        result.queryParams.push({
          name,
          type: propSchema.type || 'string',
          required: schema.querystring.required?.includes(name) || false,
          description: propSchema.description,
          in: 'query',
        });
      }
    }

    // Extract header parameters
    if (schema.headers && schema.headers.properties) {
      for (const [name, prop] of Object.entries(schema.headers.properties)) {
        const propSchema = prop as any;
        result.headerParams.push({
          name,
          type: propSchema.type || 'string',
          required: schema.headers.required?.includes(name) || false,
          description: propSchema.description,
          in: 'header',
        });
      }
    }

    // Extract request body schema
    if (schema.body) {
      result.requestBody = {
        description: schema.body.description || 'Request body',
        required: true,
        content: {
          'application/json': {
            schema: schema.body,
          },
        },
      };
    }

    // Extract response schema
    if (schema.response) {
      result.responses = {};
      
      for (const [statusCode, responseSchema] of Object.entries(schema.response)) {
        result.responses[statusCode] = {
          description: (responseSchema as any).description || `Response for status ${statusCode}`,
          schema: responseSchema,
        };
      }
      
      // Set default response schema
      if (schema.response['200']) {
        result.responseSchema = schema.response['200'];
      }
    }

    return result;
  }
}