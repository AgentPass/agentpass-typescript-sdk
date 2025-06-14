import { AgentPass } from '../../src';
import express from 'express';

// Create a simple Express app
const app = express();
app.use(express.json());

// Basic CRUD endpoints
app.get('/users', (req, res) => {
  res.json([
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  ]);
});

app.get('/users/:id', (req, res) => {
  const user = { id: req.params.id, name: 'John Doe', email: 'john@example.com' };
  res.json(user);
});

app.post('/users', (req, res) => {
  const { name, email } = req.body;
  const newUser = {
    id: String(Math.floor(Math.random() * 1000)),
    name,
    email,
    createdAt: new Date().toISOString(),
  };
  res.status(201).json(newUser);
});

app.put('/users/:id', (req, res) => {
  const { name, email } = req.body;
  const updatedUser = {
    id: req.params.id,
    name,
    email,
    updatedAt: new Date().toISOString(),
  };
  res.json(updatedUser);
});

app.delete('/users/:id', (req, res) => {
  res.status(204).send();
});

// Basic AgentPass setup
async function main() {
  console.log('🚀 Starting Basic Express AgentPass Example...');

  const agentpass = new AgentPass({
    name: 'basic-express-api',
    version: '1.0.0',
    description: 'Simple Express API for user management',
  });

  // Discover endpoints from Express app
  await agentpass.discover({ app });

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

  // Generate MCP server
  const mcpServer = await agentpass.generateMCPServer({
    capabilities: {
      tools: true,
    },
    metadata: {
      baseUrl: 'http://localhost:3000',
    },
  });

  // Start Express server for testing
  const port = 3000;
  app.listen(port, () => {
    console.log(`📦 Express server running on http://localhost:${port}`);
  });

  // Start MCP server
  await mcpServer.connect({
    transport: { type: 'stdio' },
  });

  console.log('✅ MCP Server started successfully');
}

if (require.main === module) {
  main().catch(console.error);
}

export { app };