# AgentPass TypeScript SDK - Development Guide

## Project Overview

**AgentPass** is an open-source TypeScript SDK that bridges HTTP APIs with the Model Context Protocol (MCP). It automatically discovers endpoints from web frameworks and generates MCP-compliant servers that allow AI assistants to interact with existing APIs.

## Core Architecture

### Main Components

1. **AgentPass Core** (`src/core/`)
   - `AgentPass.ts` - Main orchestrator class that coordinates discovery, middleware, and MCP generation
   - `types.ts` - Comprehensive type definitions for the entire SDK
   - `constants.ts` - Framework constants and event types
   - `EventEmitter.ts` - Custom event emitter for lifecycle events

2. **Discovery System** (`src/discovery/`)
   - **Base**: `BaseDiscoverer.ts` - Abstract base class for all discoverers
   - **Framework Discoverers**:
     - `ExpressDiscoverer.ts` - Express.js route introspection
     - `FastifyDiscoverer.ts` - Fastify schema and route analysis
     - `KoaDiscoverer.ts` - Koa/koa-router support
     - `NestJSDiscoverer.ts` - NestJS decorator analysis
     - `NextJSDiscoverer.ts` - Next.js API routes discovery
   - **Specification Discoverers**:
     - `OpenAPIDiscoverer.ts` - OpenAPI/Swagger spec parsing
     - `URLDiscoverer.ts` - Live endpoint crawling and discovery

3. **MCP Generation** (`src/mcp/`)
   - `MCPGenerator.ts` - Converts discovered endpoints to MCP tools and servers
   - Supports multiple transports: `stdio`, `http`, `sse`
   - Handles tool naming, schema generation, and HTTP request routing

4. **Middleware System** (`src/middleware/`)
   - `MiddlewareRunner.ts` - Executes middleware pipeline (auth, authz, pre, post, error)
   - `auth/ApiKeyAuth.ts` - Built-in API key authentication
   - `rateLimit/RateLimit.ts` - Rate limiting middleware

5. **Plugin Architecture** (`src/plugins/`)
   - `BasePlugin.ts` - Plugin interface for extensibility
   - Hooks: `onDiscover`, `onGenerate`, `onStart`, `onStop`

## Key Features

### 🔍 Auto-Discovery
- **Framework Introspection**: Direct analysis of Express, Fastify, Koa, NestJS, Next.js apps
- **OpenAPI/Swagger**: Automatic parsing of API specifications
- **URL Crawling**: Intelligent endpoint discovery through HTTP analysis
- **Manual Definition**: Programmatic endpoint registration

### 🔒 Security & Middleware
- **Authentication**: Built-in support for API keys, Bearer tokens, custom auth
- **Authorization**: Role-based access control
- **Rate Limiting**: Configurable request throttling
- **Pre/Post Processing**: Request/response transformation pipeline

### 🧩 MCP Integration
- **Multiple Transports**: stdio (Claude Desktop), HTTP (web clients), SSE (mcp-remote)
- **Tool Generation**: Automatic conversion of endpoints to MCP tools
- **Schema Inference**: JSON Schema generation from endpoint parameters
- **Error Handling**: Comprehensive error propagation and handling

## Example Usage Patterns

### Basic Framework Discovery
```typescript
const agentpass = new AgentPass({
  name: 'my-api-service',
  version: '1.0.0'
});

// Express discovery
await agentpass.discover({ app: expressApp, framework: 'express' });

// Generate MCP server
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio',
  baseUrl: 'http://localhost:3000'
});
```

### Advanced Configuration
```typescript
// Add authentication middleware
agentpass.use('auth', async (context) => {
  const token = context.headers['authorization'];
  return await validateToken(token);
});

// Custom tool naming
const mcpServer = await agentpass.generateMCPServer({
  toolNaming: (endpoint) => `${endpoint.method.toLowerCase()}_${endpoint.path.split('/').pop()}`,
  transport: 'http',
  port: 3001,
  cors: true
});
```

## Development Workflow

### Building and Testing
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test                # All tests
npm run test:unit       # Unit tests only
npm run test:e2e        # E2E tests only
npm run test:coverage   # With coverage

# Development mode
npm run dev             # Watch mode compilation

# Linting
npm run lint
npm run lint:fix
```

### Project Structure
```
src/
├── core/              # Core AgentPass logic
├── discovery/         # Endpoint discovery implementations
├── mcp/              # MCP server generation
├── middleware/       # Middleware implementations
├── plugins/          # Plugin system
└── index.ts          # Main exports

examples/             # Usage examples (reorganized)
├── basic/            # Getting started examples
│   └── getting-started.ts
├── frameworks/       # Framework-specific examples
│   ├── express/      # Express.js integration
│   ├── fastify/      # Fastify integration
│   └── koa/         # Koa integration
├── advanced/         # Complex use cases
│   └── ecommerce-api.ts
├── integrations/     # Third-party integrations
│   └── openapi-petstore.ts
├── complete-servers/ # Production-ready examples
│   ├── stdio-server.ts    # stdio transport
│   ├── http-server.ts     # HTTP transport
│   ├── sse-server.ts      # SSE transport
│   └── shared/           # Shared utilities
│       └── api-data.ts
├── run-example.js    # Transport selection script
└── tsconfig.json     # TypeScript config for examples

