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
     - `FastifyDiscoverer.ts` - Fastify schema-aware discovery with multiple access methods
     - `KoaDiscoverer.ts` - Koa/koa-router support with middleware chain analysis
     - `NestJSDiscoverer.ts` - NestJS decorator analysis and module introspection
     - `NextJSDiscoverer.ts` - Next.js API routes file system scanning
   - **Specification Discoverers**:
     - `OpenAPIDiscoverer.ts` - Complete OpenAPI/Swagger parsing with reference resolution
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
- **OpenAPI/Swagger**: Complete spec parsing with schema validation and reference resolution
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
| **OpenAPI/Swagger** | ✅ Full | ✅ E2E Validated | Complete spec parsing, reference resolution, schema generation |
| **NestJS** | ✅ Implementation | ⚠️ Ready | Decorator analysis, dependency injection, modular architecture |
| **Next.js** | ✅ Implementation | ⚠️ Ready | File system scanning, API routes, dynamic routes |

## API Surface & Usage Patterns

### Core Usage
```typescript
import { AgentPass } from 'agentpass';

const agentpass = new AgentPass({
  name: 'my-api-service',
  version: '1.0.0',
  description: 'My API exposed as MCP tools'
});

// Auto-discover from Express app
await agentpass.discover({ app: expressApp, framework: 'express' });

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
- **Framework Integration**: Real framework app discovery and MCP generation
- **Real MCP Communication**: Using official MCP SDK clients for all transports
- **Transport Validation**: HTTP (StreamableHTTP), SSE, stdio transport testing
- **OpenAPI Parsing**: Complete specification parsing and tool generation
- **Documentation Validation**: All README examples tested at runtime

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

### Production-Ready Examples (`examples/complete-servers/`)

**Common Architecture** - All examples use shared API implementation:
- **Sample Data**: Realistic business data (users, projects, departments)
- **REST Endpoints**: Standardized CRUD operations with filtering and pagination
- **Tool Naming**: Business-friendly MCP tool names
- **Error Handling**: Comprehensive HTTP status code handling

**Key Endpoints** (shared across all examples):
- `GET /api/users` - User management with filtering (`?role=admin&department=Engineering`)
- `GET /api/users/:id` - Individual user details with department info
- `POST /api/users` - Create new users with validation
- `GET /api/projects` - Project listing with status filtering
- `GET /api/departments` - Department information with budget data
- `GET /api/analytics/overview` - Business analytics dashboard

#### 1. stdio Transport (`stdio-server.ts`)
**Purpose**: Claude Desktop integration via stdin/stdout
```bash
npm run example:complete:stdio
```
- **Real Express API**: Complete REST API with business logic
- **Auto-Discovery**: Discovers all Express routes automatically
- **MCP Generation**: Converts to 6 MCP tools with business-friendly names
- **Claude Desktop Ready**: Direct integration via claude_desktop_config.json

#### 2. SSE Transport (`sse-server.ts`)
**Purpose**: mcp-remote + Claude Desktop integration
```bash
npm run example:complete:sse
```
- **Same API**: Identical REST endpoints using shared module
- **SSE Transport**: Server-Sent Events with HTTP POST for bidirectional communication
- **mcp-remote Compatible**: Works with mcp-remote package for Claude Desktop bridge
- **Session Management**: Proper session ID handling

#### 3. HTTP Transport (`http-server.ts`)
**Purpose**: Web clients and direct HTTP access
```bash
npm run example:complete:http
```
- **Same API**: Identical REST endpoints using shared module
- **StreamableHTTP**: Uses official MCP SDK StreamableHTTPServerTransport
- **Full Protocol**: Complete MCP initialization handshake
- **CORS Enabled**: Browser-compatible with proper CORS headers

### Shared Utilities (`examples/complete-servers/shared/`)

**api-data.ts** - Common API implementation:
- **Tool Naming Strategy**: Consistent MCP tool naming across all transports
- **Tool Descriptions**: Business-friendly descriptions for AI assistants
- **Sample Data**: Realistic datasets for demonstration
- **Endpoint Configuration**: Standardized REST API structure

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

# Example Execution
npm run example:express
npm run example:fastify
npm run example:openapi
npm run example:ecommerce

# Complete MCP Servers
npm run example:complete:stdio    # Claude Desktop
npm run example:complete:http     # Web clients  
npm run example:complete:sse      # mcp-remote
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
├── complete-servers/  # Production-ready examples
│   ├── stdio-server.ts    # Claude Desktop (stdio)
│   ├── http-server.ts     # Web clients (HTTP)
│   ├── sse-server.ts      # mcp-remote (SSE)
│   └── shared/           # Shared API implementation
│       └── api-data.ts
├── express/           # Express.js integration
├── fastify/           # Fastify integration
├── openapi/           # OpenAPI parsing
├── ecommerce/         # Complex business logic
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