// Mock MCP SDK for testing
class MockServer {
  constructor() {
    this.handlers = new Map();
  }
  
  setRequestHandler(schema, handler) {
    this.handlers.set(schema.method, handler);
  }
  
  async connect(transport) {
    // Mock connection
  }
  
  async close() {
    // Mock close
  }
}

class MockStdioServerTransport {
  constructor() {}
  
  async start() {
    // Mock start
  }
  
  async close() {
    // Mock close
  }
}

// Mock schemas
const CallToolRequestSchema = {
  method: 'tools/call'
};

const ListToolsRequestSchema = {
  method: 'tools/list'
};

module.exports = {
  Server: MockServer,
  StdioServerTransport: MockStdioServerTransport,
  CallToolRequestSchema,
  ListToolsRequestSchema
};