import { AgentPass } from '../../src';
import Fastify from 'fastify';

// Create Fastify app
const fastify = Fastify({
  logger: true
});

// User schema for validation
const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    email: { type: 'string', format: 'email' }
  },
  required: ['name', 'email']
};

const userResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' }
  }
};

// Define routes with schemas
fastify.get('/users', {
  schema: {
    description: 'Get list of users',
    tags: ['users'],
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 10 },
        offset: { type: 'integer', default: 0 },
        search: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: userResponseSchema
          },
          total: { type: 'integer' },
          pagination: {
            type: 'object',
            properties: {
              limit: { type: 'integer' },
              offset: { type: 'integer' },
              hasMore: { type: 'boolean' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  const { limit = 10, offset = 0, search } = request.query as any;
  
  let users = [
    { id: '1', name: 'John Doe', email: 'john@example.com', createdAt: '2024-01-01T00:00:00Z' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com', createdAt: '2024-01-02T00:00:00Z' },
  ];

  if (search) {
    users = users.filter(user => 
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    );
  }

  const paginatedUsers = users.slice(offset, offset + limit);

  return {
    users: paginatedUsers,
    total: users.length,
    pagination: {
      limit,
      offset,
      hasMore: offset + limit < users.length
    }
  };
});

fastify.get('/users/:id', {
  schema: {
    description: 'Get user by ID',
    tags: ['users'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    response: {
      200: userResponseSchema,
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params as any;
  
  if (id === '999') {
    reply.code(404);
    return { error: 'Not Found', message: 'User not found' };
  }

  return {
    id,
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: '2024-01-01T00:00:00Z'
  };
});

fastify.post('/users', {
  schema: {
    description: 'Create new user',
    tags: ['users'],
    body: userSchema,
    response: {
      201: userResponseSchema,
      400: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { name, email } = request.body as any;
  
  reply.code(201);
  return {
    id: String(Math.floor(Math.random() * 1000)),
    name,
    email,
    createdAt: new Date().toISOString(),
  };
});

fastify.put('/users/:id', {
  schema: {
    description: 'Update user by ID',
    tags: ['users'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    body: userSchema,
    response: {
      200: userResponseSchema,
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params as any;
  const { name, email } = request.body as any;
  
  return {
    id,
    name,
    email,
    updatedAt: new Date().toISOString(),
  };
});

fastify.delete('/users/:id', {
  schema: {
    description: 'Delete user by ID',
    tags: ['users'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    response: {
      204: {
        type: 'null',
        description: 'User deleted successfully'
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  reply.code(204);
  return;
});

// Basic AgentPass setup for Fastify
async function main() {
  console.log('🚀 Starting Fastify AgentPass Example...');

  const agentpass = new AgentPass({
    name: 'fastify-api',
    version: '1.0.0',
    description: 'Fastify API with schema validation for user management',
  });

  try {
    // Register routes first
    await fastify.ready();

    // Discover endpoints from Fastify app
    await agentpass.discover({ app: fastify, framework: 'fastify' });

    console.log(`📊 Discovered ${agentpass.getEndpoints().length} endpoints:`);
    agentpass.getEndpoints().forEach(endpoint => {
      console.log(`  ${endpoint.method} ${endpoint.path} - ${endpoint.description || 'No description'}`);
    });

    // Add request/response logging
    agentpass.use('pre', async (context) => {
      console.log(`📝 ${context.request.method} ${context.request.path}`);
      if (Object.keys(context.request.params).length > 0) {
        console.log(`  📋 Params:`, context.request.params);
      }
      if (Object.keys(context.request.query).length > 0) {
        console.log(`  🔍 Query:`, context.request.query);
      }
    });

    agentpass.use('post', async (context, response) => {
      console.log(`✅ ${context.request.method} ${context.request.path} - ${response.status}`);
      
      // Add Fastify-specific metadata
      return {
        ...response,
        data: {
          ...response.data,
          _fastify_metadata: {
            framework: 'fastify',
            hasSchema: !!context.endpoint.metadata?.fastifyRoute?.hasSchema,
            timestamp: new Date().toISOString(),
            endpoint: context.endpoint.id,
          }
        }
      };
    });

    // Generate MCP server with enhanced descriptions from schemas
    const mcpServer = await agentpass.generateMCPServer({
      transport: 'stdio',
      baseUrl: 'http://localhost:3002',
      capabilities: {
        tools: true,
      },
      toolNaming: (endpoint) => {
        // Use schema tags if available
        const tag = endpoint.tags?.[0];
        const method = endpoint.method.toLowerCase();
        const pathParts = endpoint.path.split('/').filter(part => part && !part.startsWith('{'));
        const resource = pathParts[pathParts.length - 1] || 'endpoint';
        
        return tag ? `${method}_${tag}_${resource}` : `${method}_${resource}`;
      },
      toolDescription: (endpoint) => {
        let description = endpoint.description || `${endpoint.method} ${endpoint.path}`;
        
        // Add schema information to description
        if (endpoint.parameters?.length) {
          const pathParams = endpoint.parameters.filter(p => p.in === 'path');
          const queryParams = endpoint.parameters.filter(p => p.in === 'query');
          
          if (pathParams.length > 0) {
            description += `\n\nPath parameters: ${pathParams.map(p => `${p.name} (${p.type})`).join(', ')}`;
          }
          
          if (queryParams.length > 0) {
            description += `\n\nQuery parameters: ${queryParams.map(p => `${p.name} (${p.type}${p.required ? ', required' : ''})`).join(', ')}`;
          }
        }
        
        return description;
      },
      metadata: {
        framework: 'fastify',
        hasSchemas: true,
      },
    });

    // Start Fastify server
    const port = 3002;
    await fastify.listen({ port, host: '0.0.0.0' });
    
    console.log(`⚡ Fastify server running on http://localhost:${port}`);
    console.log('📚 Available endpoints:');
    console.log('  GET /users?limit=10&search=john - List users with pagination and search');
    console.log('  GET /users/:id - Get user by ID');
    console.log('  POST /users - Create user (with validation)');
    console.log('  PUT /users/:id - Update user (with validation)');
    console.log('  DELETE /users/:id - Delete user');

    // Start MCP server
    await mcpServer.start();

    console.log('✅ Fastify MCP Server started successfully');

  } catch (error) {
    console.error('❌ Failed to setup Fastify API:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  await fastify.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  main().catch(console.error);
}

export { fastify };