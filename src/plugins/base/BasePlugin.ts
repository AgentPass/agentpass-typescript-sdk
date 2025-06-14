import { Plugin, EndpointDefinition, MCPOptions } from '../../core/types';

export abstract class BasePlugin implements Plugin {
  abstract name: string;
  version?: string;
  description?: string;
  options?: Record<string, any>;

  /**
   * Called when endpoints are discovered
   */
  async onDiscover?(endpoints: EndpointDefinition[], agentpass: any): Promise<void> {
    // Override in subclasses
  }

  /**
   * Called when MCP server is being generated
   */
  async onGenerate?(mcpConfig: MCPOptions, agentpass: any): Promise<void> {
    // Override in subclasses
  }

  /**
   * Called when MCP server starts
   */
  async onStart?(mcpServer: any, agentpass: any): Promise<void> {
    // Override in subclasses
  }

  /**
   * Called when MCP server stops
   */
  async onStop?(mcpServer: any, agentpass: any): Promise<void> {
    // Override in subclasses
  }

  /**
   * Log plugin messages
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] [${this.name}] ${level.toUpperCase()}: ${message}${logData}`);
  }
}