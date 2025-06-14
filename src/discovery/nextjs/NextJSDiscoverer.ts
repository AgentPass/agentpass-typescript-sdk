import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { DiscoverOptions, EndpointDefinition, DiscoveryError, HTTPMethod } from '../../core/types';
import { SUPPORTED_FRAMEWORKS } from '../../core/constants';
import * as fs from 'fs';
import * as path from 'path';

interface NextJSRoute {
  file: string;
  route: string;
  methods: string[];
  dynamic: boolean;
  params: string[];
  segments: string[];
}

interface NextJSAPIRoute {
  path: string;
  filePath: string;
  handler: any;
  config?: any;
  methods: string[];
  isDynamic: boolean;
  params: string[];
}

export class NextJSDiscoverer extends BaseDiscoverer {
  constructor() {
    super('nextjs-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    if (options.framework === SUPPORTED_FRAMEWORKS.NEXTJS) {
      return true;
    }

    // Check if it's a Next.js project structure
    if (options.custom?.directory) {
      return this.isNextJSProject(options.custom.directory);
    }

    return false;
  }

  async discover(options: DiscoverOptions): Promise<EndpointDefinition[]> {
    this.validateOptions(options);

    const directory = options.custom?.directory || './pages/api';
    const baseUrl = options.custom?.baseUrl || '/api';

    if (!fs.existsSync(directory)) {
      throw new DiscoveryError(`Next.js API directory not found: ${directory}`);
    }

    try {
      this.log('info', 'Starting Next.js API routes discovery');
      
      const routes = await this.extractRoutes(directory, baseUrl);
      const endpoints = this.convertRoutesToEndpoints(routes);
      
      this.log('info', `Discovered ${endpoints.length} endpoints from Next.js API routes`);
      
      return this.filterEndpoints(endpoints, options.include, options.exclude);
    } catch (error) {
      this.log('error', 'Failed to discover Next.js endpoints', { error });
      throw new DiscoveryError(
        `Next.js discovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if directory contains a Next.js project
   */
  private isNextJSProject(directory: string): boolean {
    try {
      // Check for pages/api directory or app/api directory (App Router)
      const pagesApi = path.join(directory, 'pages', 'api');
      const appApi = path.join(directory, 'app', 'api');
      
      return fs.existsSync(pagesApi) || fs.existsSync(appApi);
    } catch {
      return false;
    }
  }

  /**
   * Extract routes from Next.js API directory
   */
  private async extractRoutes(directory: string, baseUrl: string): Promise<NextJSAPIRoute[]> {
    const routes: NextJSAPIRoute[] = [];
    
    try {
      await this.scanDirectory(directory, baseUrl, routes);
    } catch (error) {
      this.log('warn', 'Failed to scan Next.js API directory', { error });
    }

    return routes;
  }

  /**
   * Recursively scan directory for API routes
   */
  private async scanDirectory(dir: string, baseRoute: string, routes: NextJSAPIRoute[]): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Handle dynamic routes like [id] or [...slug]
        const isDynamic = this.isDynamicRoute(entry.name);
        const routeSegment = isDynamic ? this.convertDynamicRoute(entry.name) : entry.name;
        const newBaseRoute = `${baseRoute}/${routeSegment}`;
        
        await this.scanDirectory(fullPath, newBaseRoute, routes);
      } else if (entry.isFile() && this.isAPIFile(entry.name)) {
        const route = this.createRouteFromFile(fullPath, baseRoute, entry.name);
        if (route) {
          routes.push(route);
        }
      }
    }
  }

  /**
   * Check if filename represents a dynamic route
   */
  private isDynamicRoute(filename: string): boolean {
    return filename.startsWith('[') && filename.endsWith(']');
  }

  /**
   * Convert Next.js dynamic route to standard parameter format
   */
  private convertDynamicRoute(filename: string): string {
    if (filename.startsWith('[...') && filename.endsWith(']')) {
      // Catch-all route [...slug] -> {slug+}
      const param = filename.slice(4, -1);
      return `{${param}+}`;
    } else if (filename.startsWith('[') && filename.endsWith(']')) {
      // Dynamic route [id] -> {id}
      const param = filename.slice(1, -1);
      return `{${param}}`;
    }
    return filename;
  }

  /**
   * Check if file is an API route file
   */
  private isAPIFile(filename: string): boolean {
    const apiExtensions = ['.js', '.jsx', '.ts', '.tsx'];
    const ext = path.extname(filename);
    return apiExtensions.includes(ext) && !filename.startsWith('_');
  }

  /**
   * Create route from API file
   */
  private createRouteFromFile(filePath: string, baseRoute: string, filename: string): NextJSAPIRoute | null {
    try {
      const ext = path.extname(filename);
      const basename = path.basename(filename, ext);
      
      // Skip index files in route naming
      const routePath = basename === 'index' ? baseRoute : `${baseRoute}/${basename}`;
      
      // Analyze file content for supported methods
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const methods = this.extractMethodsFromFile(fileContent);
      const params = this.extractParamsFromRoute(routePath);
      
      return {
        path: routePath,
        filePath,
        handler: null, // Would need to require/import the file to get actual handler
        methods,
        isDynamic: params.length > 0,
        params,
      };
    } catch (error) {
      this.log('warn', `Failed to process API file: ${filePath}`, { error });
      return null;
    }
  }

  /**
   * Extract HTTP methods from Next.js API file content
   */
  private extractMethodsFromFile(content: string): string[] {
    const methods: string[] = [];
    const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    
    // Look for named exports or default export with method handlers
    for (const method of httpMethods) {
      // Named export: export async function GET(request) {}
      if (content.includes(`export async function ${method}`) || 
          content.includes(`export function ${method}`)) {
        methods.push(method);
      }
      
      // Default export with method check: if (req.method === 'GET')
      if (content.includes(`req.method === '${method}'`) ||
          content.includes(`req.method == '${method}'`) ||
          content.includes(`request.method === '${method}'`)) {
        methods.push(method);
      }
    }
    
    // If no specific methods found, assume it handles all methods or GET
    if (methods.length === 0) {
      // Check if it's a catch-all handler
      if (content.includes('req.method') || content.includes('request.method')) {
        methods.push('GET', 'POST', 'PUT', 'DELETE', 'PATCH');
      } else {
        methods.push('GET');
      }
    }
    
    return methods;
  }

  /**
   * Extract parameters from route path
   */
  private extractParamsFromRoute(routePath: string): string[] {
    const params: string[] = [];
    const paramRegex = /{([^}]+)}/g;
    let match;
    
    while ((match = paramRegex.exec(routePath)) !== null) {
      const param = match[1];
      if (param.endsWith('+')) {
        // Catch-all parameter
        params.push(param.slice(0, -1));
      } else {
        params.push(param);
      }
    }
    
    return params;
  }

  /**
   * Convert Next.js routes to endpoint definitions
   */
  private convertRoutesToEndpoints(routes: NextJSAPIRoute[]): EndpointDefinition[] {
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
   * Convert a single Next.js route to an endpoint definition
   */
  private convertRouteToEndpoint(route: NextJSAPIRoute, method: string): EndpointDefinition {
    const normalizedPath = this.normalizePath(route.path);
    
    // Analyze file for additional information
    const routeInfo = this.analyzeRouteFile(route);
    
    // Create parameters from dynamic route segments
    const parameters = route.params.map(param => ({
      name: param,
      type: 'string' as const,
      required: true,
      in: 'path' as const,
      description: `Path parameter: ${param}`,
    }));

    // Add query parameters from file analysis
    parameters.push(...routeInfo.queryParams);

    return this.createBaseEndpoint(method, normalizedPath, {
      description: routeInfo.description || `${method} ${normalizedPath}`,
      summary: routeInfo.summary,
      tags: routeInfo.tags,
      parameters,
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
        nextjsRoute: {
          originalPath: route.path,
          filePath: route.filePath,
          method: method,
          isDynamic: route.isDynamic,
          params: route.params,
        },
      },
    });
  }

  /**
   * Analyze Next.js API route file for metadata
   */
  private analyzeRouteFile(route: NextJSAPIRoute): {
    description?: string;
    summary?: string;
    tags?: string[];
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>;
    requestBody?: any;
    responses?: any;
    metadata?: Record<string, any>;
  } {
    const result = {
      queryParams: [] as Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>,
      metadata: {} as Record<string, any>,
      tags: [] as string[],
    };

    try {
      const content = fs.readFileSync(route.filePath, 'utf8');
      
      // Extract JSDoc comments
      const jsdocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
      if (jsdocMatch) {
        const jsdoc = jsdocMatch[1];
        
        // Extract description
        const descMatch = jsdoc.match(/\*\s*(.+?)(?:\n|\*\/)/);
        if (descMatch) {
          result.description = descMatch[1].trim();
        }
        
        // Extract @tag annotations
        const tagMatches = jsdoc.match(/@tag\s+(\w+)/g);
        if (tagMatches) {
          result.tags = tagMatches.map(match => match.replace('@tag', '').trim());
        }
      }
      
      // Extract query parameter usage
      this.extractQueryParamsFromContent(content, result.queryParams);
      
      // Add route-based tags
      const pathSegments = route.path.split('/').filter(seg => seg && !seg.startsWith('{'));
      if (pathSegments.length > 1) {
        result.tags.push(pathSegments[1]); // First meaningful segment
      }
      
    } catch (error) {
      this.log('warn', `Failed to analyze route file: ${route.filePath}`, { error });
    }

    return result;
  }

  /**
   * Extract query parameters from file content
   */
  private extractQueryParamsFromContent(
    content: string,
    queryParams: Array<{ name: string; type: string; required?: boolean; description?: string; in: string }>
  ): void {
    // Look for req.query.param or request.nextUrl.searchParams patterns
    const patterns = [
      /req\.query\.(\w+)/g,
      /query\.(\w+)/g,
      /searchParams\.get\(['"](\w+)['"]\)/g,
      /url\.searchParams\.get\(['"](\w+)['"]\)/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const paramName = match[1];
        if (!queryParams.some(p => p.name === paramName)) {
          queryParams.push({
            name: paramName,
            type: 'string',
            required: false,
            in: 'query',
          });
        }
      }
    }
    
    // Look for destructuring: const { param1, param2 } = req.query
    const destructureMatches = content.match(/const\s*{\s*([^}]+)\s*}\s*=\s*req\.query/g);
    if (destructureMatches) {
      for (const match of destructureMatches) {
        const paramsMatch = match.match(/{\s*([^}]+)\s*}/);
        if (paramsMatch) {
          const params = paramsMatch[1].split(',').map(p => p.trim());
          for (const param of params) {
            const paramName = param.split(':')[0].trim();
            if (!queryParams.some(p => p.name === paramName)) {
              queryParams.push({
                name: paramName,
                type: 'string',
                required: false,
                in: 'query',
              });
            }
          }
        }
      }
    }
  }
}