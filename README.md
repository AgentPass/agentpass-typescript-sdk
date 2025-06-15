# AgentPass TypeScript SDK

[![npm version](https://badge.fury.io/js/agentpass.svg)](https://badge.fury.io/js/agentpass)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

TypeScript SDK for bridging HTTP APIs with the Model Context Protocol (MCP).

## Overview

AgentPass automatically discovers endpoints from web frameworks and generates MCP servers for AI assistants.

### Features

- Auto-discovery from Express, Fastify, Koa, NestJS, Next.js
- OpenAPI/Swagger specification parsing
- Multiple transports: stdio, HTTP, SSE
- Built-in authentication, authorization, rate limiting
- Plugin architecture


## Installation

```bash
npm install agentpass @modelcontextprotocol/sdk
```

```bash
yarn add agentpass @modelcontextprotocol/sdk
```

```bash
pnpm add agentpass @modelcontextprotocol/sdk
```

## Quick Start

### Express

```typescript
import { AgentPass } from 'agentpass';
import express from 'express';

// Your existing Express app
const app = express();
app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'John Doe' });
});

// Create AgentPass instance with auto-discovery
const agentpass = await AgentPass.create({
  name: 'my-api-service',
  version: '1.0.0',
  description: 'My API exposed as MCP tools',
  app,
  framework: 'express'
});

// Generate MCP server for Claude Desktop
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio',
  baseUrl: 'http://localhost:3000'
});

await mcpServer.start();
```

### Fastify

```typescript
import { AgentPass } from 'agentpass';
import fastify from 'fastify';

// Your existing Fastify app
const app = fastify();
await app.register(async function (fastify) {
  fastify.get('/users/:id', async (request, reply) => {
    const { id } = request.params;
    return { id, name: 'John Doe' };
  });
});

// Create AgentPass instance with auto-discovery
const agentpass = await AgentPass.create({
  name: 'my-fastify-service',
  version: '1.0.0',
  description: 'My Fastify API exposed as MCP tools',
  app,
  framework: 'fastify'
});

// Generate MCP server for Claude Desktop
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio',
  baseUrl: 'http://localhost:3000'
});

await mcpServer.start();
```

### OpenAPI

```typescript
import { AgentPass } from 'agentpass';

const agentpass = await AgentPass.create({
  name: 'petstore-api',
  version: '1.0.0',
  framework: 'openapi',
  openapi: 'https://petstore3.swagger.io/api/v3/openapi.json'
});

// Generate web-accessible MCP server
const mcpServer = await agentpass.generateMCPServer({
  transport: 'http',
  port: 3001,
  cors: true,
  baseUrl: 'https://petstore.swagger.io/v2'
});

await mcpServer.start();

// Connect with MCP SDK client:
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3001/mcp"));
const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: { tools: {} } });
await client.connect(transport);
const tools = await client.listTools();
```

## Transport Options

AgentPass supports multiple MCP transport protocols:

### 1. stdio (Claude Desktop)

Perfect for local development and Claude Desktop integration:

```typescript
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio',
  baseUrl: 'http://localhost:3000'
});
```

**Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["path/to/your/mcp-server.js"]
    }
  }
}
```

### 2. HTTP (Web Clients)

For web applications and direct HTTP access:

```typescript
const mcpServer = await agentpass.generateMCPServer({
  transport: 'http',
  port: 3001,
  host: 'localhost',
  cors: true,
  baseUrl: 'http://localhost:3000'
});

await mcpServer.start();

// Connect with MCP SDK client:
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3001/mcp"));
const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: { tools: {} } });
await client.connect(transport);
const tools = await client.listTools();
```

### 3. SSE (mcp-remote)

For remote Claude Desktop connections via mcp-remote:

```typescript
const mcpServer = await agentpass.generateMCPServer({
  transport: 'sse',
  port: 3002,
  cors: true,
  baseUrl: 'http://localhost:3000'
});
```

## Security & Middleware

### Authentication

```typescript
// API Key Authentication
agentpass.use('auth', async (context) => {
  const apiKey = context.request.headers['x-api-key'];
  if (!apiKey || !isValidApiKey(apiKey)) {
    throw new Error('Invalid API key');
  }
  context.user = await getUserFromApiKey(apiKey);
});

// Bearer Token Authentication
agentpass.use('auth', async (context) => {
  const token = context.request.headers['authorization']?.replace('Bearer ', '');
  context.user = await verifyJWT(token);
});
```

### Authorization

```typescript
agentpass.use('authz', async (context) => {
  const { user, endpoint } = context;
  const hasPermission = await checkPermission(user, endpoint.path, endpoint.method);
  if (!hasPermission) {
    throw new Error('Insufficient permissions');
  }
});
```

### Rate Limiting

```typescript
import { RateLimit } from 'agentpass/middleware';

const rateLimit = new RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

agentpass.use('pre', rateLimit.middleware());
```

### Request/Response Transformation

```typescript
// Pre-request middleware
agentpass.use('pre', async (context) => {
  // Transform request data
  context.request.params.userId = parseInt(context.request.params.userId);
});

