# Changelog

All notable changes to the AgentPass TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-15

### Added

#### Core Features
- **AgentPass SDK**: Main class for endpoint discovery and MCP generation
- **Event System**: Built-in event emitter for monitoring and debugging
- **Type System**: Comprehensive TypeScript definitions for all components

#### Discovery System
- **BaseDiscoverer**: Abstract base class for creating custom discoverers
- **ExpressDiscoverer**: Automatic Express.js route introspection and analysis
- **FastifyDiscoverer**: Fastify application introspection with JSON schema support
- **KoaDiscoverer**: Koa.js application analysis with koa-router support
- **NestJSDiscoverer**: NestJS decorator analysis and dependency injection support
- **NextJSDiscoverer**: Next.js API routes discovery with file system scanning
- **OpenAPIDiscoverer**: Parse OpenAPI/Swagger specifications from files, URLs, or objects
- **URLDiscoverer**: Live endpoint discovery through intelligent URL crawling
- **Auto-Detection**: Intelligent framework and strategy detection
- **Filtering**: Include/exclude patterns for endpoint filtering

#### MCP Generation
- **MCPGenerator**: Convert HTTP endpoints to Model Context Protocol tools
- **Tool Creation**: Automatic tool registration with MCP server
- **Schema Generation**: JSON Schema creation from endpoint parameters
- **Custom Naming**: Configurable tool naming strategies
- **Request Handling**: Full HTTP request/response lifecycle management

#### Middleware System
- **Pipeline Architecture**: Configurable middleware phases (auth, authz, pre, post, error)
- **MiddlewareRunner**: Orchestrates middleware execution
- **API Key Authentication**: Built-in API key validation middleware
- **Rate Limiting**: Request rate limiting with configurable windows
- **Context Passing**: Rich context object for middleware communication

#### Plugin System
- **BasePlugin**: Abstract base class for creating plugins
- **Lifecycle Hooks**: onDiscover, onGenerate, onStart, onStop hooks
- **Middleware Integration**: Plugins can contribute middleware
- **Transformer System**: Endpoint transformation capabilities

### Examples
- **E-commerce API**: Comprehensive example with products, orders, and admin endpoints
- **Basic Express**: Simple CRUD API demonstration
- **OpenAPI Petstore**: Integration with external OpenAPI specifications

### Documentation
- **Comprehensive README**: Installation, usage, and API documentation
- **Contributing Guide**: Development setup and contribution guidelines
- **TypeScript Support**: Full type definitions and IntelliSense support
- **Code Examples**: Real-world usage patterns and best practices

### Developer Experience
- **TypeScript First**: Built with TypeScript for better developer experience
- **Jest Testing**: Comprehensive test framework setup
- **ESLint Configuration**: Code quality and consistency enforcement
- **Build System**: TypeScript compilation with source maps and declarations

### Framework Support
- **Express.js**: Full introspection support for route discovery, middleware analysis, nested routers
- **Fastify**: High-performance framework support with JSON schema integration
- **Koa.js**: Middleware-focused framework with koa-router support
- **NestJS**: Enterprise framework with decorator analysis and modular architecture
- **Next.js**: API routes discovery with dynamic route support and file system scanning
- **OpenAPI/Swagger**: Complete specification parsing and endpoint extraction
- **URL Crawling**: Live endpoint discovery for any HTTP service
- **Extensible Architecture**: Easy to add support for additional frameworks

### Security Features
- **Authentication Pipeline**: Pluggable authentication strategies
- **Authorization Rules**: Fine-grained access control per endpoint
- **Input Validation**: Parameter and request body validation
- **Error Handling**: Secure error handling and sanitization

### Performance
- **Efficient Discovery**: Optimized endpoint extraction algorithms
- **Memory Management**: Efficient memory usage for large APIs
- **Concurrent Processing**: Parallel middleware execution where possible
- **Caching Support**: Built-in response caching capabilities

---

### Initial Release Notes

This is the first major release of the AgentPass SDK, providing a complete solution for bridging HTTP APIs with the Model Context Protocol. The SDK enables AI assistants to interact with any web service through automatic endpoint discovery and MCP tool generation.

**Key Benefits:**
- ⚡ **Zero Configuration**: Works out of the box with sensible defaults
- 🔍 **Auto-Discovery**: Automatically finds and analyzes API endpoints
- 🛡️ **Security First**: Built-in authentication, authorization, and rate limiting
- 🧩 **Extensible**: Plugin architecture for custom functionality
- 📝 **Type Safe**: Full TypeScript support with comprehensive type definitions
- 🔧 **Developer Friendly**: Rich documentation and examples

**Getting Started:**
```bash
npm install @agentpass/typescript-sdk
```

**Quick Example:**
```typescript
import { AgentPass } from '@agentpass/typescript-sdk';
import express from 'express';

const app = express();
// ... define your routes

const agentpass = new AgentPass({
  name: 'my-api',
  version: '1.0.0'
});

await agentpass.discover({ app });
const mcpServer = await agentpass.generateMCPServer();
await mcpServer.start();
```

**Next Steps:**
- See the [README](README.md) for detailed usage instructions
- Check out [examples/](examples/) for complete implementations
- Read the [Contributing Guide](CONTRIBUTING.md) to get involved
- Join our community discussions for support and feedback