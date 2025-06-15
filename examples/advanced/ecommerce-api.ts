import { AgentPass } from '../../src';
import { ApiKeyAuth } from '../../src/middleware/auth/ApiKeyAuth';
import { RateLimit } from '../../src/middleware/rateLimit/RateLimit';
import express from 'express';

// Simulated database
const db = {
  products: [
    { id: '1', name: 'Laptop', price: 999.99, stock: 10 },
    { id: '2', name: 'Mouse', price: 29.99, stock: 50 },
    { id: '3', name: 'Keyboard', price: 79.99, stock: 25 },
  ],
  orders: [] as any[],
  apiClients: [
    { key: 'test-api-key-123', name: 'Test Client', active: true },
  ],
  users: [
    { id: '1', name: 'John Doe', email: 'john@example.com', isAdmin: false },
    { id: '2', name: 'Admin User', email: 'admin@example.com', isAdmin: true },
  ],
};

// Create Express app
const app = express();
app.use(express.json());

// Products endpoints
app.get('/products', (req, res) => {
  const { search, minPrice, maxPrice, limit = 10 } = req.query;
  let products = [...db.products];
  
  if (search) {
    products = products.filter(p => 
      p.name.toLowerCase().includes(String(search).toLowerCase())
    );
  }
  
  if (minPrice) {
    products = products.filter(p => p.price >= Number(minPrice));
  }
  
  if (maxPrice) {
    products = products.filter(p => p.price <= Number(maxPrice));
  }
  
  products = products.slice(0, Number(limit));
  
  res.json({
    products,
    total: products.length,
    pagination: {
      limit: Number(limit),
      hasMore: products.length === Number(limit),
    },
  });
});

app.get('/products/:id', (req, res) => {
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

// Orders endpoints
app.post('/orders', (req, res) => {
  const { items, customerInfo } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items are required' });
  }
  
  if (!customerInfo || !customerInfo.email) {
    return res.status(400).json({ error: 'Customer email is required' });
  }
  
  // Validate items and calculate total
  let total = 0;
  const orderItems = [];
  
  for (const item of items) {
    const product = db.products.find(p => p.id === item.productId);
    if (!product) {
      return res.status(400).json({ error: `Product ${item.productId} not found` });
    }
    
    if (product.stock < item.quantity) {
      return res.status(400).json({ 
        error: `Insufficient stock for ${product.name}. Available: ${product.stock}` 
      });
    }
    
    const itemTotal = product.price * item.quantity;
    total += itemTotal;
    
    orderItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      price: product.price,
      total: itemTotal,
    });
    
    // Update stock
    product.stock -= item.quantity;
  }
  
  const order = {
    id: String(db.orders.length + 1),
    items: orderItems,
    customerInfo,
    total,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  
  db.orders.push(order);
  
  res.status(201).json(order);
});

app.get('/orders/:id', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});


