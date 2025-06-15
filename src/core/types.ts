// Note: OpenAPI types would be imported from 'openapi-types' package
// import { OpenAPIV3 } from 'openapi-types';

// Core AgentPass Configuration
export interface AgentPassConfig {
  name: string;
  version: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// HTTP Methods
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

// Parameter Definition
export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
  in: 'path' | 'query' | 'header' | 'body';
  schema?: JSONSchema;
  example?: unknown;
}

// JSON Schema
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
  example?: unknown;
  enum?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

// Response Definition
export interface ResponseDefinition {
  [statusCode: string]: {
    description?: string;
    schema?: JSONSchema;
    example?: unknown;
    headers?: Record<string, {
      type: string;
      description?: string;
    }>;
  };
}

// Request Body Definition
export interface RequestBodyDefinition {
  description?: string;
  required?: boolean;
  content: {
    [mediaType: string]: {
      schema?: JSONSchema;
      example?: unknown;
    };
  };
}

// Endpoint Definition
export interface EndpointDefinition {
  id: string;
  path: string;
  method: HTTPMethod;
  description?: string;
  summary?: string;
  tags?: string[];
  parameters?: ParameterDefinition[];
  requestBody?: RequestBodyDefinition;
  responses?: ResponseDefinition;
  metadata?: Record<string, unknown>;
  security?: SecurityRequirement[];
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
  middleware?: string[];
}

// Security Requirements
export interface SecurityRequirement {
  [name: string]: string[];
}

// Rate Limiting Configuration
export interface RateLimitConfig {
  requests: number;
  window: string; // e.g., '1h', '15m', '60s'
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: string; // reference to key generator function
}

// Cache Configuration
export interface CacheConfig {
  ttl: number; // seconds
  key?: string; // cache key template
  invalidateOn?: string[]; // events that invalidate cache
  tags?: string[];
}

// Discovery Options
export interface DiscoverOptions {
  // Framework discovery
  app?: unknown;
  framework?: 'express' | 'fastify' | 'koa' | 'nestjs' | 'nextjs';
  
  // URL discovery
  url?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  
  // Strategy
  strategy?: 'openapi' | 'crawl' | 'auto' | 'introspect';
  
  // OpenAPI specific
  openapi?: string | Record<string, unknown>;
  
  // Crawling options
  crawl?: CrawlOptions;
  
  // Include/exclude patterns
  include?: string[];
  exclude?: string[];
  
  // Custom options
  custom?: Record<string, unknown>;
}

// Crawling Options
export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  timeout?: number;
  userAgent?: string;
  followRedirects?: boolean;
  respectRobotsTxt?: boolean;
}

// Middleware Context
export interface MiddlewareContext {
  endpoint: EndpointDefinition;
  request: {
    path: string;
    method: HTTPMethod;
    headers: Record<string, string>;
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    body?: unknown;
  };
  response?: unknown;
  user?: unknown;
  client?: unknown;
  ip?: string;
  timestamp: Date;
  requestId: string;
  metadata: Record<string, unknown>;
  cacheKey?: string;
}

// Middleware Function Types
export type PreMiddleware = (context: MiddlewareContext) => Promise<void>;
export type PostMiddleware = (context: MiddlewareContext, response: unknown) => Promise<unknown>;
export type AuthMiddleware = (context: MiddlewareContext) => Promise<unknown>;
export type AuthzMiddleware = (context: MiddlewareContext) => Promise<boolean>;
export type ErrorMiddleware = (context: MiddlewareContext, error: Error) => Promise<never>;

// Middleware Configuration
export interface MiddlewareConfig {
  auth?: AuthMiddleware[];
  authz?: AuthzMiddleware[];
  pre?: PreMiddleware[];
  post?: PostMiddleware[];
  error?: ErrorMiddleware[];
}

// Endpoint Transformer
export type EndpointTransformer = (endpoint: EndpointDefinition) => EndpointDefinition;