tests/
├── e2e/              # End-to-end tests
├── AgentPass.test.ts
└── setup.ts
```

## Transport Types

### stdio Transport (Claude Desktop)
- Uses stdin/stdout for communication
- Perfect for desktop AI applications
- Configuration in `claude_desktop_config.json`
- Example: `examples/complete-servers/stdio-server.ts`

### SSE Transport (mcp-remote + Claude Desktop)
- Server-Sent Events with HTTP POST for messages
- Uses `mcp-remote` package to bridge SSE to Claude Desktop
- Endpoints: `GET /sse` (stream), `POST /sse/messages` (bidirectional)
- Example: `examples/complete-servers/sse-server.ts`

### HTTP Transport (Web Clients)
- RESTful JSON-RPC 2.0 over HTTP
- CORS support for browser clients
- Endpoint: `POST /mcp`
- Example: `examples/complete-servers/http-server.ts`

## Complete MCP Server Examples

### stdio Transport (`examples/complete-servers/stdio-server.ts`)
Demonstrates a full implementation for Claude Desktop:
1. **Express API Server**: Real REST API with company management endpoints
2. **Auto-Discovery**: Automatically discovers all Express routes
3. **MCP Generation**: Converts endpoints to MCP tools
4. **stdio Transport**: Direct Claude Desktop integration via stdin/stdout

### SSE Transport (`examples/complete-servers/sse-server.ts`)
Demonstrates SSE transport for mcp-remote + Claude Desktop:
1. **Same Express API**: Identical REST API endpoints using shared module
2. **SSE Transport**: Server-Sent Events with HTTP POST for bidirectional communication
3. **mcp-remote Ready**: Designed for mcp-remote package integration
4. **URL Parsing**: Handles sessionId query parameters correctly

### HTTP Transport (`examples/complete-servers/http-server.ts`)
Demonstrates HTTP transport for web clients:
1. **Same Express API**: Identical REST API endpoints using shared module
2. **HTTP Transport**: RESTful JSON-RPC 2.0 over HTTP with CORS support
3. **Web Client Ready**: Suitable for browser-based AI assistants and testing
4. **Testing Tools**: Includes curl examples for manual testing

### Shared API Data (`examples/complete-servers/shared/api-data.ts`)
All complete server examples use a shared API implementation:
- **Sample Data**: Users, projects, departments with realistic business data
- **Common Endpoints**: Standardized REST API endpoints
- **Tool Naming**: Consistent MCP tool naming strategy
- **Tool Descriptions**: Business-friendly descriptions for AI assistants

Key endpoints in all examples:
- `GET /api/users` - User management with filtering and pagination
- `GET /api/users/:id` - Individual user details
- `POST /api/users` - Create new users
- `GET /api/projects` - Project listing with status filtering
- `GET /api/departments` - Department information
- `GET /api/analytics/overview` - Business analytics
- `GET /api/health` - Health check endpoint

## Testing Strategy

### Unit Tests
- Core functionality testing
- Discoverer implementations
- Middleware pipeline
- MCP tool generation

### E2E Tests
- Framework integration tests
- Real MCP server communication
- End-to-end workflow validation
- OpenAPI specification parsing

### Test Coverage
- Comprehensive coverage across all modules
- Integration with Jest and ts-jest
- Automated test execution in CI/CD

## Common Commands

```bash
# Lint and type check (run before commits)
npm run lint && npm run build

# Run specific test suites
npm run test:unit
npm run test:e2e

# Example execution
npm run example:getting-started
npm run example:express
npm run example:fastify
npm run example:koa
npm run example:ecommerce
npm run example:openapi

# Examples with transport selection
npm run example:express -- --transport=http
npm run example:express -- --transport=sse

# Complete MCP servers
npm run example:complete:stdio    # stdio transport for Claude Desktop
npm run example:complete:sse      # SSE transport for mcp-remote + Claude Desktop
npm run example:complete:http     # HTTP transport for web clients
```

## Development Notes

### Type Safety
- Full TypeScript implementation with strict typing
- Comprehensive interfaces for all components
- JSON Schema validation for runtime type checking

### Error Handling
- Custom error classes: `AgentPassError`, `DiscoveryError`, `MCPError`, `MiddlewareError`
- Detailed error context and stack traces
- Graceful fallback mechanisms

### Performance
- Efficient endpoint discovery algorithms
- Configurable request timeouts and concurrency limits
- Memory-efficient event handling

### Extensibility
- Plugin architecture for custom functionality
- Middleware system for request/response processing
- Custom discoverer registration
- Flexible tool naming and description strategies

## Dependencies

### Core Dependencies
- `@modelcontextprotocol/sdk` - Official MCP SDK
- `axios` - HTTP client for endpoint testing
- `express`, `fastify`, `koa` - Framework support (peer deps)
- `swagger-parser` - OpenAPI specification parsing
- `jsonwebtoken` - JWT token handling
- `lodash` - Utility functions
- `uuid` - Unique identifier generation

### Development Dependencies
- `typescript` - TypeScript compiler
- `jest` - Testing framework
- `eslint` - Code linting
- Framework type definitions

This SDK provides a complete solution for bridging HTTP APIs with the Model Context Protocol, enabling seamless AI assistant integration with existing web services.