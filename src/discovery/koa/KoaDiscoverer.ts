import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { DiscoverOptions, EndpointDefinition, DiscoveryError, RequestBodyDefinition, ResponseDefinition } from '../../core/types';
import { SUPPORTED_FRAMEWORKS } from '../../core/constants';

interface KoaRoute {
  path: string;
  methods: string[];
  name?: string;
  middleware: ((...args: unknown[]) => unknown)[];
  paramNames: string[];
  regexp: RegExp;
}

interface KoaRouter {
  stack: KoaLayer[];
  opts: Record<string, unknown>;
  methods?: string[];
}

interface KoaLayer {
  path: string;
  methods: string[];
  middleware: ((...args: unknown[]) => unknown)[];
  name?: string;
  paramNames: string[];
  regexp: RegExp;
  stack?: ((...args: unknown[]) => unknown)[];
}

interface KoaApp {
  use: (...args: unknown[]) => unknown;
  middleware: ((...args: unknown[]) => unknown)[];
  listen: (...args: unknown[]) => unknown;
  context: unknown;
}

export class KoaDiscoverer extends BaseDiscoverer {
  constructor() {
    super('koa-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    if (options.framework === SUPPORTED_FRAMEWORKS.KOA) {
      return true;
    }

    if (options.app) {
      return this.isKoaApp(options.app);
    }

    return false;
  }

