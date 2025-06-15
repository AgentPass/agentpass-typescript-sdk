# AgentPass TypeScript SDK - Development Guide

## Project Overview

**AgentPass** is a production-ready TypeScript SDK that automatically bridges HTTP APIs with the Model Context Protocol (MCP). It discovers endpoints from popular web frameworks and generates MCP-compliant servers, enabling AI assistants like Claude Desktop to seamlessly interact with existing REST APIs.

## Core Architecture

### Main Components

1. **AgentPass Core** (`src/core/`)
   - `AgentPass.ts` - Main orchestrator class coordinating discovery, middleware, and MCP generation
   - `types.ts` - Comprehensive type definitions (~350 lines) covering all interfaces and schemas
   - `constants.ts` - Framework constants, HTTP status codes, and event types
   - `EventEmitter.ts` - Custom event system for lifecycle management and monitoring

2. **Discovery System** (`src/discovery/`)
   - **Base**: `BaseDiscoverer.ts` - Abstract base class with logging and validation
   - **Framework Discoverers**:
     - `ExpressDiscoverer.ts` - Express.js route introspection and middleware analysis
     - `FastifyDiscoverer.ts` - Fastify schema-aware discovery with intelligent inject() method probing
     - `KoaDiscoverer.ts` - Koa/koa-router support with middleware chain analysis  
     - `NestJSDiscoverer.ts` - NestJS decorator analysis and module introspection
     - `NextJSDiscoverer.ts` - Next.js API routes file system scanning
   - **Specification Discoverers**:
     - `OpenAPIDiscoverer.ts` - Complete OpenAPI/Swagger parsing with real HTTP fetching and reference resolution
     - `URLDiscoverer.ts` - Live endpoint crawling with intelligent pattern detection

3. **MCP Generation** (`src/mcp/`)
   - `MCPGenerator.ts` - Converts discovered endpoints to MCP tools and servers
   - **Transport Support**: stdio, HTTP (StreamableHTTP), SSE with proper lifecycle management
   - **Schema Generation**: Automatic JSON Schema inference from endpoint parameters
   - **Tool Creation**: Custom naming strategies and business-friendly descriptions

4. **Middleware System** (`src/middleware/`)
   - `MiddlewareRunner.ts` - Executes middleware pipeline: auth → authz → pre → post → error
   - `auth/ApiKeyAuth.ts` - Built-in API key authentication with configurable headers/params
   - `rateLimit/RateLimit.ts` - Memory-based rate limiting with automatic cleanup

5. **Plugin Architecture** (`src/plugins/`)
   - `BasePlugin.ts` - Extensible plugin interface with lifecycle hooks
   - Hooks: `onDiscover`, `onGenerate`, `onStart`, `onStop`
   - Automatic middleware and transformer registration

## Key Technical Features

### 🔍 Auto-Discovery Capabilities
- **Framework Introspection**: Direct analysis of Express, Fastify, Koa, NestJS, Next.js app instances
  - **Express**: Route introspection via app._router analysis
  - **Fastify**: Advanced route discovery using inject() method probing and register() pattern support
  - **Koa**: Router middleware chain analysis
- **OpenAPI/Swagger**: Complete spec parsing with real HTTP fetching, schema validation and reference resolution
- **URL Crawling**: Intelligent endpoint discovery through HTTP response analysis
- **Manual Definition**: Programmatic endpoint registration for custom scenarios

### 🚀 MCP Transport Implementation

**stdio Transport (Claude Desktop):**
- Uses official MCP SDK `StdioServerTransport`
- stdin/stdout communication protocol
- Perfect for desktop AI applications

**HTTP Transport (Web Clients):**
- Uses official MCP SDK `StreamableHTTPServerTransport` 
- Full MCP protocol initialization handshake
- Session management with UUID generation
- CORS support for browser clients

**SSE Transport (mcp-remote):**
- Uses official MCP SDK `SSEServerTransport`
- Server-Sent Events with HTTP POST for bidirectional communication
- Compatible with mcp-remote package for Claude Desktop bridge

### 🔒 Security & Middleware Pipeline
- **Authentication**: API key, Bearer token, custom validators with context propagation
- **Authorization**: Role-based access control with endpoint-level permissions
- **Rate Limiting**: Configurable windows, custom key generation, automatic cleanup
- **Request/Response Processing**: Transform, validate, enhance data flow

### 🧩 Framework Support Matrix

