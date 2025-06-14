import { DiscoverOptions, EndpointDefinition, DiscoveryError } from '../../core/types';
// Mock uuid for compilation
const uuidv4 = () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9);

export abstract class BaseDiscoverer {
  protected name: string;
  protected version: string;

  constructor(name: string, version: string = '1.0.0') {
    this.name = name;
    this.version = version;
  }

  /**
   * Discover endpoints from the given options
   */
  abstract discover(options: DiscoverOptions): Promise<EndpointDefinition[]>;

  /**
   * Check if this discoverer supports the given options
   */
  abstract supports(options: DiscoverOptions): boolean;

  /**
   * Get discoverer information
   */
  getInfo(): { name: string; version: string } {
    return {
      name: this.name,
      version: this.version,
    };
  }

  /**
   * Validate discovery options
   */
  protected validateOptions(options: DiscoverOptions): void {
    if (!options) {
      throw new DiscoveryError('Discovery options are required');
    }
  }

  /**
   * Generate a unique endpoint ID
   */
  protected generateEndpointId(method: string, path: string): string {
    const normalized = `${method.toUpperCase()}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return `${normalized}_${uuidv4().substring(0, 8)}`;
  }

  /**
   * Normalize path by removing trailing slashes and ensuring leading slash
   */
  protected normalizePath(path: string): string {
    if (!path) return '/';
    
    // Ensure leading slash
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    
    // Remove trailing slash (except for root)
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    
    return path;
  }

  /**
   * Extract parameters from a path pattern
   */
  protected extractPathParameters(path: string): string[] {
    const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const params: string[] = [];
    let match;
    
    while ((match = paramRegex.exec(path)) !== null) {
      if (match[1]) {
        params.push(match[1]);
      }
    }
    
    return params;
  }

  /**
   * Convert Express-style path to OpenAPI path
   */
  protected convertToOpenAPIPath(path: string): string {
    return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
  }

  /**
   * Merge endpoint definitions, preferring non-undefined values
   */
  protected mergeEndpoints(base: EndpointDefinition, override: Partial<EndpointDefinition>): EndpointDefinition {
    return {
      ...base,
      ...Object.fromEntries(
        Object.entries(override).filter(([_, value]) => value !== undefined)
      ),
      parameters: override.parameters ?? base.parameters,
      responses: override.responses ?? base.responses,
      metadata: {
        ...base.metadata,
        ...override.metadata,
      },
    };
  }

  /**
   * Create a basic endpoint definition
   */
  protected createBaseEndpoint(
    method: string,
    path: string,
    options: Partial<EndpointDefinition> = {}
  ): EndpointDefinition {
    const normalizedPath = this.normalizePath(path);
    const pathParams = this.extractPathParameters(normalizedPath);

    return {
      id: options.id || this.generateEndpointId(method, normalizedPath),
      method: method.toUpperCase() as any,
      path: normalizedPath,
      description: options.description,
      summary: options.summary,
      tags: options.tags ?? [],
      parameters: pathParams.map(param => ({
        name: param,
        type: 'string',
        required: true,
        in: 'path',
        description: `Path parameter: ${param}`,
      })),
      responses: options.responses ?? {
        '200': {
          description: 'Successful response',
          schema: { type: 'object' },
        },
      },
      metadata: {
        discoverer: this.name,
        discoveredAt: new Date().toISOString(),
        ...options.metadata,
      },
    };
  }

  /**
   * Filter endpoints based on include/exclude patterns
   */
  protected filterEndpoints(
    endpoints: EndpointDefinition[],
    include?: string[],
    exclude?: string[]
  ): EndpointDefinition[] {
    let filtered = endpoints;

    // Apply include filters
    if (include && include.length > 0) {
      filtered = filtered.filter(endpoint => {
        return include.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(endpoint.path) || regex.test(`${endpoint.method} ${endpoint.path}`);
        });
      });
    }

    // Apply exclude filters
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
   * Log discovery progress
   */
  protected log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    console.error(`[${timestamp}] [${this.name}] ${level.toUpperCase()}: ${message}${logData}`);
  }
}