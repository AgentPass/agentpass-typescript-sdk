#!/usr/bin/env node

const { AgentPass } = require('./dist/core/AgentPass');

async function testOpenAPIDiscovery() {
  console.log('🧪 Testing OpenAPI Discovery...\n');
  
  try {
    const agentpass = new AgentPass({
      name: 'openapi-test',
      version: '1.0.0'
    });
    
    // Test OpenAPI spec discovery
    const petStoreSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Pet Store API',
        version: '1.0.0'
      },
      paths: {
        '/pets': {
          get: {
            summary: 'List all pets',
            operationId: 'listPets',
            responses: {
              '200': {
                description: 'A list of pets',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer' },
                          name: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: 'Create a pet',
            operationId: 'createPet',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      tag: { type: 'string' }
                    },
                    required: ['name']
                  }
                }
              }
            },
            responses: {
              '201': {
                description: 'Pet created'
              }
            }
          }
        },
        '/pets/{petId}': {
          get: {
            summary: 'Get a specific pet',
            operationId: 'getPet',
            parameters: [
              {
                name: 'petId',
                in: 'path',
                required: true,
                schema: { type: 'integer' }
              }
            ],
            responses: {
              '200': {
                description: 'Pet details'
              }
            }
          }
        }
      }
    };
    
    console.log('✅ Testing OpenAPI specification discovery');
    await agentpass.discover({ openapi: petStoreSpec });
    
    const endpoints = agentpass.getEndpoints();
    console.log(`   ✓ Discovered ${endpoints.length} endpoints from OpenAPI spec`);
    
    // Check for specific endpoints
    const listPetsEndpoint = endpoints.find(e => e.method === 'GET' && e.path === '/pets');
    const createPetEndpoint = endpoints.find(e => e.method === 'POST' && e.path === '/pets');
    const getPetEndpoint = endpoints.find(e => e.method === 'GET' && e.path.includes('{petId}'));
    
    if (listPetsEndpoint) {
      console.log(`   ✓ GET /pets: ${listPetsEndpoint.summary || listPetsEndpoint.description}`);
    }
    
    if (createPetEndpoint) {
      console.log(`   ✓ POST /pets: ${createPetEndpoint.summary || createPetEndpoint.description}`);
      if (createPetEndpoint.requestBody) {
        console.log('     - Has request body schema');
      }
    }
    
    if (getPetEndpoint) {
      console.log(`   ✓ GET /pets/{petId}: ${getPetEndpoint.summary || getPetEndpoint.description}`);
      if (getPetEndpoint.parameters && getPetEndpoint.parameters.length > 0) {
        console.log(`     - Has ${getPetEndpoint.parameters.length} parameter(s)`);
      }
    }
    
    // Test MCP generation from OpenAPI
    console.log('\n✅ Testing MCP generation from OpenAPI endpoints');
    const mcpServer = await agentpass.generateMCPServer({
      toolNaming: (endpoint) => {
        return endpoint.metadata?.operationId || `${endpoint.method.toLowerCase()}_${endpoint.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
      }
    });
    
    if (mcpServer) {
      console.log('   ✓ MCP server generated from OpenAPI endpoints');
    }
    
    console.log('\n🎉 OpenAPI discovery test completed successfully!');
    return true;
    
  } catch (error) {
    console.error('\n❌ OpenAPI test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

testOpenAPIDiscovery().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});