| Framework | Discovery | Test Status | Implementation |
|-----------|-----------|-------------|----------------|
| **Express.js** | ✅ Full | ✅ E2E Validated | Route introspection, middleware analysis, nested routers |
| **Fastify** | ✅ Full | ✅ E2E Validated | Schema introspection, route tree access, performance optimized |
| **Koa** | ✅ Implementation | ⚠️ Ready | koa-router support, middleware chain analysis |
| **OpenAPI/Swagger** | ✅ Full | ✅ E2E Validated | Real HTTP fetching, complete spec parsing, reference resolution, schema generation |
| **NestJS** | ✅ Implementation | ⚠️ Ready | Decorator analysis, dependency injection, modular architecture |
| **Next.js** | ✅ Implementation | ⚠️ Ready | File system scanning, API routes, dynamic routes |

## API Surface & Usage Patterns

### Core Usage
```typescript
import { AgentPass } from 'agentpass';

// Create AgentPass instance with auto-discovery
const agentpass = await AgentPass.create({
  name: 'my-api-service',
  version: '1.0.0',
  description: 'My API exposed as MCP tools',
  app: expressApp,
  framework: 'express'
});

// Generate MCP server with any transport
const mcpServer = await agentpass.generateMCPServer({
  transport: 'stdio', // or 'http' or 'sse'
  baseUrl: 'http://localhost:3000'
});

await mcpServer.start();
```

### Advanced Configuration
```typescript
// Authentication middleware
agentpass.use('auth', async (context) => {
  const token = context.request.headers['authorization'];
  context.user = await validateToken(token);
});

// Authorization middleware
agentpass.use('authz', async (context) => {
  return hasPermission(context.user, context.endpoint);
});

// Rate limiting
const rateLimit = new RateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
agentpass.use('pre', rateLimit.middleware());

// Custom tool naming
const mcpServer = await agentpass.generateMCPServer({
  toolNaming: (endpoint) => `${endpoint.method.toLowerCase()}_${getResource(endpoint.path)}`,
  toolDescription: (endpoint) => `${getAction(endpoint.method)} ${getResource(endpoint.path)}`,
  transport: 'http',
  port: 3001,
  cors: true
});
```

## Testing Strategy & Implementation

### Comprehensive Test Suite

**Unit Tests** (`tests/*.test.ts`):
- Core AgentPass functionality
- Discoverer implementations
- Middleware pipeline execution
- MCP tool generation logic
- Plugin system integration

**E2E Tests** (`tests/e2e/`):
- **Express Integration**: Complete stdio/HTTP/SSE transport testing with real MCP SDK clients
- **Fastify Integration**: Complete stdio/HTTP/SSE transport testing with real MCP SDK clients
- **OpenAPI Integration**: Complete stdio/HTTP/SSE transport testing with real external API fetching
- **Real MCP Communication**: Using official `@modelcontextprotocol/sdk` clients (no raw HTTP calls)
- **Transport Validation**: 
  - stdio: `StdioClientTransport` for Claude Desktop integration
  - HTTP: `StreamableHTTPClientTransport` for web clients  
  - SSE: `SSEClientTransport` for mcp-remote connections
- **Protocol Compliance**: Full MCP protocol handshake and session management
- **Tool Execution**: Real tool calling with response validation across all frameworks
- **Comprehensive Coverage**: 9 E2E tests (3 Express + 3 Fastify + 3 OpenAPI) covering all transports

### E2E Test Architecture
```typescript
// tests/e2e/mcp-real-clients.e2e.test.ts
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Real MCP client testing using official SDK
const httpClient = new Client({ name: "test-client", version: "1.0.0" });
await httpClient.connect(new StreamableHTTPClientTransport(new URL(serverUrl)));
const tools = await httpClient.listTools();
const result = await httpClient.callTool({ name: "get_users", arguments: {} });
```

### Test Configuration
- **Jest 29+** with TypeScript support
- **Separate test projects**: unit and e2e with different configurations
- **Coverage reporting**: Comprehensive coverage across all modules
- **Real transport testing**: Actual MCP protocol communication

## Complete MCP Server Examples

### Framework-Organized Examples

**Architecture**: Examples are organized by framework with consistent transport support:

```
examples/
├── express/                  # Express.js implementations
│   ├── api-implementation.ts    # Express-specific API server
│   └── server.ts              # Unified server with transport selection
├── fastify/                  # Fastify implementations
│   ├── api-implementation.ts    # Fastify-specific API server
│   └── server.ts              # Unified server with transport selection
├── shared/                   # Common utilities
│   └── api-data.ts            # Shared JSON data and tool utilities
└── openapi/                  # OpenAPI examples
    └── server.ts             # OpenAPI/Swagger parsing with real HTTP fetching
```

**Common API Features** (identical across Express and Fastify):
- `GET /api/users` - User management with filtering (`?role=admin&department=Engineering`)
- `GET /api/users/:id` - Individual user details with department info
- `POST /api/users` - Create new users with validation
- `GET /api/projects` - Project listing with status filtering
- `GET /api/departments` - Department information with budget data
- `GET /api/analytics/overview` - Business analytics dashboard

