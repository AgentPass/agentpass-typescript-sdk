/**
 * AgentPass MCP Server Example
 * 
 * This example demonstrates how to create a real MCP server from Express endpoints
 * that can be used with Claude Desktop or other MCP clients.
 */

import { AgentPass } from '../src/core/AgentPass';
import express from 'express';

async function createMCPServer() {
  // 1. Create AgentPass instance
  const agentpass = new AgentPass({
    name: 'example-api-server',
    version: '1.0.0',
    description: 'Example API converted to MCP server'
  });

  // 2. Create Express app with example endpoints
  const app = express();
  app.use(express.json());

  // User management endpoints
  app.get('/users', (req, res) => {
    res.json({
      users: [
        { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'user' },
        { id: 3, name: 'Bob Wilson', email: 'bob@example.com', role: 'user' }
      ]
    });
  });

  app.get('/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    const users = [
      { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'user' },
      { id: 3, name: 'Bob Wilson', email: 'bob@example.com', role: 'user' }
    ];
    
    const user = users.find(u => u.id === userId);
    if (user) {
      res.json({ user });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });

  app.post('/users', (req, res) => {
    const { name, email, role = 'user' } = req.body;
    const newUser = {
      id: Date.now(), // Simple ID generation
      name,
      email,
      role
    };
    res.status(201).json({ message: 'User created', user: newUser });
  });

  // Product management endpoints
  app.get('/products', (req, res) => {
    const { category, minPrice, maxPrice } = req.query;
    let products = [
      { id: 1, name: 'Laptop', category: 'electronics', price: 999.99 },
      { id: 2, name: 'Book', category: 'books', price: 19.99 },
      { id: 3, name: 'Headphones', category: 'electronics', price: 149.99 },
      { id: 4, name: 'Notebook', category: 'office', price: 4.99 }
    ];

    // Apply filters
    if (category) {
      products = products.filter(p => p.category === category);
    }
    if (minPrice) {
      products = products.filter(p => p.price >= parseFloat(minPrice as string));
    }
    if (maxPrice) {
      products = products.filter(p => p.price <= parseFloat(maxPrice as string));
    }

    res.json({ products });
  });

  app.get('/products/:id', (req, res) => {
    const productId = parseInt(req.params.id);
    const products = [
      { id: 1, name: 'Laptop', category: 'electronics', price: 999.99, description: 'High-performance laptop' },
      { id: 2, name: 'Book', category: 'books', price: 19.99, description: 'Programming fundamentals' },
      { id: 3, name: 'Headphones', category: 'electronics', price: 149.99, description: 'Noise-cancelling headphones' },
      { id: 4, name: 'Notebook', category: 'office', price: 4.99, description: 'Spiral-bound notebook' }
    ];
    
    const product = products.find(p => p.id === productId);
    if (product) {
      res.json({ product });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  });

  // Health and status endpoints
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0'
    });
  });

  app.get('/stats', (req, res) => {
    res.json({
      totalUsers: 3,
      totalProducts: 4,
      categories: ['electronics', 'books', 'office'],
      serverTime: new Date().toISOString()
    });
  });

  // 3. Discover endpoints from Express app
  console.log('🔍 Discovering endpoints from Express app...');
  await agentpass.discover({ app, framework: 'express' });

  const endpoints = agentpass.getEndpoints();
  console.log(`✅ Discovered ${endpoints.length} endpoints:`);
  endpoints.forEach(endpoint => {
    console.log(`  - ${endpoint.method} ${endpoint.path}`);
  });

  // 4. Generate MCP server with custom configuration
  console.log('\n🚀 Generating MCP server...');
  const mcpServer = await agentpass.generateMCPServer({
    transport: 'stdio', // Use 'http' for HTTP transport
    baseUrl: 'http://localhost:3000', // Base URL where your actual API runs
    capabilities: {
      tools: true,
    },
    // Custom tool naming function
    toolNaming: (endpoint) => {
      const method = endpoint.method.toLowerCase();
      const pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
      const resource = pathParts[pathParts.length - 1] || 'endpoint';
      
      // Handle parameterized paths
      if (endpoint.path.includes('{')) {
        return `${method}_${resource}_by_id`;
      }
      
      return `${method}_${resource}`;
    },
    // Custom tool descriptions
    toolDescription: (endpoint) => {
      const descriptions: { [key: string]: string } = {
        'GET /users': 'Retrieve all users from the system',
        'GET /users/{id}': 'Get a specific user by their ID',
        'POST /users': 'Create a new user in the system',
        'GET /products': 'List all products with optional filtering',
        'GET /products/{id}': 'Get detailed information about a specific product',
        'GET /health': 'Check the health and status of the API',
        'GET /stats': 'Get system statistics and metrics'
      };
      
      const key = `${endpoint.method} ${endpoint.path}`;
      return descriptions[key] || `${endpoint.method} ${endpoint.path}`;
    }
  });

  console.log(`✅ MCP Server created with transport: ${mcpServer.transport.type}`);

  return { mcpServer, app };
}

// Example usage
async function main() {
  console.log('🎯 AgentPass MCP Server Example\n');

  try {
    const { mcpServer, app } = await createMCPServer();

    // For stdio transport (used with Claude Desktop)
    if (mcpServer.transport.type === 'stdio') {
      console.log('\n📋 To use with Claude Desktop:');
      console.log('1. Add this to your claude_desktop_config.json:');
      console.log(`{
  "mcpServers": {
    "example-api": {
      "command": "node",
      "args": ["dist/examples/mcp-server.js"]
    }
  }
}`);
      console.log('\n2. Make sure your actual API server is running on http://localhost:3000');
      console.log('3. Start Claude Desktop and the MCP server will be available as tools');
      
      // Start the MCP server for stdio
      await mcpServer.start();
      console.log('\n🔄 MCP Server running with stdio transport...');
      
    } else if (mcpServer.transport.type === 'http') {
      // For HTTP transport
      await mcpServer.start();
      const address = mcpServer.getAddress?.();
      console.log(`\n🌐 MCP Server running on ${address}`);
      console.log('You can now make HTTP requests to the /mcp endpoint');
      
      // Example HTTP request
      console.log('\nExample requests:');
      console.log(`curl -X POST ${address}/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}'`);
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down MCP server...');
      if (mcpServer.isRunning()) {
        await mcpServer.stop();
      }
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to create MCP server:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main();
}

export { createMCPServer };