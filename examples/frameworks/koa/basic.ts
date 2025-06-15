import { AgentPass } from '../../../src';
import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';

// Create Koa app
const app = new Koa();
const router = new Router();

// Add body parser
app.use(bodyParser());

// Basic CRUD endpoints
router.get('/users', async (ctx) => {
  ctx.body = {
    users: [
      { id: '1', name: 'John Doe', email: 'john@example.com' },
      { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
    ]
  };
});

router.get('/users/:id', async (ctx) => {
  const { id } = ctx.params;
  ctx.body = {
    id,
    name: 'John Doe',
    email: 'john@example.com'
  };
});

router.post('/users', async (ctx) => {
  const { name, email } = ctx.request.body as any;
  ctx.status = 201;
  ctx.body = {
    id: String(Math.floor(Math.random() * 1000)),
    name,
    email,
    createdAt: new Date().toISOString(),
  };
});

router.put('/users/:id', async (ctx) => {
  const { id } = ctx.params;
  const { name, email } = ctx.request.body as any;
  
  ctx.body = {
    id,
    name,
    email,
    updatedAt: new Date().toISOString(),
  };
});

router.delete('/users/:id', async (ctx) => {
  ctx.status = 204;
});

// Add query parameter examples
router.get('/products', async (ctx) => {
  const { category, minPrice, maxPrice, limit = '10' } = ctx.query;
  
  ctx.body = {
    products: [
      { id: '1', name: 'Laptop', category: 'electronics', price: 999 },
      { id: '2', name: 'Book', category: 'books', price: 15 },
    ].filter(p => !category || p.category === category),
    filters: { category, minPrice, maxPrice },
    pagination: { limit: parseInt(limit as string) }
  };
});

// Mount router
app.use(router.routes());
app.use(router.allowedMethods());

// Basic AgentPass setup for Koa
async function main() {
  console.log('🚀 Starting Koa AgentPass Example...');

  const agentpass = new AgentPass({
    name: 'koa-api',
    version: '1.0.0',
    description: 'Simple Koa API for user and product management',
  });

  try {
    // Discover endpoints from Koa app
    await agentpass.discover({ app, framework: 'koa' });

    console.log(`📊 Discovered ${agentpass.getEndpoints().length} endpoints:`);
    agentpass.getEndpoints().forEach(endpoint => {
      console.log(`  ${endpoint.method} ${endpoint.path}`);
    });

    // Add simple logging middleware
    agentpass.use('pre', async (context) => {
      console.log(`📝 ${context.request.method} ${context.request.path} - ${context.requestId}`);
    });

    agentpass.use('post', async (context, response) => {
      console.log(`✅ ${context.request.method} ${context.request.path} - ${response.status}`);
      return response;
    });

    // Add response transformation
    agentpass.use('post', async (context, response) => {
      return {
        ...response,
        data: {
          ...response.data,
          _koa_metadata: {
            framework: 'koa',
            timestamp: new Date().toISOString(),
            endpoint: context.endpoint.id,
          }
        }
      };
    });

    // Generate MCP server
    const mcpServer = await agentpass.generateMCPServer({
      transport: 'stdio',
      baseUrl: 'http://localhost:3001',
      capabilities: {
        tools: true,
      },
      toolNaming: (endpoint) => {
        const method = endpoint.method.toLowerCase();
        const pathParts = endpoint.path.split('/').filter(part => part && !part.startsWith('{'));
        const resource = pathParts[pathParts.length - 1] || pathParts[0] || 'endpoint';
        return `${method}_${resource}`.replace(/[^a-zA-Z0-9_]/g, '_');
      },
      metadata: {
        framework: 'koa',
      },
    });

    // Start Koa server for testing
    const port = 3001;
    app.listen(port, () => {
      console.log(`🥝 Koa server running on http://localhost:${port}`);
      console.log('📚 Available endpoints:');
      console.log('  GET /users - List users');
      console.log('  GET /users/:id - Get user by ID');
      console.log('  POST /users - Create user');
      console.log('  PUT /users/:id - Update user');
      console.log('  DELETE /users/:id - Delete user');
      console.log('  GET /products?category=electronics - List products with filters');
    });

    // Start MCP server
    await mcpServer.start();

    console.log('✅ Koa MCP Server started successfully');

  } catch (error) {
    console.error('❌ Failed to setup Koa API:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { app };