import { BaseDiscoverer } from '../base/BaseDiscoverer';
import { 
  DiscoverOptions, 
  EndpointDefinition, 
  DiscoveryError, 
  HTTPMethod,
  ParameterDefinition,
  JSONSchema,
  ResponseDefinition,
  RequestBodyDefinition
} from '../../core/types';
// Note: These would be real imports in a full implementation
// import { OpenAPIV3 } from 'openapi-types';
// import * as SwaggerParser from 'swagger-parser';
// import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Placeholder types for compilation
type OpenAPIV3 = any;
const SwaggerParser = { validate: async (spec: any) => spec };
const axios = { get: async (url: string, options?: any) => ({ data: {} }), isAxiosError: (err: any) => false };

export class OpenAPIDiscoverer extends BaseDiscoverer {
  constructor() {
    super('openapi-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    return !!(
      options.openapi ||
      options.strategy === 'openapi' ||
      (options.url && (
        options.url.includes('swagger') ||
        options.url.includes('openapi') ||
        options.url.endsWith('.json') ||
        options.url.endsWith('.yaml') ||
        options.url.endsWith('.yml')
      ))
    );
  }

  async discover(options: DiscoverOptions): Promise<EndpointDefinition[]> {
    this.validateOptions(options);

    try {
      this.log('info', 'Starting OpenAPI endpoint discovery');

      const spec = await this.loadOpenAPISpec(options);
      const endpoints = this.convertSpecToEndpoints(spec);

      this.log('info', `Discovered ${endpoints.length} endpoints from OpenAPI spec`);

      return this.filterEndpoints(endpoints, options.include, options.exclude);
    } catch (error) {
      this.log('error', 'Failed to discover OpenAPI endpoints', { error });
      throw new DiscoveryError(
        `OpenAPI discovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Load OpenAPI specification from various sources
   */
  private async loadOpenAPISpec(options: DiscoverOptions): Promise<OpenAPIV3.Document> {
    let spec: any;

    if (options.openapi) {
      if (typeof options.openapi === 'string') {
        // Load from file path or URL
        if (this.isUrl(options.openapi)) {
          spec = await this.loadFromUrl(options.openapi, options);
        } else {
          spec = await this.loadFromFile(options.openapi);
        }
      } else {
        // Use provided object
        spec = options.openapi;
      }
    } else if (options.url) {
      // Try to discover OpenAPI spec from URL
      spec = await this.discoverSpecFromUrl(options.url, options);
    } else {
      throw new DiscoveryError('No OpenAPI specification source provided');
    }

    // Parse and validate the spec
    return await SwaggerParser.validate(spec);
  }

  /**
   * Load OpenAPI spec from URL
   */
  private async loadFromUrl(url: string, options: DiscoverOptions): Promise<any> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json, application/x-yaml, text/yaml',
        'User-Agent': 'AgentPass/1.0.0',
        ...options.headers,
      };

      if (options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
      }

      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      throw new DiscoveryError(`Failed to load OpenAPI spec from URL: ${url}`, { error });
    }
  }

  /**
   * Load OpenAPI spec from file
   */
  private async loadFromFile(filePath: string): Promise<any> {
    try {
      const absolutePath = path.resolve(filePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
      }

      const content = fs.readFileSync(absolutePath, 'utf8');
      
      if (filePath.endsWith('.json')) {
        return JSON.parse(content);
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        // For YAML, we'll rely on swagger-parser to handle it
        return content;
      } else {
        // Try to parse as JSON first, then let swagger-parser handle it
        try {
          return JSON.parse(content);
        } catch {
          return content;
        }
      }
    } catch (error) {
      throw new DiscoveryError(`Failed to load OpenAPI spec from file: ${filePath}`, { error });
    }
  }

  /**
   * Discover OpenAPI spec from a base URL
   */
  private async discoverSpecFromUrl(baseUrl: string, options: DiscoverOptions): Promise<any> {
    const commonPaths = [
      '/swagger.json',
      '/swagger.yaml',
      '/openapi.json',
      '/openapi.yaml',
      '/api-docs',
      '/docs/swagger.json',
      '/docs/openapi.json',
      '/v1/swagger.json',
      '/v1/openapi.json',
    ];

    for (const specPath of commonPaths) {
      try {
        const specUrl = baseUrl + specPath;
        this.log('info', `Trying to discover OpenAPI spec at: ${specUrl}`);
        
        const spec = await this.loadFromUrl(specUrl, options);
        if (spec && (spec.openapi || spec.swagger)) {
          this.log('info', `Found OpenAPI spec at: ${specUrl}`);
          return spec;
        }
      } catch (error) {
        // Continue trying other paths
        this.log('info', `No spec found at ${specPath}`);
      }
    }

    throw new DiscoveryError(`No OpenAPI specification found at ${baseUrl}`);
  }

  /**
   * Convert OpenAPI specification to endpoint definitions
   */
  private convertSpecToEndpoints(spec: any): EndpointDefinition[] {
    const endpoints: EndpointDefinition[] = [];

    if (!spec.paths) {
      this.log('warn', 'No paths found in OpenAPI specification');
      return endpoints;
    }

    for (const [pathPattern, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

      for (const method of methods) {
        const operation = (pathItem as any)[method];
        if (!operation) continue;

        try {
          const endpoint = this.convertOperationToEndpoint(
            method.toUpperCase() as HTTPMethod,
            pathPattern,
            operation,
            pathItem as any,
            spec
          );
          endpoints.push(endpoint);
        } catch (error) {
          this.log('warn', `Failed to convert operation: ${method.toUpperCase()} ${pathPattern}`, { error });
        }
      }
    }

    return endpoints;
  }

  /**
   * Convert OpenAPI operation to endpoint definition
   */
  private convertOperationToEndpoint(
    method: HTTPMethod,
    pathPattern: string,
    operation: any,
    pathItem: any,
    spec: any
  ): EndpointDefinition {
    const normalizedPath = this.normalizePath(pathPattern);
    
    // Combine path-level and operation-level parameters
    const allParameters = [
      ...(pathItem.parameters || []),
      ...(operation.parameters || [])
    ];

    const parameters = this.convertParameters(allParameters, spec);
    const requestBody = this.convertRequestBody(operation.requestBody, spec);
    const responses = this.convertResponses(operation.responses, spec);

    return this.createBaseEndpoint(method, normalizedPath, {
      description: operation.description || operation.summary,
      summary: operation.summary,
      tags: operation.tags || [],
      parameters,
      requestBody,
      responses,
      security: operation.security as any,
      metadata: {
        operationId: operation.operationId,
        deprecated: operation.deprecated,
        externalDocs: operation.externalDocs,
        servers: operation.servers || spec.servers,
        openapi: {
          originalPath: pathPattern,
          operationId: operation.operationId,
          tags: operation.tags || [],
        },
      },
    });
  }

  /**
   * Convert OpenAPI parameters to parameter definitions
   */
  private convertParameters(
    parameters: any[],
    spec: any
  ): ParameterDefinition[] {
    const result: ParameterDefinition[] = [];

    for (const param of parameters) {
      try {
        const resolved = this.resolveReference(param, spec);
        
        result.push({
          name: resolved.name,
          type: this.getTypeFromSchema(resolved.schema) as 'string' | 'number' | 'boolean' | 'object' | 'array',
          required: resolved.required || false,
          description: resolved.description,
          in: resolved.in as any,
          schema: this.convertSchema(resolved.schema, spec),
          example: resolved.example,
        });
      } catch (error) {
        this.log('warn', 'Failed to convert parameter', { param, error });
      }
    }

    return result;
  }

  /**
   * Convert OpenAPI request body to request body definition
   */
  private convertRequestBody(
    requestBody: any,
    spec: any
  ): RequestBodyDefinition | undefined {
    if (!requestBody) return undefined;

    try {
      const resolved = this.resolveReference(requestBody, spec);
      
      const content: Record<string, any> = {};
      
      for (const [mediaType, mediaTypeObject] of Object.entries(resolved.content)) {
        content[mediaType] = {
          schema: this.convertSchema(mediaTypeObject.schema, spec),
          example: mediaTypeObject.example || mediaTypeObject.examples,
        };
      }

      return {
        description: resolved.description,
        required: resolved.required,
        content,
      };
    } catch (error) {
      this.log('warn', 'Failed to convert request body', { requestBody, error });
      return undefined;
    }
  }

  /**
   * Convert OpenAPI responses to response definitions
   */
  private convertResponses(
    responses: OpenAPIV3.ResponsesObject,
    spec: OpenAPIV3.Document
  ): ResponseDefinition {
    const result: ResponseDefinition = {};

    for (const [statusCode, response] of Object.entries(responses)) {
      try {
        const resolved = this.resolveReference(response, spec) as OpenAPIV3.ResponseObject;
        
        let schema: JSONSchema | undefined;
        
        if (resolved.content) {
          // Try to get schema from common content types
          const contentTypes = ['application/json', 'application/xml', 'text/plain'];
          for (const contentType of contentTypes) {
            if (resolved.content[contentType]?.schema) {
              schema = this.convertSchema(resolved.content[contentType].schema, spec);
              break;
            }
          }
          
          // If no common content type found, use the first available
          if (!schema) {
            const firstContent = Object.values(resolved.content)[0];
            if (firstContent?.schema) {
              schema = this.convertSchema(firstContent.schema, spec);
            }
          }
        }

        result[statusCode] = {
          description: resolved.description,
          schema: schema || { type: 'object' },
          headers: resolved.headers ? this.convertHeaders(resolved.headers, spec) : undefined,
        };
      } catch (error) {
        this.log('warn', `Failed to convert response for status ${statusCode}`, { response, error });
      }
    }

    return result;
  }

  /**
   * Convert OpenAPI headers
   */
  private convertHeaders(
    headers: Record<string, OpenAPIV3.ReferenceObject | OpenAPIV3.HeaderObject>,
    spec: OpenAPIV3.Document
  ): Record<string, { type: string; description?: string }> {
    const result: Record<string, { type: string; description?: string }> = {};

    for (const [name, header] of Object.entries(headers)) {
      try {
        const resolved = this.resolveReference(header, spec) as OpenAPIV3.HeaderObject;
        result[name] = {
          type: this.getTypeFromSchema(resolved.schema),
          description: resolved.description,
        };
      } catch (error) {
        this.log('warn', `Failed to convert header ${name}`, { header, error });
      }
    }

    return result;
  }

  /**
   * Convert OpenAPI schema to JSON schema
   */
  private convertSchema(
    schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | undefined,
    spec: OpenAPIV3.Document
  ): JSONSchema | undefined {
    if (!schema) return undefined;

    try {
      const resolved = this.resolveReference(schema, spec) as OpenAPIV3.SchemaObject;
      
      const result: JSONSchema = {};

      if (resolved.type) result.type = resolved.type;
      if (resolved.description) result.description = resolved.description;
      if (resolved.example !== undefined) result.example = resolved.example;
      if (resolved.enum) result.enum = resolved.enum;
      if (resolved.format) result.format = resolved.format;
      
      if (typeof resolved.minimum === 'number') result.minimum = resolved.minimum;
      if (typeof resolved.maximum === 'number') result.maximum = resolved.maximum;
      if (typeof resolved.minLength === 'number') result.minLength = resolved.minLength;
      if (typeof resolved.maxLength === 'number') result.maxLength = resolved.maxLength;
      if (resolved.pattern) result.pattern = resolved.pattern;

      if (resolved.properties) {
        result.properties = {};
        for (const [propName, propSchema] of Object.entries(resolved.properties)) {
          result.properties[propName] = this.convertSchema(propSchema, spec) || {};
        }
      }

      if (resolved.items) {
        result.items = this.convertSchema(resolved.items, spec);
      }

      if (resolved.required) {
        result.required = resolved.required;
      }

      return result;
    } catch (error) {
      this.log('warn', 'Failed to convert schema', { schema, error });
      return { type: 'object' };
    }
  }

  /**
   * Resolve OpenAPI reference
   */
  private resolveReference(ref: OpenAPIV3.ReferenceObject | any, spec: OpenAPIV3.Document): any {
    if (!ref.$ref) return ref;

    const parts = ref.$ref.split('/');
    if (parts[0] !== '#') {
      throw new Error(`External references not supported: ${ref.$ref}`);
    }

    let result: any = spec;
    for (let i = 1; i < parts.length; i++) {
      result = result[parts[i]];
      if (!result) {
        throw new Error(`Reference not found: ${ref.$ref}`);
      }
    }

    return result;
  }

  /**
   * Get type from OpenAPI schema
   */
  private getTypeFromSchema(schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | undefined): string {
    if (!schema) return 'string';

    if ('$ref' in schema) {
      return 'object'; // Default for references
    }

    return schema.type || 'string';
  }

  /**
   * Check if string is a URL
   */
  private isUrl(str: string): boolean {
    return str.startsWith('http://') || str.startsWith('https://');
  }
}