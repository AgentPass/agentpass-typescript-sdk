import { 
  EndpointDefinition, 
  MCPOptions, 
  MCPTool, 
  MiddlewareContext,
  MCPError,
  HTTPMethod,
  JSONSchema,
  MCPServer
} from '../core/types';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AgentPass } from '../core/AgentPass';
import { MiddlewareRunner } from '../middleware/MiddlewareRunner';
import axios, { AxiosRequestConfig } from 'axios';
import { randomUUID } from 'crypto';
import * as http from 'http';

// AgentPass MCP Server Implementation
class AgentPassMCPServer implements MCPServer {
  public info: { name: string; version: string; description?: string };
  public capabilities: { tools?: boolean; resources?: boolean; prompts?: boolean; logging?: boolean };
  public transport: { type: 'stdio' | 'sse' | 'http'; config?: Record<string, unknown> };
  
  private server: Server;
  private serverTransport: StdioServerTransport | SSEServerTransport | null = null;
  private httpServer: http.Server | null = null; // For HTTP/SSE transports
  private isServerRunning = false;
  private mcpTools: MCPTool[] = [];
  private baseUrl?: string;
  
  constructor(
    server: Server,
    info: { name: string; version: string; description?: string },
    capabilities: { tools?: boolean; resources?: boolean; prompts?: boolean; logging?: boolean },
    transportType: 'stdio' | 'sse' | 'http',
    transportConfig?: Record<string, unknown>,
    tools: MCPTool[] = [],
    baseUrl?: string
  ) {
    this.server = server;
    this.info = info;
    this.capabilities = capabilities;
    this.transport = { type: transportType, config: transportConfig };
    this.mcpTools = tools;
    this.baseUrl = baseUrl;
  }
  
  async start(): Promise<void> {
    if (this.isServerRunning) {
      throw new MCPError('MCP server is already running');
    }
    
    switch (this.transport.type) {
      case 'stdio':
        this.serverTransport = new StdioServerTransport();
        await this.server.connect(this.serverTransport);
        break;
      case 'http':
        await this.startHTTPServer();
        break;
      case 'sse':
        await this.startSSEServer();
        break;
      default:
        throw new MCPError(`Unsupported transport type: ${this.transport.type}`);
    }
    
    this.isServerRunning = true;
  }

