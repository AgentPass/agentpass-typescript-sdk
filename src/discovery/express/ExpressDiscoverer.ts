import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { DiscoverOptions, EndpointDefinition, DiscoveryError, RequestBodyDefinition, ResponseDefinition } from '../../core/types';
import { SUPPORTED_FRAMEWORKS } from '../../core/constants';

interface ExpressRoute {
  path: string;
  method: string;
  methods: Record<string, boolean>;
  stack: ExpressLayer[];
}

interface ExpressLayer {
  regexp: RegExp;
  route?: ExpressRoute;
  name: string;
  handle: ((...args: unknown[]) => unknown) | ExpressRouter;
}

interface ExpressRouter {
  stack: ExpressLayer[];
}

interface ExpressApplication {
  use: (...args: unknown[]) => unknown;
  get: (...args: unknown[]) => unknown;
  post: (...args: unknown[]) => unknown;
  _router: ExpressRouter;
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
      
      const routes = this.extractRoutes(options.app as ExpressApplication);
      const endpoints = this.convertRoutesToEndpoints(routes);
      
      this.log('info', `Discovered ${endpoints.length} endpoints from Express app`);
      
      return Promise.resolve(this.filterEndpoints(endpoints, options.include, options.exclude));
    } catch (error) {
      this.log('error', 'Failed to discover Express endpoints', { error });
      throw new DiscoveryError(
        `Express discovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private isExpressApp(app: unknown): app is ExpressApplication {
    const expressApp = app as ExpressApplication;
    return (
      expressApp &&
      typeof expressApp === 'object' &&
      typeof expressApp.use === 'function' &&
      typeof expressApp.get === 'function' &&
      typeof expressApp.post === 'function' &&
      expressApp._router &&
      Array.isArray(expressApp._router.stack)
    );
  }

  private extractRoutes(app: ExpressApplication): ExpressRoute[] {
    const routes: ExpressRoute[] = [];
    
    if (!app._router) {
      try {
        (app as any).lazyrouter?.();
      } catch (e) {
      }
    }
    
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
    this.log('debug', `Processing stack with ${stack.length} layers at basePath: ${basePath}`);
    for (const layer of stack) {
      this.log('debug', `Processing layer: ${layer.name}, hasRoute: ${!!layer.route}, hasHandle: ${!!layer.handle}, handleType: ${typeof layer.handle}`);
      if (layer.route) {
        const route = layer.route;
        const fullPath = this.combinePaths(basePath, route.path);
        
        const methods = Object.keys(route.methods || {}).filter(method => 
          route.methods[method] && method !== '_all'
        );
        
        for (const method of methods) {
          routes.push({
            path: fullPath,
            method: method.toUpperCase(),
            methods: route.methods || { [method.toUpperCase()]: true },
            stack: route.stack || []
          });
        }
      } else if ((layer.name === 'router' || layer.name === 'app') && layer.handle && 'stack' in layer.handle && Array.isArray(layer.handle.stack)) {
        const nestedPath = this.extractPathFromRegex(layer.regexp);
        const fullNestedPath = this.combinePaths(basePath, nestedPath);
        
        this.log('debug', `Found nested router at path: ${nestedPath} -> ${fullNestedPath}`);
        const router = layer.handle as ExpressRouter;
        this.log('debug', `Nested router has ${router.stack.length} routes`);
        this.extractRoutesFromStack(router.stack, fullNestedPath, routes);
      } else if (layer.name === 'app' && layer.handle && '_router' in layer.handle) {
        const subPath = this.extractPathFromRegex(layer.regexp);
        const fullSubPath = this.combinePaths(basePath, subPath);
        
        const app = layer.handle as unknown as ExpressApplication;
        this.extractRoutesFromStack(app._router.stack, fullSubPath, routes);
      }
    }
  }

  /**
   * Extract path from Express regex
   */
  private extractPathFromRegex(regexp: RegExp): string {
    const regexpStr = regexp.toString();
    
    if (regexpStr.includes('^\\/')) {
      const match = regexpStr.match(/\^\\?\/(.*?)\(?[\\\$\)]/);
      if (match && match[1]) {
        const path = match[1]
          .replace(/\\\//g, '/') // Replace escaped slashes
          .replace(/\?\?:/g, '') // Remove non-capturing groups
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

  private convertRouteToEndpoint(route: ExpressRoute): EndpointDefinition {
    const normalizedPath = this.normalizePath(route.path);
    const openAPIPath = this.convertToOpenAPIPath(normalizedPath);
    const pathParams = this.extractPathParameters(normalizedPath);
    
    // Analyze route handlers for additional information
    const routeInfo = this.analyzeRouteHandlers(route.stack);
    
    const endpoint = this.createBaseEndpoint(route.method, normalizedPath, {
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

    // Convert path to OpenAPI format
    endpoint.path = openAPIPath;
    
    return endpoint;
  }

  /**
   * Analyze route handlers to extract metadata
   */
  private analyzeRouteHandlers(stack: any[]): {
    description?: string;
    summary?: string;
    tags?: string[];
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string }>;
    requestBody?: RequestBodyDefinition;
    responses?: ResponseDefinition;
    metadata?: Record<string, unknown>;
  } {
    const result = {
      queryParams: [] as Array<{ name: string; type: string; required?: boolean; description?: string }>,
      tags: [] as string[],
      metadata: {} as Record<string, unknown>,
    };

    // Analyze middleware and handlers
    const middlewareInfo = this.analyzeMiddleware(stack);
    if (middlewareInfo.length > 0) {
      result.metadata.middleware = middlewareInfo;
    }

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

  private analyzeMiddleware(stack: any[]): Array<{ name: string; type: string }> {
    const middleware: Array<{ name: string; type: string }> = [];
    
    // Skip the last handler (which is the actual route handler)
    // The middleware are typically all handlers except the last one
    for (let i = 0; i < stack.length - 1; i++) {
      const layer = stack[i];
      if (layer.handle && typeof layer.handle === 'function') {
        const name = layer.handle.name || layer.name || 'anonymous';
        const type = this.identifyMiddlewareType(layer.handle.toString(), name);
        
        middleware.push({
          name,
          type
        });
      }
    }
    
    return middleware;
  }

  /**
   * Identify the type of middleware based on function code and name
   */
  private identifyMiddlewareType(handlerStr: string, name: string): string {
    // Common middleware patterns
    if (name.toLowerCase().includes('auth') || handlerStr.includes('authenticate') || handlerStr.includes('authorization')) {
      return 'authentication';
    }
    if (name.toLowerCase().includes('log') || handlerStr.includes('console.log') || handlerStr.includes('logger')) {
      return 'logging';
    }
    if (name.toLowerCase().includes('cors') || handlerStr.includes('Access-Control')) {
      return 'cors';
    }
    if (name.toLowerCase().includes('rate') || name.toLowerCase().includes('limit')) {
      return 'rate-limiting';
    }
    if (handlerStr.includes('req.body') || handlerStr.includes('express.json')) {
      return 'body-parser';
    }
    if (handlerStr.includes('validate') || handlerStr.includes('joi') || handlerStr.includes('schema')) {
      return 'validation';
    }
    
    return 'middleware';
  }

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