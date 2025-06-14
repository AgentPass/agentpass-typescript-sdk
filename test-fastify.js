#!/usr/bin/env node

const { AgentPass } = require('./dist/core/AgentPass');
const Fastify = require('fastify');

async function testFastifyDiscovery() {
  console.log('🧪 Testing Fastify Discovery...\n');
  
  try {
    const agentpass = new AgentPass({
      name: 'fastify-test',
      version: '1.0.0'
    });
    
    // Create Fastify app
    const app = Fastify({ logger: false });
    
    // Add routes with schemas
    app.get('/users', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 10 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              users: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    name: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }, async (request, reply) => {
      return { users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }] };
    });
    
    app.post('/users', {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' }
          },
          required: ['name', 'email']
        },
        response: {
          201: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  name: { type: 'string' },
                  email: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }, async (request, reply) => {
      reply.code(201);
      return { message: 'User created', user: { id: 3, ...request.body } };
    });
    
    app.get('/users/:id', async (request, reply) => {
      const { id } = request.params;
      return { user: { id: parseInt(id), name: 'John Doe' } };
    });
    
    // Wait for Fastify to be ready
    await app.ready();
    
    console.log('✅ Testing Fastify discovery');
    await agentpass.discover({ app, framework: 'fastify' });
    
    const endpoints = agentpass.getEndpoints();
    console.log(`   ✓ Discovered ${endpoints.length} endpoints from Fastify app`);
    
    // Check for specific endpoints
    const getUsersEndpoint = endpoints.find(e => e.method === 'GET' && e.path === '/users');
    const createUserEndpoint = endpoints.find(e => e.method === 'POST' && e.path === '/users');
    const getUserEndpoint = endpoints.find(e => e.method === 'GET' && e.path.includes('id'));
    
    if (getUsersEndpoint) {
      console.log('   ✓ GET /users endpoint discovered');
      if (getUsersEndpoint.parameters && getUsersEndpoint.parameters.length > 0) {
        console.log(`     - Has ${getUsersEndpoint.parameters.length} query parameter(s)`);
      }
    }
    
    if (createUserEndpoint) {
      console.log('   ✓ POST /users endpoint discovered');
      if (createUserEndpoint.requestBody) {
        console.log('     - Has request body schema');
      }
    }
    
    if (getUserEndpoint) {
      console.log('   ✓ GET /users/:id endpoint discovered');
      if (getUserEndpoint.parameters && getUserEndpoint.parameters.length > 0) {
        console.log(`     - Has ${getUserEndpoint.parameters.length} parameter(s)`);
      }
    }
    
    // Test MCP generation
    console.log('\n✅ Testing MCP generation from Fastify endpoints');
    const mcpServer = await agentpass.generateMCPServer();
    
    if (mcpServer) {
      console.log('   ✓ MCP server generated from Fastify endpoints');
    }
    
    // Close Fastify app
    await app.close();
    
    console.log('\n🎉 Fastify discovery test completed successfully!');
    return true;
    
  } catch (error) {
    console.error('\n❌ Fastify test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

testFastifyDiscovery().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});