  async discover(options: DiscoverOptions): Promise<EndpointDefinition[]> {
    this.validateOptions(options);

    if (!options.app) {
      throw new DiscoveryError('Koa app instance is required for framework discovery');
    }

    try {
      this.log('info', 'Starting Koa endpoint discovery');
      
      const routes = this.extractRoutes(options.app as KoaApp);
      const endpoints = this.convertRoutesToEndpoints(routes);
      
      this.log('info', `Discovered ${endpoints.length} endpoints from Koa app`);
      
      return this.filterEndpoints(endpoints, options.include, options.exclude);
    } catch (error) {
      this.log('error', 'Failed to discover Koa endpoints', { error });
      throw new DiscoveryError(
        `Koa discovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if the given object is a Koa app
   */
  private isKoaApp(app: unknown): app is KoaApp {
    const koaApp = app as KoaApp;
    return (
      koaApp &&
      typeof koaApp === 'object' &&
      typeof koaApp.use === 'function' &&
      Array.isArray(koaApp.middleware) &&
      typeof koaApp.listen === 'function' &&
      koaApp.context !== undefined
    );
  }

  /**
   * Extract routes from Koa app
   */
  private extractRoutes(app: KoaApp): KoaRoute[] {
    const routes: KoaRoute[] = [];
    
    if (!app.middleware || !Array.isArray(app.middleware)) {
      this.log('warn', 'No middleware found in Koa app');
      return routes;
    }

    // Look for router middleware in the middleware stack
    for (const middleware of app.middleware) {
      if (this.isKoaRouter(middleware)) {
        this.extractRoutesFromRouter(middleware, routes);
      } else if (this.isKoaRouterLayer(middleware)) {
        // Handle @koa/router or other router implementations
        this.extractRoutesFromRouterLayer(middleware, routes);
      }
    }

    return routes;
  }

  /**
   * Check if middleware is a Koa router
   */
  private isKoaRouter(middleware: unknown): middleware is { router: KoaRouter } {
    const routerMiddleware = middleware as { router: KoaRouter };
    return (
      routerMiddleware &&
      routerMiddleware.router &&
      Array.isArray(routerMiddleware.router.stack)
    );
  }

  /**
   * Check if middleware is a router layer
   */
  private isKoaRouterLayer(middleware: unknown): middleware is KoaRouter {
    const routerLayer = middleware as KoaRouter;
    return (
      routerLayer &&
      Array.isArray(routerLayer.stack) &&
      (routerLayer as KoaRouter).methods !== undefined
    );
  }

  /**
   * Extract routes from koa-router middleware
   */
  private extractRoutesFromRouter(routerMiddleware: { router: KoaRouter }, routes: KoaRoute[]): void {
    const router = routerMiddleware.router;
    
    if (!router || !router.stack) {
      return;
    }

    for (const layer of router.stack) {
      this.extractRouteFromLayer(layer, routes);
    }
  }

  /**
   * Extract routes from router layer
   */
  private extractRoutesFromRouterLayer(routerLayer: KoaRouter, routes: KoaRoute[]): void {
    if (!routerLayer.stack) {
      return;
    }

    for (const layer of routerLayer.stack) {
      this.extractRouteFromLayer(layer, routes);
    }
  }

  /**
   * Extract route information from a router layer
   */
  private extractRouteFromLayer(layer: KoaLayer, routes: KoaRoute[]): void {
    if (!layer.path || !layer.methods) {
      return;
    }

    // Get HTTP methods for this layer
    const methods = layer.methods.filter((method: string) => method !== 'HEAD');
    
    if (methods.length === 0) {
      return;
    }

    const route: KoaRoute = {
      path: layer.path,
      methods,
      name: layer.name,
      middleware: layer.stack || [],
      paramNames: layer.paramNames || [],
      regexp: layer.regexp,
    };

    routes.push(route);
  }

  /**
   * Convert Koa routes to endpoint definitions
   */
  private convertRoutesToEndpoints(routes: KoaRoute[]): EndpointDefinition[] {
    const endpoints: EndpointDefinition[] = [];
    
    for (const route of routes) {
      for (const method of route.methods) {
        try {
          const endpoint = this.convertRouteToEndpoint(route, method);
          endpoints.push(endpoint);
        } catch (error) {
          this.log('warn', `Failed to convert route to endpoint: ${method} ${route.path}`, { error });
        }
      }
    }
    
    return endpoints;
  }

  /**
   * Convert a single Koa route to an endpoint definition
   */
  private convertRouteToEndpoint(route: KoaRoute, method: string): EndpointDefinition {
    const normalizedPath = this.normalizePath(route.path);
    
    // Analyze route middleware for additional information
    const routeInfo = this.analyzeRouteMiddleware(route.middleware);
    
    // Create parameters from paramNames and detected query params
    const pathParams = route.paramNames.map(param => ({
      name: param,
      type: 'string' as const,
      required: true,
      in: 'path' as const,
      description: `Path parameter: ${param}`,
    }));

    const queryParams = routeInfo.queryParams.map(param => ({
      name: param.name,
      type: param.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
      required: param.required || false,
      in: 'query' as const,
      description: param.description || `Query parameter: ${param.name}`,
    }));

    return this.createBaseEndpoint(method, normalizedPath, {
      description: routeInfo.description || route.name || `${method} ${normalizedPath}`,
      summary: routeInfo.summary,
      tags: routeInfo.tags,
      parameters: [...pathParams, ...queryParams],
      requestBody: routeInfo.requestBody as RequestBodyDefinition | undefined,
      responses: (routeInfo.responses || {
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
      }) as ResponseDefinition,
      metadata: {
        ...routeInfo.metadata,
        koaRoute: {
          originalPath: route.path,
          method: method,
          name: route.name,
          middlewareCount: route.middleware.length,
          paramNames: route.paramNames,
        },
      },
    });
  }

  /**
   * Analyze route middleware to extract metadata
   */
  private analyzeRouteMiddleware(middleware: ((...args: unknown[]) => unknown)[]): {
    description?: string;
    summary?: string;
    tags?: string[];
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string }>;
    requestBody?: unknown;
    responses?: unknown;
    metadata?: Record<string, unknown>;
  } {
    const result = {
      queryParams: [] as Array<{ name: string; type: string; required?: boolean; description?: string }>,
      tags: [] as string[],
      metadata: {} as Record<string, any>,
    };

    for (const mw of middleware) {
      if (mw && typeof mw === 'function') {
        const middlewareStr = mw.toString();
        
        // Extract patterns from middleware code
        this.extractQueryParamsFromMiddleware(middlewareStr, result.queryParams);
        this.extractTagsFromMiddleware(middlewareStr, result.tags);
      }
    }

    return result;
  }

  /**
   * Extract query parameters from middleware code
   */
  private extractQueryParamsFromMiddleware(
    middlewareStr: string,
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string }>
  ): void {
    // Look for ctx.query.paramName or ctx.request.query.paramName patterns
    const queryMatches = middlewareStr.match(/ctx\.(?:request\.)?query\.(\w+)/g);
    if (queryMatches) {
      for (const match of queryMatches) {
        const paramName = match.replace(/ctx\.(?:request\.)?query\./, '');
        if (!queryParams.some(p => p.name === paramName)) {
          queryParams.push({
            name: paramName,
            type: 'string',
            required: false,
          });
        }
      }
    }

    // Look for destructuring patterns: const { param } = ctx.query
    const destructureMatches = middlewareStr.match(/const\s*{\s*([^}]+)\s*}\s*=\s*ctx\.(?:request\.)?query/g);
    if (destructureMatches) {
      for (const match of destructureMatches) {
        const paramsMatch = match.match(/{\s*([^}]+)\s*}/);
        if (paramsMatch && paramsMatch[1]) {
          const params = paramsMatch[1].split(',').map(p => p.trim());
          for (const param of params) {
            const paramName = param.split(':')[0]?.trim();
            if (paramName && !queryParams.some(p => p.name === paramName)) {
              queryParams.push({
                name: paramName,
                type: 'string',
                required: false,
              });
            }
          }
        }
      }
    }
  }

  /**
   * Extract tags from middleware code or comments
   */
  private extractTagsFromMiddleware(middlewareStr: string, tags: string[]): void {
    // Look for @tag comments
    const tagMatches = middlewareStr.match(/@tag\s+(\w+)/g);
    if (tagMatches) {
      for (const match of tagMatches) {
        const tag = match.replace('@tag', '').trim();
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }

    // Look for route names that might indicate tags
    const nameMatches = middlewareStr.match(/\/\*\s*@name\s+(\w+)\s*\*\//g);
    if (nameMatches) {
      for (const match of nameMatches) {
        const name = match.replace(/\/\*\s*@name\s+|\s*\*\//g, '');
        if (!tags.includes(name)) {
          tags.push(name);
        }
      }
    }
  }
}