import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { DiscoverOptions, EndpointDefinition, DiscoveryError, HTTPMethod } from '../../core/types';
import { SUPPORTED_FRAMEWORKS } from '../../core/constants';

interface ExpressRoute {
  path: string;
  method: string;
  methods: Record<string, boolean>;
  stack: any[];
}

interface ExpressLayer {
  regexp: RegExp;
  route?: ExpressRoute;
  name: string;
  handle: any;
}

interface ExpressRouter {
  stack: ExpressLayer[];
}

export class ExpressDiscoverer extends BaseDiscoverer {
  constructor() {
    super('express-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    if (options.framework === SUPPORTED_FRAMEWORKS.EXPRESS) {
      return true;
    }

    if (options.app) {
      // Try to detect Express app
      return this.isExpressApp(options.app);
    }

    return false;
  }

  async discover(options: DiscoverOptions): Promise<EndpointDefinition[]> {
    this.validateOptions(options);

    if (!options.app) {
      throw new DiscoveryError('Express app instance is required for framework discovery');
    }

    try {
      this.log('info', 'Starting Express endpoint discovery');
      
      const routes = this.extractRoutes(options.app);
      const endpoints = this.convertRoutesToEndpoints(routes);
      
      this.log('info', `Discovered ${endpoints.length} endpoints from Express app`);
      
      return this.filterEndpoints(endpoints, options.include, options.exclude);
    } catch (error) {
      this.log('error', 'Failed to discover Express endpoints', { error });
      throw new DiscoveryError(
        `Express discovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if the given object is an Express app
   */
  private isExpressApp(app: any): boolean {
    return (
      app &&
      typeof app === 'object' &&
      typeof app.use === 'function' &&
      typeof app.get === 'function' &&
      typeof app.post === 'function' &&
      app._router &&
      Array.isArray(app._router.stack)
    );
  }

  /**
   * Extract routes from Express app
   */
  private extractRoutes(app: any): ExpressRoute[] {
    const routes: ExpressRoute[] = [];
    
    if (!app._router || !app._router.stack) {
      this.log('warn', 'No router or routes found in Express app');
      return routes;
    }

    this.extractRoutesFromStack(app._router.stack, '', routes);
    
    return routes;
  }

  /**
   * Recursively extract routes from Express router stack
   */
  private extractRoutesFromStack(stack: ExpressLayer[], basePath: string, routes: ExpressRoute[]): void {
    for (const layer of stack) {
      if (layer.route) {
        // Direct route
        const route = layer.route;
        const fullPath = this.combinePaths(basePath, route.path);
        
        // Extract HTTP methods
        const methods = Object.keys(route.methods || {}).filter(method => 
          route.methods[method] && method !== '_all'
        );
        
        for (const method of methods) {
          routes.push({
            path: fullPath,
            method: method.toUpperCase(),
            stack: route.stack || []
          });
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        // Nested router
        const nestedPath = this.extractPathFromRegex(layer.regexp);
        const fullNestedPath = this.combinePaths(basePath, nestedPath);
        
        this.extractRoutesFromStack(layer.handle.stack, fullNestedPath, routes);
      } else if (layer.name === 'app' && layer.handle && layer.handle._router) {
        // Sub-application
        const subPath = this.extractPathFromRegex(layer.regexp);
        const fullSubPath = this.combinePaths(basePath, subPath);
        
        this.extractRoutesFromStack(layer.handle._router.stack, fullSubPath, routes);
      }
    }
  }

  /**
   * Extract path from Express regex
   */
  private extractPathFromRegex(regexp: RegExp): string {
    const regexpStr = regexp.toString();
    
    // Handle common Express route patterns
    if (regexpStr.includes('^\\/')) {
      // Extract path from regex like /^\/api(?:\/(?=$))?$/i
      const match = regexpStr.match(/\^\\?\/(.*?)\(?[\\\$\)]/);
      if (match && match[1]) {
        let path = match[1]
          .replace(/\\\//g, '/') // Replace escaped slashes
          .replace(/\?\?\:/g, '') // Remove non-capturing groups
          .replace(/\$.*$/, '') // Remove end anchors
          .replace(/\(.*?\)/g, '') // Remove groups
          .replace(/\?\+\*/g, ''); // Remove quantifiers
        
        return '/' + path.replace(/^\/+|\/+$/g, ''); // Normalize slashes
      }
    }
    
    return '';
  }

  /**
   * Combine base path and sub path
   */
  private combinePaths(basePath: string, subPath: string): string {
    const base = basePath.replace(/\/+$/, '') || '';
    const sub = subPath.replace(/^\/+/, '') || '';
    
    if (!sub) return base || '/';
    if (!base) return '/' + sub;
    
    return base + '/' + sub;
  }

  /**
   * Convert Express routes to endpoint definitions
   */
  private convertRoutesToEndpoints(routes: ExpressRoute[]): EndpointDefinition[] {
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
   * Convert a single Express route to an endpoint definition
   */
  private convertRouteToEndpoint(route: ExpressRoute): EndpointDefinition {
    const normalizedPath = this.normalizePath(route.path);
    const pathParams = this.extractPathParameters(normalizedPath);
    
    // Analyze route handlers for additional information
    const routeInfo = this.analyzeRouteHandlers(route.stack);
    
    return this.createBaseEndpoint(route.method, normalizedPath, {
      description: routeInfo.description || `${route.method} ${normalizedPath}`,
      summary: routeInfo.summary,
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
        // Query parameters (if detected)
        ...routeInfo.queryParams.map(param => ({
          name: param.name,
          type: param.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
          required: param.required || false,
          in: 'query' as const,
          description: param.description || `Query parameter: ${param.name}`,
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
        expressRoute: {
          originalPath: route.path,
          method: route.method,
          handlerCount: route.stack.length,
        },
      },
    });
  }

  /**
   * Analyze route handlers to extract metadata
   */
  private analyzeRouteHandlers(stack: any[]): {
    description?: string;
    summary?: string;
    tags?: string[];
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string }>;
    requestBody?: any;
    responses?: any;
    metadata?: Record<string, any>;
  } {
    const result = {
      queryParams: [] as Array<{ name: string; type: string; required?: boolean; description?: string }>,
      tags: [] as string[],
      metadata: {} as Record<string, any>,
    };

    for (const layer of stack) {
      if (layer.handle) {
        // Try to extract information from handler function
        const handlerStr = layer.handle.toString();
        
        // Look for common patterns in handler code
        this.extractQueryParamsFromHandler(handlerStr, result.queryParams);
        this.extractTagsFromHandler(handlerStr, result.tags);
      }
    }

    return result;
  }

  /**
   * Extract query parameters from handler code
   */
  private extractQueryParamsFromHandler(
    handlerStr: string,
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string }>
  ): void {
    // Look for req.query.paramName patterns
    const queryMatches = handlerStr.match(/req\.query\.(\w+)/g);
    if (queryMatches) {
      for (const match of queryMatches) {
        const paramName = match.replace('req.query.', '');
        if (!queryParams.some(p => p.name === paramName)) {
          queryParams.push({
            name: paramName,
            type: 'string',
            required: false,
          });
        }
      }
    }
  }

  /**
   * Extract tags from handler code or comments
   */
  private extractTagsFromHandler(handlerStr: string, tags: string[]): void {
    // Look for @tag comments
    const tagMatches = handlerStr.match(/@tag\s+(\w+)/g);
    if (tagMatches) {
      for (const match of tagMatches) {
        const tag = match.replace('@tag', '').trim();
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }
}