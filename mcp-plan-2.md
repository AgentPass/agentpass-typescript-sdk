# MCP Server Integration Plan

## Overview
This plan outlines the implementation of actual MCP (Model Context Protocol) server functionality to replace the current mock implementations in the AgentPass SDK. The goal is to make `agentpass.generateMCPServer()` start a real MCP server instance with support for stdio, SSE, and HTTP transports.

## Current State Analysis

### Existing Mock Implementation
The current `MCPGenerator.ts` contains placeholder implementations:
- Mock `Server`, `ListToolsRequestSchema`, `CallToolRequestSchema` classes
- Mock axios implementation
- Returns mock server objects instead of real MCP server instances
- No actual MCP protocol implementation

### Key Files Requiring Changes
- `src/mcp/MCPGenerator.ts` - Core MCP server generation logic
- `src/core/AgentPass.ts` - Main SDK class with MCP server lifecycle management
- `package.json` - Dependencies for real MCP SDK
- E2E test files - Real MCP client-server communication tests

## Implementation Plan

### Phase 1: Dependencies and Setup (1-2 days)
1. **Add MCP SDK Dependencies**
   - Install `@modelcontextprotocol/sdk` package
   - Add required transport dependencies:
     - `@modelcontextprotocol/sdk/server/stdio`
     - `@modelcontextprotocol/sdk/server/sse` 
     - `@modelcontextprotocol/sdk/server/http`

2. **Study MCP SDK Documentation**
   - Review examples at https://modelcontextprotocol.io/examples
   - Understand MCP server architecture and tool registration patterns
   - Document transport-specific implementation requirements

### Phase 2: Core MCP Server Implementation (2-3 days)
1. **Replace Mock Classes in MCPGenerator.ts**
   - Remove placeholder `Server`, `ListToolsRequestSchema`, `CallToolRequestSchema` classes
   - Import real MCP server classes from `@modelcontextprotocol/sdk`
   - Implement proper MCP server initialization with tool registration

2. **Implement Transport Support**
   - **stdio Transport**: Direct stdin/stdout communication
   - **SSE Transport**: Server-sent events over HTTP
   - **HTTP Transport**: RESTful HTTP endpoints
   - Transport selection based on `MCPOptions` configuration

3. **Tool Registration System**
   - Convert AgentPass `EndpointDefinition` objects to MCP tools
   - Map HTTP methods and parameters to MCP tool schemas
   - Handle request/response translation between MCP and HTTP

### Phase 3: Server Lifecycle Management (1-2 days)
1. **Enhance AgentPass.ts**
   - Add MCP server lifecycle methods (start, stop, restart)
   - Implement proper error handling and server state management
   - Add configuration validation for different transport types

2. **Connection Management**
   - Handle multiple concurrent MCP client connections
   - Implement proper cleanup on server shutdown
   - Add connection monitoring and health checks

### Phase 4: Transport-Specific Implementation (2-3 days)
1. **stdio Transport Implementation**
   ```typescript
   // Example structure
   const server = new Server({
     name: "agentpass-mcp-server",
     version: "1.0.0"
   }, {
     capabilities: {
       tools: {}
     }
   });
   
   server.setRequestHandler(ListToolsRequestSchema, async () => {
     return { tools: convertEndpointsToMCPTools(endpoints) };
   });
   
   server.setRequestHandler(CallToolRequestSchema, async (request) => {
     return executeEndpointCall(request.params);
   });
   
   const transport = new StdioServerTransport();
   await server.connect(transport);
   ```

2. **SSE Transport Implementation**
   - HTTP server with SSE endpoint for MCP communication
   - Real-time event streaming for tool calls and responses
   - Proper CORS handling for web clients

3. **HTTP Transport Implementation**
   - RESTful endpoints that proxy to MCP protocol
   - Request/response mapping between HTTP and MCP formats
   - Authentication and authorization support

### Phase 5: E2E Testing with Real MCP Client (1-2 days)
1. **Update Test Infrastructure**
   - Install MCP client SDK: `@modelcontextprotocol/sdk/client`
   - Create test utilities for MCP client-server communication
   - Add transport-specific test configurations