// Setup AgentPass
async function setupAgentPass() {
  const agentpass = new AgentPass({
    name: 'ecommerce-api',
    version: '1.0.0',
    description: 'E-commerce API with product catalog and ordering system',
  });

  // Discover endpoints from Express app
  await agentpass.discover({ app });

  // Add API key authentication
  const apiKeyAuth = new ApiKeyAuth({
    header: 'x-api-key',
    validator: async (key: string) => {
      const client = db.apiClients.find(c => c.key === key && c.active);
      if (!client) return null;
      
      // For demo, return a mock user
      return {
        id: 'client-' + client.name.toLowerCase().replace(/\s+/g, '-'),
        name: client.name,
        type: 'api-client',
      };
    },
  });

  agentpass.use('auth', apiKeyAuth.middleware());

  // Add authorization for admin endpoints
  agentpass.use('authz', async (context) => {
    if (context.endpoint.path.startsWith('/admin')) {
      // For demo, allow access if user has admin role or is an API client
      if (context.user?.type === 'api-client') {
        return true; // API clients can access admin endpoints
      }
      return false;
    }
    return true; // Allow access to non-admin endpoints
  });

  // Add rate limiting
  const rateLimit = new RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    keyGenerator: (context) => {
      return context.user?.id || context.ip || 'anonymous';
    },
  });

  agentpass.use('pre', rateLimit.middleware());

  // Add response enhancement
  agentpass.use('post', async (context, response) => {
    // Add metadata to responses
    const enhanced = {
      ...response.data,
      _metadata: {
        timestamp: new Date().toISOString(),
        endpoint: context.endpoint.id,
        requestId: context.requestId,
      },
    };

    // Add rate limit headers
    if (context.metadata.rateLimit) {
      enhanced._metadata.rateLimit = context.metadata.rateLimit;
    }

    return {
      ...response,
      data: enhanced,
    };
  });

  // Add business logic validation
  agentpass.use('pre', async (context) => {
    // Validate order creation
    if (context.endpoint.path === '/orders' && context.endpoint.method === 'POST') {
      const { items } = context.request.body || {};
      
      if (!items || !Array.isArray(items)) {
        throw new Error('Order items are required');
      }
      
      // Pre-validate stock availability
      for (const item of items) {
        const product = db.products.find(p => p.id === item.productId);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }
      }
    }
  });

  // Enhance tool descriptions
  agentpass.transform((endpoint) => {
    const descriptions: Record<string, string> = {
      'GET /products': 'Search and filter products in the catalog with pagination support',
      'GET /products/:id': 'Get detailed information about a specific product including stock levels',
      'POST /orders': 'Create a new order with items and customer information. Validates stock availability',
      'GET /orders/:id': 'Retrieve order details including items, customer info, and status',
    };
    
    const key = `${endpoint.method} ${endpoint.path}`;
    if (descriptions[key]) {
      endpoint.description = descriptions[key];
    }
    
    // Add tags for better organization
    if (endpoint.path.startsWith('/products')) {
      endpoint.tags = ['products', 'catalog'];
    } else if (endpoint.path.startsWith('/orders')) {
      endpoint.tags = ['orders', 'transactions'];
    } else if (endpoint.path.startsWith('/admin')) {
      endpoint.tags = ['admin', 'management'];
    }
    
    return endpoint;
  });

  // Generate MCP server with custom tool naming
  const mcpServer = await agentpass.generateMCPServer({
    transport: 'stdio',
    baseUrl: 'http://localhost:3000',
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
      logging: false
    },
    toolNaming: (endpoint) => {
      // Custom tool naming: action_resource
      const methodActions: Record<string, string> = {
        GET: 'get',
        POST: 'create',
        PUT: 'update',
        DELETE: 'delete',
        PATCH: 'modify',
      };
      
      const action = methodActions[endpoint.method] || endpoint.method.toLowerCase();
      
      // Extract resource from path
      const pathParts = endpoint.path.split('/').filter(part => part && !part.startsWith('{') && !part.startsWith(':'));
      let resource = pathParts[pathParts.length - 1] || 'resource';
      
      // Handle admin endpoints
      if (endpoint.path.startsWith('/admin')) {
        resource = pathParts.slice(1).join('_') || 'admin';
      }
      
      // Singularize resource names
      if (resource.endsWith('s') && resource.length > 1) {
        resource = resource.slice(0, -1);
      }
      
      return `${action}_${resource}`;
    }
  });

  return mcpServer;
}

// Start the MCP server
async function main() {
  try {
    console.log('🚀 Starting E-commerce AgentPass MCP Server...');
    
    const mcpServer = await setupAgentPass();
    
    // For demo purposes, also start the Express server
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`📦 Express server running on http://localhost:${port}`);
      console.log('🔑 Use API key: test-api-key-123');
      console.log('📚 Available endpoints:');
      console.log('  GET /products - List products');
      console.log('  GET /products/:id - Get product details');
      console.log('  POST /orders - Create order');
      console.log('  GET /orders/:id - Get order details');
      console.log('  GET /admin/stats - Admin statistics');
    });
    
    // Start MCP server
    await mcpServer.start();
    
    console.log('✅ MCP Server started successfully');
    
  } catch (error) {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

export { app, setupAgentPass };