### Express Examples (`examples/express/`)

#### stdio Transport (`examples/express/server.ts`)
**Purpose**: Claude Desktop integration via stdin/stdout
```bash
npm run example:express:stdio
```
- **Real Express API**: Complete REST API with business logic
- **Auto-Discovery**: Discovers all Express routes automatically
- **MCP Generation**: Converts to 6 MCP tools with business-friendly names
- **Claude Desktop Ready**: Direct integration via claude_desktop_config.json

#### HTTP Transport (`examples/express/server.ts`)
**Purpose**: Web clients and direct HTTP access
```bash
npm run example:express:http
```
- **StreamableHTTP**: Uses official MCP SDK StreamableHTTPServerTransport
- **Full Protocol**: Complete MCP initialization handshake
- **CORS Enabled**: Browser-compatible with proper CORS headers
- **MCP SDK Usage**: Shows proper client connection code (no curl)

#### SSE Transport (`examples/express/server.ts`)
**Purpose**: mcp-remote + Claude Desktop integration
```bash
npm run example:express:sse
```
- **SSE Transport**: Server-Sent Events with HTTP POST for bidirectional communication
- **mcp-remote Compatible**: Works with mcp-remote package for Claude Desktop bridge
- **Session Management**: Proper session ID handling

### Fastify Examples (`examples/fastify/`)

#### stdio Transport (`examples/fastify/server.ts`)
**Purpose**: Claude Desktop integration via stdin/stdout
```bash
npm run example:fastify:stdio
```
- **Real Fastify API**: Complete REST API with async/await patterns
- **Plugin Architecture**: Uses Fastify's register() pattern for route organization
- **Auto-Discovery**: Advanced route discovery using inject() method
- **Identical Functionality**: Same 6 MCP tools as Express version

#### HTTP Transport (`examples/fastify/server.ts`)
**Purpose**: Web clients and direct HTTP access
```bash
npm run example:fastify:http
```
- **StreamableHTTP**: Uses official MCP SDK StreamableHTTPServerTransport
- **Full Protocol**: Complete MCP initialization handshake
- **CORS Enabled**: Browser-compatible with proper CORS headers
- **MCP SDK Usage**: Shows proper client connection code (no curl)

#### SSE Transport (`examples/fastify/server.ts`)
**Purpose**: mcp-remote + Claude Desktop integration
```bash
npm run example:fastify:sse
```
- **SSE Transport**: Server-Sent Events with HTTP POST for bidirectional communication
- **mcp-remote Compatible**: Works with mcp-remote package for Claude Desktop bridge
- **Session Management**: Proper session ID handling

### Shared Utilities (`examples/shared/`)

**api-data.ts** - Framework-agnostic shared resources:
- **JSON Data**: Users, projects, departments sample datasets
- **Tool Naming Strategy**: Consistent MCP tool naming across all frameworks
- **Tool Descriptions**: Business-friendly descriptions for AI assistants
- **Utility Functions**: Common helpers for consistent behavior

## Development Workflow

### Build and Test Commands
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development mode
npm run dev             # Watch mode compilation

# Testing
npm test                # All tests
npm run test:unit       # Unit tests only
npm run test:e2e        # E2E tests only (includes real MCP communication)
npm run test:coverage   # With coverage reporting

# Code Quality
npm run lint            # ESLint checking
npm run lint:fix        # ESLint with auto-fix

# Example Execution with Transport Selection
npm run example:express          # Default (SSE)
npm run example:express:stdio    # Claude Desktop
npm run example:express:http     # Web clients
npm run example:express:sse      # mcp-remote
npm run example:fastify          # Default (SSE)
npm run example:fastify:stdio    # Claude Desktop
npm run example:fastify:http     # Web clients
npm run example:fastify:sse      # mcp-remote
npm run example:openapi          # OpenAPI/Swagger parsing
```

### Project Structure
```
src/
├── core/                 # Core AgentPass logic
│   ├── AgentPass.ts     # Main orchestrator class
│   ├── types.ts         # Type definitions (~350 lines)
│   ├── constants.ts     # Constants and defaults
│   └── EventEmitter.ts  # Event system
├── discovery/           # Endpoint discovery implementations
│   ├── base/           # Base discoverer class
│   ├── express/        # Express.js discovery
│   ├── fastify/        # Fastify discovery  
│   ├── koa/           # Koa discovery
│   ├── nestjs/        # NestJS discovery
│   ├── nextjs/        # Next.js discovery
│   ├── openapi/       # OpenAPI parsing
│   └── url/           # URL crawling
├── mcp/                # MCP server generation
│   └── MCPGenerator.ts # MCP tools and server creation
├── middleware/         # Middleware implementations
│   ├── MiddlewareRunner.ts # Pipeline execution
│   ├── auth/          # Authentication middleware
│   └── rateLimit/     # Rate limiting
├── plugins/           # Plugin system
│   └── BasePlugin.ts  # Plugin interface
└── index.ts           # Main exports

