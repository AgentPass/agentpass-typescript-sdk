import { DiscoverOptions, EndpointDefinition, DiscoveryError } from '../../core/types';
const uuidv4 = () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9);

export abstract class BaseDiscoverer {
  protected name: string;
  protected version: string;

  constructor(name: string, version: string = '1.0.0') {
    this.name = name;
    this.version = version;
  }

  abstract discover(options: DiscoverOptions): Promise<EndpointDefinition[]>;

  abstract supports(options: DiscoverOptions): boolean;

  getInfo(): { name: string; version: string } {
    return {
      name: this.name,
      version: this.version,
    };
  }

  protected validateOptions(options: DiscoverOptions): void {
    if (!options) {
      throw new DiscoveryError('Discovery options are required');
    }
  }

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

  protected convertToOpenAPIPath(path: string): string {
    return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
  }

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

  protected filterEndpoints(
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

  protected log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    console.error(`[${timestamp}] [${this.name}] ${level.toUpperCase()}: ${message}${logData}`);
  }
}