2. **Implement Real Client-Server Tests**
   ```typescript
   // Example E2E test structure
   describe('MCP Server Integration', () => {
     it('should connect via stdio transport', async () => {
       const server = await agentpass.generateMCPServer({
         transport: 'stdio'
       });
       
       const client = new Client({
         name: "test-client",
         version: "1.0.0"
       }, {
         capabilities: {}
       });
       
       const transport = new StdioClientTransport({
         command: 'node',
         args: ['dist/mcp-server.js']
       });
       
       await client.connect(transport);
       
       const tools = await client.listTools();
       expect(tools).toBeDefined();
       expect(tools.tools.length).toBeGreaterThan(0);
       
       await client.close();
     });
   });
   ```

3. **Transport-Specific Test Coverage**
   - stdio transport tests with process communication
   - SSE transport tests with HTTP client connections
   - HTTP transport tests with REST API calls
   - Error handling and reconnection scenarios

### Phase 6: Documentation and Examples (1 day)
1. **Update API Documentation**
   - Document new MCP server options and transport configurations
   - Add examples for each transport type
   - Update existing documentation to reflect real MCP functionality

2. **Create Example Applications**
   - Simple MCP server with stdio transport
   - Web-based MCP server with SSE transport
   - REST API wrapper with HTTP transport

## Technical Details

### MCP Server Configuration
```typescript
interface MCPOptions {
  transport: 'stdio' | 'sse' | 'http';
  port?: number; // For SSE/HTTP transports
  host?: string; // For SSE/HTTP transports
  cors?: boolean; // For HTTP transport
  auth?: {
    type: 'bearer' | 'basic' | 'custom';
    credentials?: string;
    validator?: (token: string) => Promise<boolean>;
  };
  capabilities?: {
    tools?: boolean;
    prompts?: boolean;
    resources?: boolean;
  };
}
```

### Tool Registration Pattern
```typescript
// Convert AgentPass endpoints to MCP tools
function convertEndpointToMCPTool(endpoint: EndpointDefinition): Tool {
  return {
    name: `${endpoint.method.toLowerCase()}_${endpoint.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
    description: endpoint.description || `${endpoint.method} ${endpoint.path}`,
    inputSchema: {
      type: "object",
      properties: {
        // Convert endpoint parameters to JSON schema
        ...convertParametersToSchema(endpoint.parameters),
        // Add request body schema if present
        ...(endpoint.requestBody ? { body: endpoint.requestBody.content } : {})
      },
      required: endpoint.parameters?.filter(p => p.required).map(p => p.name) || []
    }
  };
}
```

### Server Lifecycle Management
```typescript
class MCPServerManager {
  private server?: Server;
  private transport?: Transport;
  
  async start(options: MCPOptions): Promise<void> {
    this.server = new Server(/* config */);
    this.transport = this.createTransport(options.transport);
    await this.server.connect(this.transport);
  }
  
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
    }
  }
  
  private createTransport(type: string): Transport {
    switch (type) {
      case 'stdio': return new StdioServerTransport();
      case 'sse': return new SSEServerTransport(/* options */);
      case 'http': return new HTTPServerTransport(/* options */);
      default: throw new Error(`Unsupported transport: ${type}`);
    }
  }
}
```

## Timeline Estimate
- **Total Duration**: 8-12 days
- **Critical Path**: MCP SDK integration → Core server implementation → Transport implementation → E2E testing
- **Risk Mitigation**: Start with stdio transport (simplest) before implementing SSE/HTTP

## Success Criteria
1. ✅ Real MCP server instances created by `agentpass.generateMCPServer()`
2. ✅ Support for all three transport types (stdio, SSE, HTTP)
3. ✅ E2E tests using real MCP client SDK to connect and communicate
4. ✅ Proper tool registration and execution for discovered endpoints
5. ✅ Server lifecycle management (start, stop, restart)
6. ✅ Comprehensive test coverage for all transport types
7. ✅ Updated documentation and examples

## Next Steps
1. Begin Phase 1: Install MCP SDK dependencies and study documentation
2. Create feature branch for MCP server implementation
3. Start with stdio transport implementation as proof of concept
4. Gradually add SSE and HTTP transport support
5. Implement comprehensive E2E testing suite