examples/              # Comprehensive examples
├── express/           # Express framework examples
│   └── server.ts      # Unified server (all transports)
├── fastify/           # Fastify framework examples
│   └── server.ts      # Unified server (all transports)
├── shared/           # Shared API implementation
│   └── api-data.ts
├── openapi/          # OpenAPI examples
│   └── server.ts
└── tsconfig.json      # Examples TypeScript config

tests/
├── e2e/              # End-to-end tests
│   ├── mcp-real-clients.e2e.test.ts  # Real MCP clients
│   ├── express.e2e.test.ts           # Express integration
│   ├── fastify.e2e.test.ts           # Fastify integration
│   └── openapi.e2e.test.ts           # OpenAPI parsing
├── AgentPass.test.ts  # Unit tests
└── setup.ts          # Test configuration
```

## Transport Implementation Details

### stdio Transport (Claude Desktop)
- **Protocol**: MCP over stdin/stdout
- **Use Case**: Local development, Claude Desktop integration
- **Server Transport**: `StdioServerTransport` from MCP SDK
- **Configuration**: claude_desktop_config.json
- **Process Model**: Long-running Node.js process

### HTTP Transport (Web Clients)  
- **Protocol**: MCP over HTTP with StreamableHTTP specification
- **Use Case**: Web applications, browser clients, testing tools
- **Server Transport**: `StreamableHTTPServerTransport` from MCP SDK
- **Features**: Session management, CORS, full MCP initialization
- **Endpoints**: `POST /mcp` (messages), `GET /mcp` (SSE stream), `DELETE /mcp` (session)

### SSE Transport (mcp-remote)
- **Protocol**: Server-Sent Events with HTTP POST for bidirectional communication
- **Use Case**: Remote Claude Desktop connections via mcp-remote package
- **Server Transport**: `SSEServerTransport` from MCP SDK
- **Endpoints**: `GET /sse` (SSE stream), `POST /sse/messages` (bidirectional)
- **Session Management**: Proper session ID handling and cleanup

## Dependencies & Technology Stack

### Core Dependencies
- **`@modelcontextprotocol/sdk@^1.12.3`** - Official MCP implementation (latest version)
- **`axios@^1.6.0`** - HTTP client for endpoint testing and API calls
- **`swagger-parser@^10.0.3`** - OpenAPI specification parsing and validation
- **`jsonwebtoken@^9.0.2`** - JWT authentication support
- **`express-rate-limit@^7.1.0`** - Rate limiting utilities
- **`lodash@^4.17.21`** - Utility functions
- **`uuid@^9.0.1`** - Unique identifier generation

### Development Stack
- **TypeScript 5.3+** - Modern language features with strict typing
- **Node.js 18+** - LTS runtime environment
- **Jest 29+** - Testing framework with TypeScript support
- **ESLint** - Code quality and consistency
- **Framework Peers**: Express, Fastify, Koa as optional peer dependencies

### Type Safety & Error Handling
- **Strict TypeScript**: Full type safety with comprehensive interfaces
- **Custom Error Classes**: `AgentPassError`, `DiscoveryError`, `MCPError`, `MiddlewareError`
- **JSON Schema Validation**: Runtime type checking for API schemas
- **Graceful Fallbacks**: Comprehensive error recovery mechanisms

## Production Readiness Features

### Performance
- **Efficient Discovery**: Optimized endpoint extraction algorithms
- **Memory Management**: Automatic cleanup and resource management  
- **Concurrent Handling**: Configurable request limits and timeouts
- **Event-Driven Architecture**: Non-blocking event emitter for lifecycle management

### Monitoring & Observability
- **Lifecycle Events**: Comprehensive event system for monitoring
- **Detailed Logging**: Structured logging with configurable levels
- **Error Context**: Rich error information for debugging and monitoring
- **Metrics**: Built-in rate limiting statistics and request tracking

### Extensibility
- **Plugin System**: Lifecycle hooks for custom functionality
- **Middleware Pipeline**: Flexible request/response processing
- **Custom Discoverers**: Register custom discovery strategies
- **Transformer Functions**: Endpoint modification and enhancement

This development guide provides a complete overview of the AgentPass TypeScript SDK architecture, implementation details, and development workflow. The SDK is production-ready with comprehensive testing, multiple transport support, and enterprise-grade features.