  private async startHTTPServer(): Promise<void> {
    const port = (this.transport.config?.port as number) ?? 3000;
    const host = (this.transport.config?.host as string) || 'localhost';

    this.httpServer = http.createServer((req, res) => {
      // Set CORS headers
      if (this.transport.config?.cors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/mcp') {
        this.handleMCPRequest(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(port, host, () => {
        resolve();
      });
      this.httpServer!.on('error', reject);
    });
  }

  private async startSSEServer(): Promise<void> {
    const port = (this.transport.config?.port as number) ?? 3000;
    const host = (this.transport.config?.host as string) || 'localhost';
    const sseEndpoint = '/sse';
    const messagesEndpoint = '/sse/messages';

    this.httpServer = http.createServer((req, res) => {
      // Debug logging
      console.error(`[SSE] ${req.method} ${req.url} from ${req.headers['user-agent'] || 'unknown'}`);
      
      // Set CORS headers
      if (this.transport.config?.cors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
      }

      if (req.method === 'OPTIONS') {
        console.error(`[SSE] CORS preflight for ${req.url}`);
        res.writeHead(200);
        res.end();
        return;
      }

      // Parse URL to handle query parameters
      const urlParts = req.url?.split('?') || [''];
      const pathname = urlParts[0];

      if (req.method === 'GET' && pathname === sseEndpoint) {
        console.error(`[SSE] Establishing SSE connection to ${sseEndpoint}`);
        this.handleSSEConnection(req, res, messagesEndpoint);
      } else if (req.method === 'POST' && pathname === messagesEndpoint) {
        console.error(`[SSE] Handling message to ${messagesEndpoint}`);
        this.handleSSEMessage(req, res);
      } else {
        console.error(`[SSE] 404 - Unknown endpoint: ${req.method} ${req.url}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Not found: ${req.method} ${req.url}`);
      }
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(port, host, () => {
        resolve();
      });
      this.httpServer!.on('error', reject);
    });
  }

  private async handleSSEConnection(req: http.IncomingMessage, res: http.ServerResponse, messagesEndpoint: string): Promise<void> {
    try {
      // Create SSE transport with the messages endpoint
      this.serverTransport = new SSEServerTransport(messagesEndpoint, res);
      
      // Connect the server to the transport (this automatically calls start())
      await this.server.connect(this.serverTransport);
      
      console.error(`[SSE] SSE connection established, session ID: ${this.serverTransport.sessionId}`);
    } catch (error) {
      console.error('SSE connection error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal server error');
      }
    }
  }

  private async handleSSEMessage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (this.serverTransport instanceof SSEServerTransport) {
        await this.serverTransport.handlePostMessage(req, res);
      } else {
        res.writeHead(400);
        res.end('No SSE connection established');
      }
    } catch (error) {
      console.error('SSE message error:', error);
      res.writeHead(500);
      res.end('Internal server error');
    }
  }

  private async handleMCPRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const message = JSON.parse(body);
        let result: any;

        // Handle different MCP message types
        if (message.method === 'tools/list') {
          result = {
            tools: this.mcpTools.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            }))
          };
        } else if (message.method === 'tools/call') {
          const { name, arguments: args } = message.params;
          
          const tool = this.mcpTools.find(t => t.name === name);
          if (!tool) {
            throw new Error(`Tool not found: ${name}`);
          }

          try {
            const mockContext: MiddlewareContext = {
              endpoint: { id: '', method: 'GET', path: '', tags: [], parameters: [], responses: {}, metadata: {} },
              request: { path: '', method: 'GET', headers: {}, params: {}, query: {} },
              timestamp: new Date(),
              requestId: randomUUID(),
              metadata: {
                baseUrl: this.baseUrl
              }
            };
            const toolResult = await tool.handler(args || {}, mockContext);
            
            result = {
              content: [
                {
                  type: 'text',
                  text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
                },
              ],
            };
          } catch (error) {
            throw new Error(
              `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        } else {
          throw new Error(`Unsupported method: ${message.method}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: body ? JSON.parse(body).id : null,
          error: {
            code: -1,
            message: error instanceof Error ? error.message : 'Internal error'
          }
        }));
      }
    });
  }
  
  async stop(): Promise<void> {
    if (!this.isServerRunning) {
      return;
    }
    
    if (this.serverTransport) {
      await this.serverTransport.close();
      this.serverTransport = null;
    }
    
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    
    this.isServerRunning = false;
  }
  
  isRunning(): boolean {
    return this.isServerRunning;
  }
  
  getAddress(): string | null {
    if (this.transport.type === 'stdio') {
      return null; // stdio doesn't have an address
    }
    
    if (this.httpServer && this.isServerRunning) {
      const address = this.httpServer.address();
      if (address && typeof address === 'object') {
        const host = this.transport.config?.host || 'localhost';
        return `http://${host}:${address.port}`;
      }
    }
    
    return null;
  }
}

export class MCPGenerator {
  private agentpass: AgentPass;
  private middlewareRunner: MiddlewareRunner;

  constructor(agentpass: AgentPass) {
    this.agentpass = agentpass;
    this.middlewareRunner = new MiddlewareRunner(agentpass.getMiddleware());
  }

  /**
   * Generate MCP server from endpoints
   */
  async generate(endpoints: EndpointDefinition[], options: MCPOptions = {}): Promise<MCPServer> {
    if (endpoints.length === 0) {
      throw new MCPError('No endpoints provided for MCP server generation');
    }

    const config = {
      name: options.name || this.agentpass.getConfig().name,
      version: options.version || this.agentpass.getConfig().version,
      description: options.description || this.agentpass.getConfig().description,
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        logging: false,
        ...options.capabilities,
      },
      transport: options.transport || 'stdio',
      ...options,
    };

    // Validate transport type
    if (!['stdio', 'http', 'sse'].includes(config.transport)) {
      throw new MCPError(`Unsupported transport type: ${config.transport}. Supported types: stdio, http, sse`);
    }

    // Convert endpoints to MCP tools
    const tools = this.createMCPTools(endpoints, options);

    // Create MCP server with proper capabilities format
    const capabilities: any = {};
    if (config.capabilities.tools) capabilities.tools = {};
    if (config.capabilities.resources) capabilities.resources = {};
    if (config.capabilities.prompts) capabilities.prompts = {};
    if (config.capabilities.logging) capabilities.logging = {};