// MCP Configuration
export interface MCPOptions {
  name?: string;
  version?: string;
  description?: string;
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  transport?: 'stdio' | 'http' | 'sse';
  port?: number; // For SSE/HTTP transports
  host?: string; // For SSE/HTTP transports
  cors?: boolean; // For HTTP transport
  auth?: {
    type: 'bearer' | 'basic' | 'custom';
    credentials?: string;
    validator?: (token: string) => Promise<boolean>;
  };
  baseUrl?: string; // Base URL for HTTP requests to discovered endpoints
  metadata?: Record<string, unknown>;
  toolNaming?: (endpoint: EndpointDefinition) => string;
  toolDescription?: (endpoint: EndpointDefinition) => string;
  maxConcurrentRequests?: number;
  requestTimeout?: number;
}

// MCP Tool Definition
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (args: Record<string, unknown>, context: MiddlewareContext) => Promise<unknown>;
}

// MCP Server Interface
export interface MCPServer {
  info: {
    name: string;
    version: string;
    description?: string;
  };
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  transport: {
    type: 'stdio' | 'http' | 'sse';
    config?: Record<string, unknown>;
  };
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getAddress?(): string | null; // For HTTP/SSE transports
}

// Plugin Interface
export interface Plugin {
  name: string;
  version?: string;
  description?: string;
  
  // Lifecycle hooks
  onDiscover?: (endpoints: EndpointDefinition[], agentpass: unknown) => Promise<void>;
  onGenerate?: (mcpConfig: MCPOptions, agentpass: unknown) => Promise<void>;
  onStart?: (mcpServer: unknown, agentpass: unknown) => Promise<void>;
  onStop?: (mcpServer: unknown, agentpass: unknown) => Promise<void>;
  
  // Middleware
  middleware?: MiddlewareConfig;
  
  // Transformers
  transformers?: EndpointTransformer[];
  
  // Custom options
  options?: Record<string, unknown>;
}

// Base Discoverer Interface
export abstract class BaseDiscoverer {
  abstract discover(options: DiscoverOptions): Promise<EndpointDefinition[]>;
  abstract supports(options: DiscoverOptions): boolean;
}

// Error Types
export class AgentPassError extends Error {
  constructor(
    message: string,
    public code: string = 'AGENTPASS_ERROR',
    public details?: unknown
  ) {
    super(message);
    this.name = 'AgentPassError';
  }
}

export class DiscoveryError extends AgentPassError {
  constructor(message: string, details?: unknown) {
    super(message, 'DISCOVERY_ERROR', details);
    this.name = 'DiscoveryError';
  }
}

export class MCPError extends AgentPassError {
  constructor(message: string, details?: unknown) {
    super(message, 'MCP_ERROR', details);
    this.name = 'MCPError';
  }
}

export class MiddlewareError extends AgentPassError {
  constructor(message: string, details?: unknown) {
    super(message, 'MIDDLEWARE_ERROR', details);
    this.name = 'MiddlewareError';
  }
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredField<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Event Types
export interface AgentPassEvent {
  type: string;
  timestamp: Date;
  data?: unknown;
}

export interface DiscoveryEvent extends AgentPassEvent {
  type: 'discovery:start' | 'discovery:endpoint' | 'discovery:complete' | 'discovery:error';
  data?: {
    endpoint?: EndpointDefinition;
    error?: Error;
    count?: number;
  };
}

export interface MiddlewareEvent extends AgentPassEvent {
  type: 'middleware:start' | 'middleware:complete' | 'middleware:error';
  data?: {
    phase: string;
    context: MiddlewareContext;
    error?: Error;
    duration?: number;
  };
}

export interface MCPEvent extends AgentPassEvent {
  type: 'mcp:start' | 'mcp:request' | 'mcp:response' | 'mcp:error';
  data?: {
    tool?: string;
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    error?: Error;
    duration?: number;
  };
}

// Event Emitter Interface
export interface EventEmitter {
  on(event: string, listener: (event: AgentPassEvent) => void): void;
  emit(event: string, data: AgentPassEvent): void;
  off(event: string, listener: (event: AgentPassEvent) => void): void;
}