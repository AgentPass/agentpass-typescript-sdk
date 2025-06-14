import { 
  EndpointDefinition, 
  MCPOptions, 
  MCPTool, 
  MiddlewareContext,
  MCPError,
  HTTPMethod,
  JSONSchema
} from '../core/types';
// Note: These would be real imports in a full implementation
// import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AgentPass } from '../core/AgentPass';
import { MiddlewareRunner } from '../middleware/MiddlewareRunner';

// Placeholder implementations for compilation
const Server = class { 
  constructor(info: any, config: any) {}
  setRequestHandler(schema: any, handler: any) {}
  async connect(options: any) {}
};
const ListToolsRequestSchema = {};
const CallToolRequestSchema = {};
const axios = { 
  isAxiosError: (err: any) => false,
  default: async (config: any) => ({ status: 200, statusText: 'OK', headers: {}, data: {} })
};
const uuidv4 = () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9);

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
  async generate(endpoints: EndpointDefinition[], options: MCPOptions = {}): Promise<Server> {
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
      ...options,
    };

    // Convert endpoints to MCP tools
    const tools = this.createMCPTools(endpoints, options);

    // Create MCP server
    const server = new Server(
      {
        name: config.name,
        version: config.version,
        description: config.description,
      },
      {
        capabilities: config.capabilities,
      }
    );

    // Register tool handlers
    this.registerToolHandlers(server, tools);

    return server;
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
        console.warn(`Failed to create MCP tool for endpoint ${endpoint.id}:`, error);
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
      handler: this.createToolHandler(endpoint),
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
  private createToolHandler(endpoint: EndpointDefinition) {
    return async (args: any, context?: any): Promise<any> => {
      const requestId = uuidv4();
      const middlewareContext: MiddlewareContext = {
        endpoint,
        request: {
          path: endpoint.path,
          method: endpoint.method,
          headers: args.headers || {},
          params: this.extractPathParams(endpoint.path, args),
          query: this.extractQueryParams(args),
          body: args.body,
        },
        timestamp: new Date(),
        requestId,
        metadata: {
          mcpTool: true,
          originalArgs: args,
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
        try {
          await this.middlewareRunner.runError(middlewareContext, error as Error);
        } catch (middlewareError) {
          throw middlewareError;
        }
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
        })),
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
        const result = await tool.handler(args || {}, {});
        
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
  ): Promise<any> {
    // This is a placeholder - in a real implementation, you would need to know
    // the base URL of the service. This could be passed in configuration or
    // discovered from the middleware context.
    const baseUrl = context.metadata.baseUrl || 'http://localhost:3000';
    
    // Replace path parameters
    let url = endpoint.path;
    for (const [key, value] of Object.entries(context.request.params)) {
      url = url.replace(`{${key}}`, String(value));
      url = url.replace(`:${key}`, String(value));
    }

    const fullUrl = baseUrl + url;

    const config: any = {
      method: endpoint.method,
      url: fullUrl,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentPass/1.0.0',
        ...context.request.headers,
      },
      params: context.request.query,
      timeout: 30000,
    };

    if (context.request.body && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      config.data = context.request.body;
    }

    try {
      const response = await axios.default(config);
      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
      };
    } catch (error: any) {
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
  private extractPathParams(path: string, args: any): Record<string, any> {
    const params: Record<string, any> = {};
    
    // Extract parameter names from path
    const pathParamRegex = /[{:]([a-zA-Z_][a-zA-Z0-9_]*)[}]?/g;
    let match;
    
    while ((match = pathParamRegex.exec(path)) !== null) {
      const paramName = match[1];
      if (paramName && args[paramName] !== undefined) {
        params[paramName] = args[paramName];
      }
    }
    
    return params;
  }

  /**
   * Extract query parameters from arguments
   */
  private extractQueryParams(args: any): Record<string, any> {
    const query: Record<string, any> = {};
    
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