    const server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities,
      }
    );

    // Register tool handlers
    this.registerToolHandlers(server, tools);

    // Create transport configuration
    const transportConfig: Record<string, unknown> = {};
    if (config.port !== undefined) transportConfig.port = config.port;
    if (config.host) transportConfig.host = config.host;
    if (config.cors !== undefined) transportConfig.cors = config.cors;
    if (config.auth) transportConfig.auth = config.auth;

    // Create AgentPass MCP Server wrapper
    const mcpServer = new AgentPassMCPServer(
      server,
      {
        name: config.name,
        version: config.version,
        description: config.description,
      },
      config.capabilities,
      config.transport,
      Object.keys(transportConfig).length > 0 ? transportConfig : undefined,
      tools,
      config.baseUrl
    );

    return mcpServer;
  }

  /**
   * Create MCP tools from endpoints
   */
  private createMCPTools(endpoints: EndpointDefinition[], options: MCPOptions): MCPTool[] {
    const tools: MCPTool[] = [];

    for (const endpoint of endpoints) {
      try {
        const tool = this.createMCPTool(endpoint, options);
        tools.push(tool);
      } catch (error) {
        console.error(`Failed to create MCP tool for endpoint ${endpoint.id}:`, error);
      }
    }

    return tools;
  }

  /**
   * Create a single MCP tool from an endpoint
   */
  private createMCPTool(endpoint: EndpointDefinition, options: MCPOptions): MCPTool {
    const toolName = this.generateToolName(endpoint, options.toolNaming);
    const description = this.generateToolDescription(endpoint, options.toolDescription);
    const inputSchema = this.createInputSchema(endpoint);

    return {
      name: toolName,
      description,
      inputSchema,
      handler: this.createToolHandler(endpoint, options),
    };
  }

  /**
   * Generate tool name from endpoint
   */
  private generateToolName(
    endpoint: EndpointDefinition,
    customNaming?: (endpoint: EndpointDefinition) => string
  ): string {
    if (customNaming) {
      return customNaming(endpoint);
    }

    // Default naming strategy: method_resource
    const method = endpoint.method.toLowerCase();
    const pathParts = endpoint.path.split('/').filter(part => part && !part.startsWith('{'));
    const resource = pathParts[pathParts.length - 1] || pathParts[0] || 'endpoint';
    
    return `${method}_${resource}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Generate tool description from endpoint
   */
  private generateToolDescription(
    endpoint: EndpointDefinition,
    customDescription?: (endpoint: EndpointDefinition) => string
  ): string {
    if (customDescription) {
      return customDescription(endpoint);
    }

    if (endpoint.description) {
      return endpoint.description;
    }

    if (endpoint.summary) {
      return endpoint.summary;
    }

    // Generate default description
    const action = this.getActionFromMethod(endpoint.method);
    const resource = this.getResourceFromPath(endpoint.path);
    
    return `${action} ${resource}`;
  }

  /**
   * Create input schema for MCP tool
   */
  private createInputSchema(endpoint: EndpointDefinition): JSONSchema {
    const schema: JSONSchema = {
      type: 'object',
      properties: {},
      required: [],
    };

    // Add path parameters
    if (endpoint.parameters) {
      for (const param of endpoint.parameters) {
        if (param.in === 'path' || param.in === 'query') {
          schema.properties![param.name] = {
            type: param.type,
            description: param.description,
            ...(param.schema || {}),
          };

          if (param.required) {
            schema.required!.push(param.name);
          }
        }
      }
    }

    // Add request body
    if (endpoint.requestBody) {
      const jsonContentType = endpoint.requestBody.content['application/json'];
      if (jsonContentType?.schema) {
        schema.properties!.body = {
          ...jsonContentType.schema,
          description: endpoint.requestBody.description || 'Request body',
        };

        if (endpoint.requestBody.required) {
          schema.required!.push('body');
        }
      }
    }

    // Add headers if any are required
    const headerParams = endpoint.parameters?.filter(p => p.in === 'header') || [];
    if (headerParams.length > 0) {
      schema.properties!.headers = {
        type: 'object',
        properties: {},
        description: 'HTTP headers',
      };

      for (const headerParam of headerParams) {
        schema.properties!.headers.properties![headerParam.name] = {
          type: headerParam.type,
          description: headerParam.description,
        };
      }
    }

    return schema;
  }

  /**
   * Create tool handler for endpoint
   */
  private createToolHandler(endpoint: EndpointDefinition, options: MCPOptions) {
    return async (args: Record<string, unknown>, context: MiddlewareContext): Promise<unknown> => {
      const requestId = randomUUID();
      const middlewareContext: MiddlewareContext = {
        endpoint,
        request: {
          path: endpoint.path,
          method: endpoint.method,
          headers: (args.headers as Record<string, string>) || {},
          params: this.extractPathParams(endpoint.path, args),
          query: this.extractQueryParams(args),
          body: args.body,
        },
        timestamp: new Date(),
        requestId,
        metadata: {
          mcpTool: true,
          originalArgs: args,
          baseUrl: options.baseUrl,
          ...context,
        },
      };

      try {
        // Run pre-middleware
        await this.middlewareRunner.runAuth(middlewareContext);
        await this.middlewareRunner.runAuthz(middlewareContext);
        await this.middlewareRunner.runPre(middlewareContext);

        // Make HTTP request
        const response = await this.makeHttpRequest(endpoint, middlewareContext);

        // Run post-middleware
        const processedResponse = await this.middlewareRunner.runPost(middlewareContext, response);

        return processedResponse;
      } catch (error) {
        // Run error middleware
        await this.middlewareRunner.runError(middlewareContext, error as Error);
        throw error;
      }
    };
  }

  /**
   * Register tool handlers with MCP server
   */
  private registerToolHandlers(server: Server, tools: MCPTool[]): void {
    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }))
      };
    });

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        throw new MCPError(`Tool not found: ${name}`);
      }

      try {
        const mockContext: MiddlewareContext = {
          endpoint: { id: '', method: 'GET', path: '', tags: [], parameters: [], responses: {}, metadata: {} },
          request: { path: '', method: 'GET', headers: {}, params: {}, query: {} },
          timestamp: new Date(),
          requestId: randomUUID(),
          metadata: {}
        };
        const result = await tool.handler(args || {}, mockContext);
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new MCPError(
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
          { tool: name, args, originalError: error }
        );
      }
    });
  }

  /**
   * Make HTTP request for endpoint
   */
  private async makeHttpRequest(
    endpoint: EndpointDefinition,
    context: MiddlewareContext
  ): Promise<{ status: number; statusText: string; headers: Record<string, string>; data: unknown }> {
    // Get base URL from context metadata or use default
    const baseUrl = typeof context.metadata.baseUrl === 'string' 
      ? context.metadata.baseUrl 
      : 'http://localhost:3000';
    
    // Replace path parameters
    let url = endpoint.path;
    for (const [key, value] of Object.entries(context.request.params)) {
      url = url.replace(`{${key}}`, String(value));
      url = url.replace(`:${key}`, String(value));
    }

    const fullUrl = baseUrl + url;

    const config: AxiosRequestConfig = {
      method: endpoint.method as any,
      url: fullUrl,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentPass/1.0.0',
        ...context.request.headers,
      },
      params: context.request.query,
      timeout: 30000,
      validateStatus: () => true, // Accept all HTTP status codes
    };

    if (context.request.body && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      config.data = context.request.body;
    }

    try {
      const response = await axios(config);
      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        data: response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new MCPError(
          `HTTP request failed: ${error.response?.status || 'unknown'} ${error.response?.statusText || 'error'}`,
          {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            config: {
              method: config.method,
              url: config.url,
            },
          }
        );
      }
      throw error;
    }
  }

  /**
   * Extract path parameters from arguments
   */
  private extractPathParams(path: string, args: Record<string, unknown>): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    
    // Extract parameter names from path
    const pathParamRegex = /[{:]([a-zA-Z_][a-zA-Z0-9_]*)[}]?/g;
    let match;
    
    while ((match = pathParamRegex.exec(path)) !== null) {
      const paramName = match[1];
      if (paramName && paramName in args && args[paramName] !== undefined) {
        params[paramName] = args[paramName];
      }
    }
    
    return params;
  }

  /**
   * Extract query parameters from arguments
   */
  private extractQueryParams(args: Record<string, unknown>): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    
    // Any arg that's not a path param, body, or headers becomes a query param
    const excludeKeys = ['body', 'headers'];
    
    for (const [key, value] of Object.entries(args)) {
      if (!excludeKeys.includes(key) && value !== undefined) {
        query[key] = value;
      }
    }
    
    return query;
  }

  /**
   * Get action description from HTTP method
   */
  private getActionFromMethod(method: HTTPMethod): string {
    const actions: Record<HTTPMethod, string> = {
      GET: 'Retrieve',
      POST: 'Create',
      PUT: 'Update',
      PATCH: 'Modify',
      DELETE: 'Delete',
      HEAD: 'Check',
      OPTIONS: 'Get options for',
    };
    
    return actions[method] || 'Interact with';
  }

  /**
   * Get resource description from path
   */
  private getResourceFromPath(path: string): string {
    const parts = path.split('/').filter(part => part && !part.startsWith('{') && !part.startsWith(':'));
    
    if (parts.length === 0) {
      return 'resource';
    }
    
    const lastPart = parts[parts.length - 1];
    
    if (!lastPart) {
      return 'resource';
    }
    
    // Convert to singular if it looks plural
    if (lastPart.endsWith('s') && lastPart.length > 1) {
      return lastPart.slice(0, -1);
    }
    
    return lastPart;
  }
}