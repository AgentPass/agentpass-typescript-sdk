import { AgentPass } from '../../src/core/AgentPass';
import * as fs from 'fs';
import * as path from 'path';

describe('OpenAPI E2E Tests', () => {
  let agentpass: AgentPass;

  beforeEach(() => {
    agentpass = new AgentPass({
      name: 'openapi-test-api',
      version: '1.0.0',
      description: 'OpenAPI E2E Test API'
    });
  });

  afterEach(() => {
    agentpass.reset();
  });

  describe('OpenAPI Object Discovery', () => {
    it('should discover endpoints from OpenAPI object', async () => {
      const openApiSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0'
        },
        paths: {
          '/users': {
            get: {
              summary: 'Get all users',
              description: 'Retrieve a list of all users',
              responses: {
                '200': {
                  description: 'Successful response',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          users: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'number' },
                                name: { type: 'string' },
                                email: { type: 'string', format: 'email' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            post: {
              summary: 'Create user',
              description: 'Create a new user',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' }
                      },
                      required: ['name', 'email']
                    }
                  }
                }
              },
              responses: {
                '201': {
                  description: 'User created',
                  content: {
                    'application/json': {
                      schema: {
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
                }
              }
            }
          },
          '/users/{id}': {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'number' },
                description: 'User ID'
              }
            ],
            get: {
              summary: 'Get user by ID',
              description: 'Retrieve a specific user by their ID',
              responses: {
                '200': {
                  description: 'User found',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'number' },
                          name: { type: 'string' },
                          email: { type: 'string' }
                        }
                      }
                    }
                  }
                },
                '404': {
                  description: 'User not found',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          error: { type: 'string' },
                          message: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            },
            put: {
              summary: 'Update user',
              description: 'Update an existing user',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': {
                  description: 'User updated'
                }
              }
            },
            delete: {
              summary: 'Delete user',
              description: 'Delete a user by ID',
              responses: {
                '200': {
                  description: 'User deleted'
                },
                '404': {
                  description: 'User not found'
                }
              }
            }
          },
          '/users/{userId}/posts': {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: { type: 'number' },
                description: 'User ID'
              }
            ],
            get: {
              summary: 'Get user posts',
              description: 'Get all posts for a specific user',
              parameters: [
                {
                  name: 'limit',
                  in: 'query',
                  schema: { type: 'number', minimum: 1, maximum: 100, default: 10 },
                  description: 'Number of posts to return'
                },
                {
                  name: 'offset',
                  in: 'query',
                  schema: { type: 'number', minimum: 0, default: 0 },
                  description: 'Number of posts to skip'
                }
              ],
              responses: {
                '200': {
                  description: 'Posts retrieved',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          posts: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'number' },
                                title: { type: 'string' },
                                content: { type: 'string' },
                                userId: { type: 'number' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Discover endpoints from OpenAPI object
      await agentpass.discover({ openapi: openApiSpec });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints.length).toBeGreaterThanOrEqual(5);

      // Check specific endpoints
      const getUsersEndpoint = endpoints.find(e => e.method === 'GET' && e.path === '/users');
      expect(getUsersEndpoint).toBeDefined();
      expect(getUsersEndpoint?.description).toContain('Retrieve a list of all users');
      expect(getUsersEndpoint?.summary).toBe('Get all users');

      const createUserEndpoint = endpoints.find(e => e.method === 'POST' && e.path === '/users');
      expect(createUserEndpoint).toBeDefined();
      expect(createUserEndpoint?.requestBody).toBeDefined();

      const getUserByIdEndpoint = endpoints.find(e => e.method === 'GET' && e.path === '/users/{id}');
      expect(getUserByIdEndpoint).toBeDefined();
      expect(getUserByIdEndpoint?.parameters).toHaveLength(1);
      expect(getUserByIdEndpoint?.parameters[0].name).toBe('id');
      expect(getUserByIdEndpoint?.parameters[0].in).toBe('path');

      const getUserPostsEndpoint = endpoints.find(e => e.method === 'GET' && e.path === '/users/{userId}/posts');
      expect(getUserPostsEndpoint).toBeDefined();
      expect(getUserPostsEndpoint?.parameters).toHaveLength(3); // userId (path), limit (query), offset (query)

      // Check parameter types
      const pathParam = getUserPostsEndpoint?.parameters.find(p => p.in === 'path');
      expect(pathParam?.name).toBe('userId');
      
      const queryParams = getUserPostsEndpoint?.parameters.filter(p => p.in === 'query');
      expect(queryParams).toHaveLength(2);
      expect(queryParams?.map(p => p.name)).toContain('limit');
      expect(queryParams?.map(p => p.name)).toContain('offset');
    });

    it('should handle complex OpenAPI schemas', async () => {
      const complexSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Complex API',
          version: '1.0.0'
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                profile: { $ref: '#/components/schemas/Profile' }
              },
              required: ['id', 'name', 'email']
            },
            Profile: {
              type: 'object',
              properties: {
                bio: { type: 'string' },
                avatar: { type: 'string', format: 'uri' },
                preferences: {
                  type: 'object',
                  properties: {
                    theme: { type: 'string', enum: ['light', 'dark'] },
                    notifications: { type: 'boolean' }
                  }
                }
              }
            },
            Error: {
              type: 'object',
              properties: {
                code: { type: 'number' },
                message: { type: 'string' },
                details: { type: 'string' }
              },
              required: ['code', 'message']
            }
          }
        },
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              parameters: [
                {
                  name: 'page',
                  in: 'query',
                  schema: { type: 'number', minimum: 1, default: 1 }
                },
                {
                  name: 'size',
                  in: 'query',
                  schema: { type: 'number', minimum: 1, maximum: 100, default: 20 }
                },
                {
                  name: 'sort',
                  in: 'query',
                  schema: { type: 'string', enum: ['name', 'email', 'created_at'] }
                },
                {
                  name: 'order',
                  in: 'query',
                  schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' }
                }
              ],
              responses: {
                '200': {
                  description: 'Users retrieved',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          users: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/User' }
                          },
                          pagination: {
                            type: 'object',
                            properties: {
                              page: { type: 'number' },
                              size: { type: 'number' },
                              total: { type: 'number' },
                              pages: { type: 'number' }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                '400': {
                  description: 'Bad request',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/Error' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Discover endpoints
      await agentpass.discover({ openapi: complexSpec });

      // Verify discovery
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(1);

      const endpoint = endpoints[0];
      expect(endpoint.method).toBe('GET');
      expect(endpoint.path).toBe('/users');
      expect(endpoint.parameters).toHaveLength(4);

      // Check parameter details
      const pageParam = endpoint.parameters.find(p => p.name === 'page');
      expect(pageParam).toBeDefined();
      expect(pageParam?.in).toBe('query');
      expect(pageParam?.type).toBe('number');

      const sortParam = endpoint.parameters.find(p => p.name === 'sort');
      expect(sortParam).toBeDefined();
      expect(sortParam?.schema?.enum).toEqual(['name', 'email', 'created_at']);
    });
  });

  describe('OpenAPI File Discovery', () => {
    it('should discover endpoints from OpenAPI JSON file', async () => {
      // Create a temporary OpenAPI file
      const tempDir = '/tmp';
      const tempFile = path.join(tempDir, 'test-openapi.json');
      
      const openApiSpec = {
        openapi: '3.0.0',
        info: {
          title: 'File Test API',
          version: '1.0.0'
        },
        paths: {
          '/health': {
            get: {
              summary: 'Health check',
              responses: {
                '200': {
                  description: 'Service is healthy',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          timestamp: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '/version': {
            get: {
              summary: 'Get version',
              responses: {
                '200': {
                  description: 'Version information',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          version: { type: 'string' },
                          build: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Write spec to file
      fs.writeFileSync(tempFile, JSON.stringify(openApiSpec, null, 2));

      try {
        // Discover endpoints from file
        await agentpass.discover({ openapi: tempFile });

        // Verify discovery
        const endpoints = agentpass.getEndpoints();
        expect(endpoints).toHaveLength(2);

        const healthEndpoint = endpoints.find(e => e.path === '/health');
        expect(healthEndpoint).toBeDefined();
        expect(healthEndpoint?.method).toBe('GET');
        expect(healthEndpoint?.summary).toBe('Health check');

        const versionEndpoint = endpoints.find(e => e.path === '/version');
        expect(versionEndpoint).toBeDefined();
        expect(versionEndpoint?.method).toBe('GET');
        expect(versionEndpoint?.summary).toBe('Get version');
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });

  describe('MCP Generation from OpenAPI', () => {
    it('should generate MCP server from OpenAPI specification', async () => {
      const petStoreSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Pet Store API',
          version: '1.0.0',
          description: 'A simple pet store API'
        },
        servers: [
          {
            url: 'https://api.petstore.com/v1',
            description: 'Production server'
          }
        ],
        paths: {
          '/pets': {
            get: {
              summary: 'List all pets',
              operationId: 'listPets',
              tags: ['pets'],
              parameters: [
                {
                  name: 'limit',
                  in: 'query',
                  description: 'How many items to return at one time (max 100)',
                  required: false,
                  schema: {
                    type: 'integer',
                    format: 'int32',
                    minimum: 1,
                    maximum: 100,
                    default: 20
                  }
                }
              ],
              responses: {
                '200': {
                  description: 'A paged array of pets',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer', format: 'int64' },
                            name: { type: 'string' },
                            tag: { type: 'string' }
                          },
                          required: ['id', 'name']
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
              tags: ['pets'],
              requestBody: {
                description: 'Pet to create',
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
                  description: 'Pet created',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer' },
                          name: { type: 'string' },
                          tag: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '/pets/{petId}': {
            get: {
              summary: 'Info for a specific pet',
              operationId: 'showPetById',
              tags: ['pets'],
              parameters: [
                {
                  name: 'petId',
                  in: 'path',
                  required: true,
                  description: 'The id of the pet to retrieve',
                  schema: {
                    type: 'integer',
                    format: 'int64'
                  }
                }
              ],
              responses: {
                '200': {
                  description: 'Expected response to a valid request',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer' },
                          name: { type: 'string' },
                          tag: { type: 'string' }
                        }
                      }
                    }
                  }
                },
                '404': {
                  description: 'Pet not found'
                }
              }
            }
          }
        }
      };

      // Discover endpoints
      await agentpass.discover({ openapi: petStoreSpec });

      // Generate MCP server
      const mcpServer = await agentpass.generateMCPServer({
        toolNaming: (endpoint) => {
          // Use operationId if available, otherwise generate from method + path
          if (endpoint.metadata?.operationId) {
            return endpoint.metadata.operationId;
          }
          const method = endpoint.method.toLowerCase();
          const pathParts = endpoint.path.split('/').filter(Boolean);
          return `${method}_${pathParts.join('_')}`;
        }
      });

      // Verify MCP server was created
      expect(mcpServer).toBeDefined();

      // Verify endpoints were discovered
      const endpoints = agentpass.getEndpoints();
      expect(endpoints).toHaveLength(3);

      // Check specific endpoints
      const listPetsEndpoint = endpoints.find(e => e.metadata?.operationId === 'listPets');
      expect(listPetsEndpoint).toBeDefined();
      expect(listPetsEndpoint?.method).toBe('GET');
      expect(listPetsEndpoint?.path).toBe('/pets');
      expect(listPetsEndpoint?.parameters).toHaveLength(1);
      expect(listPetsEndpoint?.tags).toContain('pets');

      const createPetEndpoint = endpoints.find(e => e.metadata?.operationId === 'createPet');
      expect(createPetEndpoint).toBeDefined();
      expect(createPetEndpoint?.method).toBe('POST');
      expect(createPetEndpoint?.requestBody).toBeDefined();

      const showPetEndpoint = endpoints.find(e => e.metadata?.operationId === 'showPetById');
      expect(showPetEndpoint).toBeDefined();
      expect(showPetEndpoint?.method).toBe('GET');
      expect(showPetEndpoint?.path).toBe('/pets/{petId}');
      expect(showPetEndpoint?.parameters).toHaveLength(1);
      expect(showPetEndpoint?.parameters[0].name).toBe('petId');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid OpenAPI specifications', async () => {
      const invalidSpec = {
        // Missing required fields
        info: { title: 'Invalid' }
      };

      await expect(agentpass.discover({ openapi: invalidSpec }))
        .rejects.toThrow();
    });

    it('should handle missing files gracefully', async () => {
      await expect(agentpass.discover({ openapi: '/non/existent/file.json' }))
        .rejects.toThrow();
    });

    it('should handle malformed JSON files', async () => {
      const tempFile = '/tmp/malformed.json';
      fs.writeFileSync(tempFile, '{ invalid json');

      try {
        await expect(agentpass.discover({ openapi: tempFile }))
          .rejects.toThrow();
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });
});