# AgentPass SDK

[![npm version](https://badge.fury.io/js/agentpass.svg)](https://badge.fury.io/js/agentpass)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

Auto-Discovery HTTP to MCP Bridge - Automatically discover HTTP endpoints from existing services and generate Model Context Protocol (MCP) servers.

## 🚀 Overview

AgentPass is an open-source JavaScript/TypeScript SDK that bridges the gap between traditional HTTP APIs and the Model Context Protocol (MCP). It enables AI assistants to interact seamlessly with any web service by automatically discovering endpoints and generating MCP-compliant tools.

### Key Features

- **🔍 Auto-Discovery**: Automatically discover endpoints from Express, Fastify, Koa, and other frameworks
- **📊 OpenAPI Support**: Parse and convert OpenAPI/Swagger specifications
- **🔒 Security First**: Built-in authentication, authorization, and rate limiting
- **🧩 Plugin Architecture**: Extensible system for custom functionality
- **⚡ Zero Configuration**: Works out of the box with sensible defaults
- **🔧 Developer Friendly**: Full TypeScript support with comprehensive types

## 📦 Installation

```bash
npm install agentpass @modelcontextprotocol/sdk
```

```bash
yarn add agentpass @modelcontextprotocol/sdk
```

```bash
pnpm add agentpass @modelcontextprotocol/sdk
```

## 🏃‍♂️ Quick Start

### Basic Usage

```typescript
import { AgentPass } from 'agentpass';
import express from 'express';

// Your existing Express app
const app = express();
app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'John Doe' });
});

// Create AgentPass instance
const agentpass = new AgentPass({
  name: 'my-api-service',
  version: '1.0.0'
});

// Auto-discover endpoints
await agentpass.discover({ app, framework: 'express' });

// Generate MCP server
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio', // or 'http' for HTTP server
  baseUrl: 'http://localhost:3000' // Where your API runs
});

// Start the MCP server
await mcpServer.start();
```

### HTTP Transport (for web clients)

```typescript
// Generate HTTP MCP server
const mcpServer = await agentpass.generateMCPServer({
  transport: 'http',
  port: 3001,
  host: 'localhost',
  cors: true,
  baseUrl: 'http://localhost:3000'
});

await mcpServer.start();
console.log(`MCP Server running at: ${mcpServer.getAddress()}`);

// Test with HTTP requests
// POST /mcp with JSON-RPC 2.0 messages
```

### stdio Transport (for Claude Desktop)

```typescript
// Generate stdio MCP server for Claude Desktop
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio',
  baseUrl: 'http://localhost:3000'
});

// Add to claude_desktop_config.json:
// {
//   "mcpServers": {
//     "my-api": {
//       "command": "node",
//       "args": ["path/to/your/mcp-server.js"]
//     }
//   }
// }
```

### Discovery from URL

```typescript
// Discover from a running service
await agentpass.discover({
  url: 'http://localhost:3000',
  strategy: 'openapi' // or 'crawl', 'auto'
});
```

### Framework-Specific Discovery

```typescript
// Express.js
await agentpass.discover({ app: expressApp, framework: 'express' });

// Fastify
await agentpass.discover({ app: fastifyApp, framework: 'fastify' });

// Koa with koa-router
await agentpass.discover({ app: koaApp, framework: 'koa' });

// NestJS
await agentpass.discover({ app: nestApp, framework: 'nestjs' });

// Next.js API routes
await agentpass.discover({ 
  framework: 'nextjs',
  custom: { directory: './pages/api', baseUrl: '/api' }
});

// OpenAPI/Swagger
await agentpass.discover({
  openapi: './openapi.json' // or URL or object
});

// Live URL crawling
await agentpass.discover({
  url: 'https://api.example.com',
  strategy: 'crawl',
  crawl: { maxDepth: 2, maxPages: 20 }
});
```

## 📚 Documentation

### Discovery Methods

AgentPass supports multiple discovery strategies:

1. **Framework Introspection**: Direct analysis of Express, Fastify, Koa apps
2. **OpenAPI/Swagger**: Automatic parsing of API specifications  
3. **URL Crawling**: Intelligent endpoint discovery through HTTP analysis
4. **Manual Definition**: Programmatic endpoint registration

### Security & Middleware

```typescript
// Add authentication
agentpass.use('auth', async (context) => {
  const token = context.headers['authorization'];
  const user = await validateToken(token);
  context.user = user;
  return user;
});

// Add authorization
agentpass.use('authz', async (context) => {
  const { user, endpoint } = context;
  if (endpoint.path.startsWith('/admin') && !user.isAdmin) {
    throw new Error('Forbidden');
  }
  return true;
});

// Rate limiting
import { RateLimiter } from 'agentpass/middleware';
const rateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // requests per window
});
agentpass.use('pre', rateLimiter.middleware());
```

### Response Transformation

```typescript
// Transform responses for MCP
agentpass.use('post', async (context, response) => {
  // Add metadata
  return {
    ...response,
    _metadata: {
      timestamp: new Date().toISOString(),
      endpoint: context.endpoint.id
    }
  };
});
```

## 🔧 MCP Server Configuration

### Transport Types

AgentPass supports multiple MCP transport types:

#### stdio Transport
Perfect for desktop applications like Claude Desktop:

```typescript
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio',
  baseUrl: 'http://localhost:3000'
});

await mcpServer.start();
// Server communicates via stdin/stdout
```

#### HTTP Transport  
For web clients and remote access:

```typescript
const mcpServer = await agentpass.generateMCPServer({
  transport: 'http',
  port: 3001,
  host: 'localhost',
  cors: true,
  baseUrl: 'http://localhost:3000'
});

await mcpServer.start();
// Server available at http://localhost:3001/mcp
```

### Custom Tool Configuration

```typescript
const mcpServer = await agentpass.generateMCPServer({
  // Custom tool naming
  toolNaming: (endpoint) => {
    const method = endpoint.method.toLowerCase();
    const resource = endpoint.path.split('/').pop();
    return `${method}_${resource}`;
  },
  
  // Custom descriptions
  toolDescription: (endpoint) => {
    return `${endpoint.method} ${endpoint.path} - ${endpoint.description}`;
  },
  
  // Server capabilities
  capabilities: {
    tools: true,
    resources: false,
    prompts: false,
    logging: false
  }
});
```

### Server Lifecycle Management

```typescript
// Check server status
console.log(mcpServer.isRunning()); // false

// Start the server
await mcpServer.start();
console.log(mcpServer.isRunning()); // true

// Get server address (HTTP transport only)
if (mcpServer.transport.type === 'http') {
  console.log(mcpServer.getAddress()); // http://localhost:3001
}

// Stop the server
await mcpServer.stop();
console.log(mcpServer.isRunning()); // false
```

### Integration with Claude Desktop

1. **Create your MCP server script**:

```typescript
// mcp-server.ts
import { AgentPass } from 'agentpass';
import express from 'express';

const agentpass = new AgentPass({
  name: 'my-api-mcp-server',
  version: '1.0.0'
});

// Discover from your Express app
await agentpass.discover({ app: myExpressApp, framework: 'express' });

// Generate stdio MCP server
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio',
  baseUrl: 'http://localhost:3000' // Your API server
});

await mcpServer.start();
```

2. **Build and configure Claude Desktop**:

```bash
# Build your TypeScript
npm run build

# Add to claude_desktop_config.json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["dist/mcp-server.js"]
    }
  }
}
```

3. **Restart Claude Desktop** - Your API endpoints will be available as tools!

## 🎯 Framework Support

AgentPass supports all major Node.js frameworks:

| Framework | Status | Discovery Method | Features |
|-----------|--------|------------------|----------|
| **Express.js** | ✅ Full | Route Introspection | Middleware analysis, nested routers, parameter detection |
| **Fastify** | ✅ Full | Schema Introspection | JSON schema validation, route metadata, performance optimized |
| **Koa** | ✅ Full | Router Analysis | koa-router support, middleware chain analysis, async/await |
| **NestJS** | ✅ Full | Decorator Analysis | TypeScript decorators, dependency injection, modular architecture |
| **Next.js** | ✅ Full | File System Scanning | API routes discovery, dynamic routes, App/Pages router |
| **OpenAPI/Swagger** | ✅ Full | Specification Parsing | Complete OpenAPI 3.0 support, schema generation |
| **URL Crawling** | ✅ Full | Live Endpoint Discovery | Intelligent crawling, response analysis, parameter inference |

## 🔌 Plugins

Extend AgentPass with plugins:

```typescript
const openAPIPlugin = {
  name: 'openapi-enhancer',
  onDiscover: async (endpoints) => {
    // Enhance endpoints with OpenAPI metadata
  },
  onGenerate: async (mcpConfig) => {
    // Modify MCP configuration
  }
};

agentpass.plugin('openapi', openAPIPlugin);
```

## 🛡️ Security Best Practices

1. **Always use authentication** for production deployments
2. **Implement rate limiting** to prevent abuse
3. **Use HTTPS** for all communications
4. **Validate input parameters** and request bodies
5. **Audit log** all MCP tool invocations
6. **Apply principle of least privilege** for authorization

## 📋 API Reference

### AgentPass Class

```typescript
class AgentPass {
  constructor(config: AgentPassConfig)
  
  // Discovery
  discover(options: DiscoverOptions): Promise<void>
  defineEndpoint(endpoint: EndpointDefinition): void
  
  // Middleware
  use(phase: MiddlewarePhase, middleware: Middleware): void
  
  // Transformation
  transform(transformer: EndpointTransformer): void
  
  // MCP Generation
  generateMCPServer(options?: MCPOptions): Promise<MCPServer>
  
  // Plugins
  plugin(name: string, plugin: Plugin): void
}
```

### Configuration Types

```typescript
interface AgentPassConfig {
  name: string;
  version: string;
  description?: string;
  metadata?: Record<string, any>;
}

interface DiscoverOptions {
  app?: any;                    // Framework app instance
  framework?: string;           // 'express' | 'fastify' | 'koa'
  url?: string;                 // Base URL for discovery
  strategy?: 'openapi' | 'crawl' | 'auto';
  openapi?: string | object;    // OpenAPI spec
  include?: string[];           // Include patterns
  exclude?: string[];           // Exclude patterns
}
```

## 🧪 Examples

### E-commerce API

```typescript
import { AgentPass } from '@agentpass/typescript-sdk';

const agentpass = new AgentPass({
  name: 'ecommerce-api',
  version: '1.0.0'
});

// Discover endpoints
await agentpass.discover({ app: expressApp });

// Add business logic validation
agentpass.use('pre', async (context) => {
  if (context.endpoint.path === '/orders' && 
      context.endpoint.method === 'POST') {
    // Validate inventory
    await validateInventory(context.params.items);
  }
});

// Enhanced tool descriptions
agentpass.transform((endpoint) => {
  const descriptions = {
    'GET /products': 'Search and list products with filtering',
    'POST /orders': 'Create a new order with items and shipping'
  };
  endpoint.description = descriptions[`${endpoint.method} ${endpoint.path}`];
  return endpoint;
});

const mcpServer = await agentpass.generateMCPServer({
  toolNaming: (endpoint) => {
    const action = endpoint.method.toLowerCase();
    const resource = endpoint.path.split('/')[1];
    return `${action}_${resource}`;
  }
});
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/agentpass/agentpass-sdk.git
cd agentpass-sdk

# Install dependencies
npm install

# Build the project
npm run build

# Start development mode
npm run dev

# Run linting
npm run lint
```

## 🚀 Deployment

### As an MCP Server

```bash
# Build the project
npm run build

# Start MCP server
node dist/examples/ecommerce/index.js
```

### Integration with Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "agentpass-api": {
      "command": "node",
      "args": ["/path/to/your/agentpass-server.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](https://docs.agentpass.dev)
- 🐛 [Issue Tracker](https://github.com/agentpass/agentpass-sdk/issues)
- 💬 [Discussions](https://github.com/agentpass/agentpass-sdk/discussions)
- 📧 [Email Support](mailto:support@agentpass.dev)

## 🗺️ Roadmap

- [ ] **v1.1**: NestJS and Next.js support
- [ ] **v1.2**: GraphQL endpoint discovery
- [ ] **v1.3**: Advanced caching strategies
- [ ] **v1.4**: Real-time WebSocket support
- [ ] **v2.0**: Multi-language SDK (Python, Go)

## 🙏 Acknowledgments

- Model Context Protocol team for the excellent MCP specification
- The open-source community for inspiration and contributions
- All contributors who help make AgentPass better

---

Made with ❤️ by the AgentPass team