import { AgentPass } from '../../src';

// Example using the famous Petstore OpenAPI spec
async function main() {
  console.log('🚀 Starting OpenAPI Petstore Example...');

  try {
    // Create AgentPass instance with auto-discovery from OpenAPI spec
    const agentpass = await AgentPass.create({
      name: 'petstore-api',
      version: '1.0.0',
      description: 'Petstore API from OpenAPI specification',
      framework: 'openapi',
      openapi: 'https://petstore3.swagger.io/api/v3/openapi.json',
      baseUrl: 'https://petstore3.swagger.io/api/v3'
    });

    console.log(`📊 Discovered ${agentpass.getEndpoints().length} endpoints from OpenAPI spec:`);
    
    // Group endpoints by tags
    const endpointsByTag: Record<string, any[]> = {};
    agentpass.getEndpoints().forEach(endpoint => {
      const tag = endpoint.tags?.[0] || 'untagged';
      if (!endpointsByTag[tag]) {
        endpointsByTag[tag] = [];
      }
      endpointsByTag[tag].push(endpoint);
    });

    Object.entries(endpointsByTag).forEach(([tag, endpoints]) => {
      console.log(`\n📂 ${tag}:`);
      endpoints.forEach(endpoint => {
        console.log(`  ${endpoint.method} ${endpoint.path} - ${endpoint.summary || endpoint.description}`);
      });
    });

    // Add authentication for protected endpoints
    agentpass.use('auth', async (context) => {
      // Simple API key auth for demo
      const apiKey = context.request.headers['api_key'];
      if (!apiKey && context.endpoint.security?.length) {
        throw new Error('API key required for this endpoint');
      }
      return apiKey ? { apiKey } : null;
    });

    // Add request logging
    agentpass.use('pre', async (context) => {
      console.log(`🌐 Making request: ${context.request.method} ${context.request.path}`);
      if (context.request.params && Object.keys(context.request.params).length > 0) {
        console.log(`  📋 Params:`, context.request.params);
      }
      if (context.request.query && Object.keys(context.request.query).length > 0) {
        console.log(`  🔍 Query:`, context.request.query);
      }
    });

    // Transform responses to add metadata
    agentpass.use('post', async (context, response) => {
      return {
        ...response,
        data: {
          ...response.data,
          _petstore_metadata: {
            endpoint: context.endpoint.path,
            method: context.endpoint.method,
            timestamp: new Date().toISOString(),
            openapi_operation: context.endpoint.metadata?.operationId,
          },
        },
      };
    });

    // Generate MCP server with enhanced tool descriptions
    const mcpServer = await agentpass.generateMCPServer({
      transport: 'stdio',
      baseUrl: 'https://petstore3.swagger.io/api/v3',
      capabilities: {
        tools: true,
      },
      toolNaming: (endpoint) => {
        // Use OpenAPI operation ID if available, otherwise generate
        if (endpoint.metadata?.operationId && typeof endpoint.metadata.operationId === 'string') {
          return endpoint.metadata.operationId;
        }
        
        const method = endpoint.method.toLowerCase();
        const pathParts = endpoint.path.split('/').filter(part => part && !part.startsWith('{'));
        const resource = pathParts[pathParts.length - 1] || 'resource';
        
        return `${method}_${resource}`;
      },
      toolDescription: (endpoint) => {
        let description = endpoint.summary || endpoint.description || `${endpoint.method} ${endpoint.path}`;
        
        // Add parameter information
        const pathParams = endpoint.parameters?.filter(p => p.in === 'path') || [];
        const queryParams = endpoint.parameters?.filter(p => p.in === 'query') || [];
        
        if (pathParams.length > 0) {
          description += `\n\nPath parameters: ${pathParams.map(p => `${p.name} (${p.type})`).join(', ')}`;
        }
        
        if (queryParams.length > 0) {
          description += `\n\nQuery parameters: ${queryParams.map(p => `${p.name} (${p.type}${p.required ? ', required' : ''})`).join(', ')}`;
        }
        
        return description;
      },
      metadata: {
        source: 'OpenAPI Specification',
        documentation: 'https://petstore3.swagger.io',
      },
    });

    // Connect to stdio transport
    await mcpServer.start();

    console.log('✅ OpenAPI Petstore MCP Server started successfully');

  } catch (error) {
    console.error('❌ Failed to setup Petstore API:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

export { main as setupPetstore };