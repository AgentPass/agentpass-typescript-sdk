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
// Note: fs and path would be imported in a real implementation
// import * as fs from 'fs';
// import * as path from 'path';

// Mock implementations for compilation
const fs = {
  existsSync: (path: string) => true,
  readFileSync: (path: string, encoding?: string) => '',
};

const path = {
  resolve: (filePath: string) => filePath,
};

// Placeholder types for compilation
interface OpenAPIV3Document {
  openapi?: string;
  swagger?: string;
  paths: Record<string, PathItem>;
  servers?: Server[];
}

interface Server {
  url: string;
  description?: string;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
  head?: Operation;
  options?: Operation;
  parameters?: Parameter[];
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody | Reference;
  responses: Responses;
  security?: SecurityRequirement[];
  deprecated?: boolean;
  externalDocs?: ExternalDocumentation;
  servers?: Server[];
}

interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Schema;
  example?: string | number | boolean | object;
}

interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, MediaType>;
}

interface MediaType {
  schema?: Schema;
  example?: string | number | boolean | object;
  examples?: Record<string, Example>;
}

interface Example {
  summary?: string;
  description?: string;
  value?: string | number | boolean | object;
}

interface Responses {
  [statusCode: string]: Response | Reference;
}

interface Response {
  description: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, Header>;
}

interface Header {
  description?: string;
  required?: boolean;
  schema?: Schema;
}

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  description?: string;
  example?: string | number | boolean | object;
  enum?: (string | number)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

interface Reference {
  $ref: string;
}

interface SecurityRequirement {
  [name: string]: string[];
}

interface ExternalDocumentation {
  description?: string;
  url: string;
}
const SwaggerParser = { validate: async (spec: unknown) => spec };
const axios = { get: async (url: string, options?: unknown) => ({ data: {} }), isAxiosError: (err: unknown) => false };

export class OpenAPIDiscoverer extends BaseDiscoverer {
  constructor() {
    super('openapi-discoverer', '1.0.0');
  }

  supports(options: DiscoverOptions): boolean {
    return !!(
      options.openapi ||
      options.strategy === 'openapi' ||
      options.framework === 'openapi' ||
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
  private async loadOpenAPISpec(options: DiscoverOptions): Promise<OpenAPIV3Document> {
    let spec: unknown;

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
    return await SwaggerParser.validate(spec) as OpenAPIV3Document;
  }

  /**
   * Load OpenAPI spec from URL
   */
  private async loadFromUrl(url: string, options: DiscoverOptions): Promise<unknown> {
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
  private async loadFromFile(filePath: string): Promise<unknown> {
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
  private async discoverSpecFromUrl(baseUrl: string, options: DiscoverOptions): Promise<OpenAPIV3Document> {
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
        
        const spec = await this.loadFromUrl(specUrl, options) as OpenAPIV3Document;
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
  private convertSpecToEndpoints(spec: OpenAPIV3Document): EndpointDefinition[] {
    const endpoints: EndpointDefinition[] = [];

    if (!spec.paths) {
      this.log('warn', 'No paths found in OpenAPI specification');
      return endpoints;
    }

    for (const [pathPattern, pathItem] of Object.entries(spec.paths as Record<string, unknown>)) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)[method];
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
    operation: unknown,
    pathItem: unknown,
    spec: OpenAPIV3Document
  ): EndpointDefinition {
    const normalizedPath = this.normalizePath(pathPattern);
    
    // Combine path-level and operation-level parameters
    const pathObj = pathItem as PathItem;
    const opObj = operation as Operation;
    const allParameters = [
      ...(pathObj.parameters || []),
      ...(opObj.parameters || [])
    ];

    const parameters = this.convertParameters(allParameters, spec);
    const requestBody = this.convertRequestBody(opObj.requestBody, spec);
    const responses = this.convertResponses(opObj.responses, spec);

    return this.createBaseEndpoint(method, normalizedPath, {
      description: opObj.description || opObj.summary,
      summary: opObj.summary,
      tags: opObj.tags || [],
      parameters,
      requestBody,
      responses,
      security: opObj.security,
      metadata: {
        operationId: opObj.operationId,
        deprecated: opObj.deprecated,
        externalDocs: opObj.externalDocs,
        servers: opObj.servers || spec.servers,
        openapi: {
          originalPath: pathPattern,
          operationId: opObj.operationId,
          tags: opObj.tags || [],
        },
      },
    });
  }

  /**
   * Convert OpenAPI parameters to parameter definitions
   */
  private convertParameters(
    parameters: (Parameter | Reference)[],
    spec: OpenAPIV3Document
  ): ParameterDefinition[] {
    const result: ParameterDefinition[] = [];

    for (const param of parameters) {
      try {
        const resolved = this.resolveReference<Parameter>(param, spec);
        
        result.push({
          name: resolved.name,
          type: this.getTypeFromSchema(resolved.schema) as 'string' | 'number' | 'boolean' | 'object' | 'array',
          required: resolved.required || false,
          description: resolved.description,
          in: resolved.in as 'path' | 'query' | 'header' | 'body',
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
    requestBody: unknown,
    spec: OpenAPIV3Document
  ): RequestBodyDefinition | undefined {
    if (!requestBody) return undefined;

    try {
      const resolved = this.resolveReference<RequestBody>(requestBody as RequestBody | Reference, spec);
      
      const content: Record<string, { schema?: JSONSchema; example?: string | number | boolean | object }> = {};
      
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
    responses: Responses,
    spec: OpenAPIV3Document
  ): ResponseDefinition {
    const result: ResponseDefinition = {};

    for (const [statusCode, response] of Object.entries(responses)) {
      try {
        const resolved = this.resolveReference<Response>(response, spec);
        
        let schema: JSONSchema | undefined;
        
        if (resolved.content) {
          // Try to get schema from common content types
          const contentTypes = ['application/json', 'application/xml', 'text/plain'];
          for (const contentType of contentTypes) {
            const mediaType = resolved.content[contentType];
            if (mediaType?.schema) {
              schema = this.convertSchema(mediaType.schema, spec);
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
    headers: unknown,
    spec: OpenAPIV3Document
  ): Record<string, { type: string; description?: string }> {
    const result: Record<string, { type: string; description?: string }> = {};

    if (!headers || typeof headers !== 'object') {
      return result;
    }

    for (const [name, header] of Object.entries(headers as Record<string, Header | Reference>)) {
      try {
        const resolved = this.resolveReference<Header>(header, spec);
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
    schema: Schema | undefined,
    spec: OpenAPIV3Document
  ): JSONSchema | undefined {
    if (!schema) return undefined;

    try {
      const resolved = this.resolveReference<Schema>(schema, spec);
      
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
  private resolveReference<T>(ref: T | Reference, spec: OpenAPIV3Document): T {
    if (!ref || typeof ref !== 'object' || !('$ref' in ref)) return ref as T;

    const parts = (ref as Reference).$ref.split('/');
    if (parts[0] !== '#') {
      throw new Error(`External references not supported: ${(ref as Reference).$ref}`);
    }

    let result: unknown = spec;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part) {
        result = (result as Record<string, unknown>)[part];
      }
      if (!result) {
        throw new Error(`Reference not found: ${(ref as Reference).$ref}`);
      }
    }

    return result as T;
  }

  /**
   * Get type from OpenAPI schema
   */
  private getTypeFromSchema(schema: Schema | undefined): string {
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