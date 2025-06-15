import { AgentPass } from '../../src';
import express, { Request, Response } from 'express';

// Create a simple Express app
const app = express();
app.use(express.json());

// Basic CRUD endpoints
app.get('/users', (req: Request, res: Response) => {
  res.json([
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  ]);
});

app.get('/users/:id', (req: Request, res: Response) => {
  const user = { id: req.params.id, name: 'John Doe', email: 'john@example.com' };
  res.json(user);
});

app.post('/users', (req: Request, res: Response) => {
  const { name, email } = req.body;
  const newUser = {
    id: String(Math.floor(Math.random() * 1000)),
    name,
    email,
    createdAt: new Date().toISOString(),
  };
  res.status(201).json(newUser);
});

app.put('/users/:id', (req: Request, res: Response) => {
  const { name, email } = req.body;
  const updatedUser = {
    id: req.params.id,
    name,
    email,
    updatedAt: new Date().toISOString(),
  };
  res.json(updatedUser);
});

app.delete('/users/:id', (req: Request, res: Response) => {
  res.status(204).send();
});

// Basic AgentPass setup
async function main() {
  console.log('🚀 Starting Basic Express AgentPass Example (Test Mode)...');

  const agentpass = new AgentPass({
    name: 'basic-express-api',
    version: '1.0.0',
    description: 'Simple Express API for user management',
  });

  // Discover endpoints from Express app
  await agentpass.discover({ app, framework: 'express' });

  console.log(`📊 Discovered ${agentpass.getEndpoints().length} endpoints:`);
  agentpass.getEndpoints().forEach(endpoint => {
    console.log(`  ${endpoint.method} ${endpoint.path}`);
  });

  // Add simple logging middleware
  agentpass.use('pre', async (context: any) => {
    console.log(`📝 ${context.request.method} ${context.request.path} - ${context.requestId}`);
  });

  agentpass.use('post', async (context: any, response: any) => {
    console.log(`✅ ${context.request.method} ${context.request.path} - ${response?.status}`);
    return response;
  });

  // Generate MCP server
  const mcpServer = await agentpass.generateMCPServer({
    transport: 'stdio',
    baseUrl: 'http://localhost:3000',
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
      logging: false
    }
  });

  console.log('✅ MCP Server created successfully');
  console.log(`📋 Server Info:`);
  console.log(`   Name: ${mcpServer.info.name}`);
  console.log(`   Version: ${mcpServer.info.version}`);
  console.log(`   Transport: ${mcpServer.transport.type}`);
  console.log(`   Tools capability: ${mcpServer.capabilities.tools}`);
  
  console.log('\n🎯 Example completed successfully!');
  console.log('💡 To use with Claude Desktop, run: npm run example:express');
  console.log('   (The server will start and wait for Claude Desktop connection)');
}

// Start the example
main().catch(console.error);

export { app };