// Post-response middleware
agentpass.use('post', async (context, response) => {
  // Transform response data
  return {
    ...response,
    timestamp: new Date().toISOString()
  };
});
```

## Customization

### Custom Tool Naming

```typescript
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio',
  baseUrl: 'http://localhost:3000',
  toolNaming: (endpoint) => {
    const method = endpoint.method.toLowerCase();
    const resource = endpoint.path.split('/').pop() || 'endpoint';
    return `${method}_${resource}`;
  }
});
```

### Custom Tool Descriptions

```typescript
const mcpServer = await agentpass.generateMCPServer({
  toolDescription: (endpoint) => {
    return `${endpoint.method} ${endpoint.path} - ${endpoint.summary || 'API endpoint'}`;
  }
});
```

## Framework Support

### Express.js ✅

```typescript
const agentpass = await AgentPass.create({ 
  name: 'my-api', 
  version: '1.0.0',
  app: expressApp, 
  framework: 'express' 
});
```

### Fastify ✅

```typescript
const agentpass = await AgentPass.create({ 
  name: 'my-api', 
  version: '1.0.0',
  app: fastifyApp, 
  framework: 'fastify' 
});
```

### Koa ✅

```typescript
const agentpass = await AgentPass.create({ 
  name: 'my-api', 
  version: '1.0.0',
  app: koaApp, 
  framework: 'koa' 
});
```

### OpenAPI/Swagger ✅

```typescript
const agentpass = await AgentPass.create({ 
  name: 'my-api', 
  version: '1.0.0',
  framework: 'openapi',
  openapi: 'https://api.example.com/openapi.json'
});
```

### NestJS 🚧

```typescript
const agentpass = await AgentPass.create({ 
  name: 'my-api', 
  version: '1.0.0',
  app: nestApp, 
  framework: 'nestjs' 
});
```

### Next.js 🚧

```typescript
const agentpass = await AgentPass.create({ 
  name: 'my-api', 
  version: '1.0.0',
  framework: 'nextjs',
  appDir: './pages/api'
});
```

## 📚 Examples

The project includes comprehensive examples organized by framework in the `examples/` directory:

### Framework Examples
- **[Express Examples](examples/express/)** - Complete Express.js implementation with stdio, HTTP, and SSE servers
- **[Fastify Examples](examples/fastify/)** - Complete Fastify implementation with stdio, HTTP, and SSE servers  
- **OpenAPI** - OpenAPI/Swagger specification parsing

### Example Structure
```
examples/
├── express/
│   ├── api-implementation.ts    # Express-specific API server
│   ├── stdio-server.ts         # Express stdio MCP server
│   ├── http-server.ts          # Express HTTP MCP server
│   └── sse-server.ts           # Express SSE MCP server
├── fastify/
│   ├── api-implementation.ts    # Fastify-specific API server
│   ├── stdio-server.ts         # Fastify stdio MCP server
│   ├── http-server.ts          # Fastify HTTP MCP server
│   └── sse-server.ts           # Fastify SSE MCP server
├── shared/
│   └── api-data.ts             # Shared JSON data and utilities
└── openapi/
    └── server.ts               # OpenAPI example
```

### Running Examples

All framework examples support transport selection:

```bash
# Express examples with different transports
npm run example:express          # Default (SSE transport)
npm run example:express:stdio    # Claude Desktop
npm run example:express:http     # Web clients
npm run example:express:sse      # mcp-remote

# Fastify examples with different transports
npm run example:fastify          # Default (SSE transport)
npm run example:fastify:stdio    # Claude Desktop
npm run example:fastify:http     # Web clients
npm run example:fastify:sse      # mcp-remote

# OpenAPI examples
npm run example:openapi          # OpenAPI/Swagger parsing
```

## 🧪 Testing

AgentPass includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

### Test Coverage
- **Unit Tests**: Core functionality, middleware, plugins, and discovery engines
- **E2E Tests**: 
  - Express integration with stdio/HTTP/SSE transports using real MCP SDK clients
  - Fastify integration with stdio/HTTP/SSE transports using real MCP SDK clients
  - OpenAPI integration with stdio/HTTP/SSE transports using real external API fetching
  - Real MCP client communication (no raw HTTP calls)
  - Tool execution testing with response validation
  - Full protocol compliance testing
- **Documentation Tests**: All README examples validated at runtime

## 🔌 Plugin System

Create custom plugins to extend AgentPass functionality:

```typescript
import { BasePlugin } from 'agentpass/plugins';

class MyCustomPlugin extends BasePlugin {
  async onDiscover(endpoints) {
    // Modify discovered endpoints
    return endpoints.map(endpoint => ({
      ...endpoint,
      metadata: { ...endpoint.metadata, plugin: 'custom' }
    }));
  }

  async onGenerate(tools) {
    // Modify generated MCP tools
    return tools;
  }
}

agentpass.use(new MyCustomPlugin());
```

## 📖 API Reference

### AgentPass Class

The main class for creating and configuring AgentPass instances.

```typescript
class AgentPass {
  constructor(config: AgentPassConfig)
  
  discover(options: DiscoverOptions): Promise<EndpointDefinition[]>
  generateMCPServer(config: MCPServerConfig): Promise<MCPServer>
  
  use(middleware: Middleware): void
  use(type: MiddlewareType, middleware: Middleware): void
  use(plugin: BasePlugin): void
  
  getEndpoints(): EndpointDefinition[]
  getTools(): MCPTool[]
}
```

### Configuration Types

```typescript
interface AgentPassConfig {
  name: string;
  version: string;
  description?: string;
}

interface DiscoverOptions {
  framework: 'express' | 'fastify' | 'koa' | 'nestjs' | 'nextjs' | 'openapi';
  app?: any; // Framework app instance
  openapi?: string | object; // OpenAPI spec
  baseUrl?: string;
}

interface MCPServerConfig {
  transport: 'stdio' | 'http' | 'sse';
  port?: number;
  host?: string;
  cors?: boolean;
  baseUrl: string;
  toolNaming?: (endpoint: EndpointDefinition) => string;
  toolDescription?: (endpoint: EndpointDefinition) => string;
}
```

## Contributing

See [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file.