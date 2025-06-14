import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { DiscoverOptions, EndpointDefinition, DiscoveryError, HTTPMethod } from '../../core/types';

interface CrawlResult {
  url: string;
  method: string;
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody?: any;
  contentType?: string;
  error?: string;
}

interface DiscoveredEndpoint {
  path: string;
  method: string;
  parameters?: string[];
  headers?: Record<string, string>;
  examples?: any[];
}

export class URLDiscoverer extends BaseDiscoverer {
  private crawled: Set<string> = new Set();
  private baseUrl: string = '';
  
  constructor() {
    super('url-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    return !!(options.url || options.strategy === 'crawl');
  }

  async discover(options: DiscoverOptions): Promise<EndpointDefinition[]> {
    this.validateOptions(options);

    if (!options.url) {
      throw new DiscoveryError('Base URL is required for URL discovery');
    }

    this.baseUrl = options.url.replace(/\/$/, ''); // Remove trailing slash
    this.crawled.clear();

    try {
      this.log('info', 'Starting URL endpoint discovery');
      
      const crawlOptions = {
        maxDepth: options.crawl?.maxDepth || 3,
        maxPages: options.crawl?.maxPages || 50,
        timeout: options.crawl?.timeout || 10000,
        followRedirects: options.crawl?.followRedirects !== false,
        ...options.crawl,
      };

      const endpoints = await this.crawlEndpoints(options.url, crawlOptions, options);
      
      this.log('info', `Discovered ${endpoints.length} endpoints from URL crawling`);
      
      return this.filterEndpoints(endpoints, options.include, options.exclude);
    } catch (error) {
      this.log('error', 'Failed to discover endpoints via URL crawling', { error });
      throw new DiscoveryError(
        `URL discovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Crawl endpoints starting from base URL
   */
  private async crawlEndpoints(
    baseUrl: string,
    crawlOptions: any,
    discoverOptions: DiscoverOptions
  ): Promise<EndpointDefinition[]> {
    const endpoints: EndpointDefinition[] = [];
    const toVisit: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }];
    const visited = new Set<string>();

    while (toVisit.length > 0 && endpoints.length < crawlOptions.maxPages) {
      const { url, depth } = toVisit.shift()!;
      
      if (visited.has(url) || depth > crawlOptions.maxDepth) {
        continue;
      }
      
      visited.add(url);
      
      try {
        // Try different HTTP methods on each discovered URL
        const methods: HTTPMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
        
        for (const method of methods) {
          if (endpoints.length >= crawlOptions.maxPages) break;
          
          try {
            const result = await this.testEndpoint(url, method, crawlOptions, discoverOptions);
            
            if (result && this.isValidEndpoint(result)) {
              const endpoint = this.createEndpointFromResult(result, method);
              if (endpoint) {
                endpoints.push(endpoint);
              }
            }
            
            // Extract links for further crawling (only for GET requests)
            if (method === 'GET' && result && result.responseBody) {
              const links = this.extractLinksFromResponse(result.responseBody, baseUrl);
              for (const link of links) {
                if (!visited.has(link) && this.isRelevantLink(link, baseUrl)) {
                  toVisit.push({ url: link, depth: depth + 1 });
                }
              }
            }
            
          } catch (error) {
            // Continue with other methods/URLs on individual failures
            this.log('debug', `Failed to test ${method} ${url}`, { error });
          }
        }
        
      } catch (error) {
        this.log('warn', `Failed to process URL: ${url}`, { error });
      }
    }

    return endpoints;
  }

  /**
   * Test a specific endpoint with HTTP method
   */
  private async testEndpoint(
    url: string,
    method: HTTPMethod,
    crawlOptions: any,
    discoverOptions: DiscoverOptions
  ): Promise<CrawlResult | null> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': crawlOptions.userAgent || 'AgentPass-Crawler/1.0.0',
        'Accept': 'application/json, text/html, text/plain, */*',
        ...discoverOptions.headers,
      };

      if (discoverOptions.apiKey) {
        headers['Authorization'] = `Bearer ${discoverOptions.apiKey}`;
      }

      // Mock HTTP request - in real implementation would use fetch/axios
      const response = await this.makeHttpRequest(url, method, headers, crawlOptions.timeout);
      
      return {
        url,
        method,
        statusCode: response.status,
        responseHeaders: response.headers,
        responseBody: response.body,
        contentType: response.headers['content-type'] || response.headers['Content-Type'],
      };
      
    } catch (error) {
      return {
        url,
        method,
        statusCode: 0,
        responseHeaders: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Mock HTTP request implementation
   */
  private async makeHttpRequest(
    url: string,
    method: HTTPMethod,
    headers: Record<string, string>,
    timeout: number
  ): Promise<{ status: number; headers: Record<string, string>; body: any }> {
    // In a real implementation, this would use fetch() or axios
    // For now, return mock response based on URL patterns
    
    const mockResponse = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'server': 'mock-server',
      },
      body: this.generateMockResponse(url, method),
    };

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return mockResponse;
  }

  /**
   * Generate mock response based on URL pattern
   */
  private generateMockResponse(url: string, method: HTTPMethod): any {
    const path = new URL(url).pathname;
    
    // Common API patterns
    if (path.includes('/api/')) {
      if (method === 'GET') {
        if (path.includes('/users')) return { users: [] };
        if (path.includes('/products')) return { products: [] };
        if (path.includes('/orders')) return { orders: [] };
        return { data: [], message: 'Success' };
      } else if (method === 'POST') {
        return { id: '123', created: true };
      } else if (method === 'PUT') {
        return { updated: true };
      } else if (method === 'DELETE') {
        return { deleted: true };
      }
    }
    
    // Return HTML for non-API endpoints
    return `<html><body><h1>Page: ${path}</h1></body></html>`;
  }

  /**
   * Check if the crawl result represents a valid API endpoint
   */
  private isValidEndpoint(result: CrawlResult): boolean {
    // Must have successful or expected error status
    if (result.statusCode === 0) return false;
    
    // Accept 2xx, 4xx (might be valid endpoints with auth/validation)
    if (result.statusCode >= 200 && result.statusCode < 300) return true;
    if (result.statusCode >= 400 && result.statusCode < 500) return true;
    
    // Check if response looks like an API (JSON content type)
    const contentType = result.contentType || '';
    if (contentType.includes('application/json')) return true;
    
    // Check if URL pattern suggests it's an API
    const path = new URL(result.url).pathname;
    if (path.includes('/api/') || path.includes('/v1/') || path.includes('/v2/')) return true;
    
    return false;
  }

  /**
   * Create endpoint definition from crawl result
   */
  private createEndpointFromResult(result: CrawlResult, method: HTTPMethod): EndpointDefinition | null {
    try {
      const url = new URL(result.url);
      const path = url.pathname;
      
      // Extract potential parameters from URL
      const pathParams = this.extractPathParametersFromURL(path);
      const queryParams = this.extractQueryParametersFromURL(url.search);
      
      // Analyze response to infer schema
      const responseSchema = this.inferSchemaFromResponse(result.responseBody, result.contentType);
      
      return this.createBaseEndpoint(method, path, {
        description: `${method} ${path} - Discovered via crawling`,
        parameters: [
          ...pathParams.map(param => ({
            name: param,
            type: 'string' as const,
            required: true,
            in: 'path' as const,
            description: `Path parameter: ${param}`,
          })),
          ...queryParams.map(param => ({
            name: param.name,
            type: param.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
            required: false,
            in: 'query' as const,
            description: `Query parameter: ${param.name}`,
          })),
        ],
        responses: {
          [result.statusCode.toString()]: {
            description: `Response from crawling`,
            schema: responseSchema,
          },
        },
        metadata: {
          crawlResult: {
            originalUrl: result.url,
            method: method,
            statusCode: result.statusCode,
            contentType: result.contentType,
            discoveredAt: new Date().toISOString(),
          },
        },
      });
      
    } catch (error) {
      this.log('warn', `Failed to create endpoint from result: ${result.url}`, { error });
      return null;
    }
  }

  /**
   * Extract potential path parameters from URL path
   */
  private extractPathParametersFromURL(path: string): string[] {
    const params: string[] = [];
    const segments = path.split('/');
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Look for numeric IDs or UUIDs
      if (this.looksLikeParameter(segment)) {
        const paramName = this.generateParameterName(segments, i);
        if (!params.includes(paramName)) {
          params.push(paramName);
        }
      }
    }
    
    return params;
  }

  /**
   * Check if URL segment looks like a parameter value
   */
  private looksLikeParameter(segment: string): boolean {
    if (!segment) return false;
    
    // Numeric ID
    if (/^\d+$/.test(segment)) return true;
    
    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
    
    // Long alphanumeric strings (likely IDs)
    if (/^[a-zA-Z0-9]{10,}$/.test(segment)) return true;
    
    return false;
  }

  /**
   * Generate parameter name based on context
   */
  private generateParameterName(segments: string[], index: number): string {
    const prevSegment = segments[index - 1];
    
    if (prevSegment) {
      // users/123 -> userId
      if (prevSegment.endsWith('s')) {
        return prevSegment.slice(0, -1) + 'Id';
      }
      return prevSegment + 'Id';
    }
    
    return 'id';
  }

  /**
   * Extract query parameters from URL search string
   */
  private extractQueryParametersFromURL(search: string): Array<{ name: string; type: string }> {
    const params: Array<{ name: string; type: string }> = [];
    
    if (!search) return params;
    
    const urlParams = new URLSearchParams(search);
    
    for (const [name, value] of urlParams.entries()) {
      const type = this.inferTypeFromValue(value);
      params.push({ name, type });
    }
    
    return params;
  }

  /**
   * Infer parameter type from value
   */
  private inferTypeFromValue(value: string): string {
    if (/^\d+$/.test(value)) return 'number';
    if (value === 'true' || value === 'false') return 'boolean';
    return 'string';
  }

  /**
   * Infer JSON schema from response body
   */
  private inferSchemaFromResponse(body: any, contentType?: string): any {
    if (!body) return { type: 'object' };
    
    if (contentType?.includes('application/json')) {
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
        return this.inferSchemaFromObject(parsed);
      } catch {
        return { type: 'object' };
      }
    }
    
    if (contentType?.includes('text/html')) {
      return { type: 'string', description: 'HTML content' };
    }
    
    return { type: 'string' };
  }

  /**
   * Infer JSON schema from object structure
   */
  private inferSchemaFromObject(obj: any): any {
    if (obj === null) return { type: 'null' };
    if (typeof obj === 'string') return { type: 'string' };
    if (typeof obj === 'number') return { type: 'number' };
    if (typeof obj === 'boolean') return { type: 'boolean' };
    
    if (Array.isArray(obj)) {
      const itemSchema = obj.length > 0 ? this.inferSchemaFromObject(obj[0]) : { type: 'object' };
      return {
        type: 'array',
        items: itemSchema,
      };
    }
    
    if (typeof obj === 'object') {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      
      for (const [key, value] of Object.entries(obj)) {
        properties[key] = this.inferSchemaFromObject(value);
        if (value !== null && value !== undefined) {
          required.push(key);
        }
      }
      
      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }
    
    return { type: 'object' };
  }

  /**
   * Extract links from response body for further crawling
   */
  private extractLinksFromResponse(body: any, baseUrl: string): string[] {
    const links: string[] = [];
    
    try {
      // Extract from JSON responses
      if (typeof body === 'object') {
        this.extractLinksFromObject(body, links, baseUrl);
      }
      
      // Extract from HTML responses
      if (typeof body === 'string') {
        this.extractLinksFromHTML(body, links, baseUrl);
      }
      
    } catch (error) {
      this.log('debug', 'Failed to extract links from response', { error });
    }
    
    return [...new Set(links)]; // Remove duplicates
  }

  /**
   * Extract links from JSON object
   */
  private extractLinksFromObject(obj: any, links: string[], baseUrl: string): void {
    if (!obj || typeof obj !== 'object') return;
    
    for (const value of Object.values(obj)) {
      if (typeof value === 'string' && this.isURL(value)) {
        const fullUrl = this.resolveURL(value, baseUrl);
        if (fullUrl) links.push(fullUrl);
      } else if (typeof value === 'object') {
        this.extractLinksFromObject(value, links, baseUrl);
      }
    }
  }

  /**
   * Extract links from HTML content
   */
  private extractLinksFromHTML(html: string, links: string[], baseUrl: string): void {
    // Simple regex to find href attributes
    const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
    let match;
    
    while ((match = hrefRegex.exec(html)) !== null) {
      const href = match[1];
      const fullUrl = this.resolveURL(href, baseUrl);
      if (fullUrl) links.push(fullUrl);
    }
  }

  /**
   * Check if string is a URL
   */
  private isURL(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return str.startsWith('/') || str.startsWith('http');
    }
  }

  /**
   * Resolve relative URL to absolute URL
   */
  private resolveURL(url: string, baseUrl: string): string | null {
    try {
      if (url.startsWith('http')) return url;
      if (url.startsWith('/')) return new URL(url, baseUrl).toString();
      return new URL(url, baseUrl).toString();
    } catch {
      return null;
    }
  }

  /**
   * Check if link is relevant for API discovery
   */
  private isRelevantLink(url: string, baseUrl: string): boolean {
    try {
      const linkUrl = new URL(url);
      const baseUrlObj = new URL(baseUrl);
      
      // Same domain only
      if (linkUrl.hostname !== baseUrlObj.hostname) return false;
      
      // Skip common non-API paths
      const path = linkUrl.pathname.toLowerCase();
      const skipPatterns = [
        '/static/', '/assets/', '/images/', '/css/', '/js/',
        '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico',
        '/favicon', '/robots.txt', '/sitemap.xml'
      ];
      
      return !skipPatterns.some(pattern => path.includes(pattern));
      
    } catch {
      return false;
    }
  }
}