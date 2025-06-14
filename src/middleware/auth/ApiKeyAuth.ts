import { AuthMiddleware, MiddlewareContext } from '../../core/types';

export interface ApiKeyAuthConfig {
  header?: string;
  query?: string;
  validator: (key: string) => Promise<any> | any;
  required?: boolean;
}

export class ApiKeyAuth {
  private config: ApiKeyAuthConfig;

  constructor(config: ApiKeyAuthConfig) {
    this.config = {
      header: 'x-api-key',
      required: true,
      ...config,
    };
  }

  middleware(): AuthMiddleware {
    return async (context: MiddlewareContext) => {
      const { headers, query } = context.request;
      
      let apiKey: string | undefined;
      
      // Check header first
      if (this.config.header) {
        apiKey = headers[this.config.header] || headers[this.config.header.toLowerCase()];
      }
      
      // Fall back to query parameter
      if (!apiKey && this.config.query) {
        apiKey = query[this.config.query];
      }
      
      if (!apiKey) {
        if (this.config.required) {
          throw new Error('API key is required');
        }
        return null;
      }
      
      // Validate the API key
      try {
        const user = await this.config.validator(apiKey);
        if (!user && this.config.required) {
          throw new Error('Invalid API key');
        }
        return user;
      } catch (error) {
        throw new Error(`API key validation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  }
}