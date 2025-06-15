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
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

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
const httpFetch = {
  get: async (url: string, options: { headers?: Record<string, string> } = {}): Promise<{ data: any }> => {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Accept': 'application/json, application/x-yaml, text/yaml',
          'User-Agent': 'AgentPass/1.0.0',
          ...options.headers,
        },
      };

      const req = client.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            let parsedData;
            try {
              parsedData = JSON.parse(data);
            } catch {
              parsedData = data;
            }
            resolve({ data: parsedData });
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`HTTP request failed: ${error.message}`));
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  },
  isAxiosError: (err: unknown) => false
};

const SwaggerParser = { 
  validate: async (spec: unknown) => {
    if (typeof spec === 'object' && spec !== null) {
      const specObj = spec as any;
      if (specObj.openapi || specObj.swagger) {
        return spec;
      }
    }
    throw new Error('Invalid OpenAPI specification');
  }
};

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

  private async loadOpenAPISpec(options: DiscoverOptions): Promise<OpenAPIV3Document> {
    let spec: unknown;

    if (options.openapi) {
      if (typeof options.openapi === 'string') {
        if (this.isUrl(options.openapi)) {
          spec = await this.loadFromUrl(options.openapi, options);
        } else {
          spec = await this.loadFromFile(options.openapi);
        }
      } else {
        spec = options.openapi;
      }
    } else if (options.url) {
      spec = await this.discoverSpecFromUrl(options.url, options);
    } else {
      throw new DiscoveryError('No OpenAPI specification source provided');
    }

    return await SwaggerParser.validate(spec) as OpenAPIV3Document;
  }

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

      const response = await httpFetch.get(url, { headers });
      return response.data;
    } catch (error) {
      throw new DiscoveryError(`Failed to load OpenAPI spec from URL: ${url}`, { error });
    }
  }

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
          return content;
      } else {
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
        this.log('info', `No spec found at ${specPath}`);
      }
    }

    throw new DiscoveryError(`No OpenAPI specification found at ${baseUrl}`);
  }

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

  private convertOperationToEndpoint(
    method: HTTPMethod,
    pathPattern: string,
    operation: unknown,
    pathItem: unknown,
    spec: OpenAPIV3Document
  ): EndpointDefinition {
    const normalizedPath = this.normalizePath(pathPattern);
    
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
          const contentTypes = ['application/json', 'application/xml', 'text/plain'];
          for (const contentType of contentTypes) {
            const mediaType = resolved.content[contentType];
            if (mediaType?.schema) {
              schema = this.convertSchema(mediaType.schema, spec);
              break;
            }
          }
          
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

  private getTypeFromSchema(schema: Schema | undefined): string {
    if (!schema) return 'string';

    if ('$ref' in schema) {
      return 'object';
    }

    return schema.type || 'string';
  }

  private isUrl(str: string): boolean {
    return str.startsWith('http://') || str.startsWith('https://');
  }
}