import { 
  EndpointDefinition, 
  MCPOptions, 
  MCPServer
} from '../../core/types';

/**
 * Mock MCP Generator for testing
 */
export class MCPGenerator {
  constructor(private agentPass: any) {}

  async generate(endpoints: EndpointDefinition[], options: MCPOptions = {}): Promise<MCPServer> {
    const mockServer: MCPServer = {
      info: {
        name: options.name || 'mock-mcp-server',
        version: options.version || '1.0.0',
        description: options.description || 'Mock MCP Server for testing'
      },
      capabilities: {
        tools: options.capabilities?.tools ?? true,
        resources: options.capabilities?.resources ?? false,
        prompts: options.capabilities?.prompts ?? false,
        logging: options.capabilities?.logging ?? false
      },
      transport: {
        type: options.transport || 'stdio',
        config: {
          port: options.port,
          host: options.host,
          cors: options.cors
        }
      },
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(false),
      getAddress: jest.fn().mockReturnValue(null)
    };

    return mockServer;
  }
}