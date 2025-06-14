import {
  MiddlewareConfig,
  MiddlewareContext,
  PreMiddleware,
  PostMiddleware,
  AuthMiddleware,
  AuthzMiddleware,
  ErrorMiddleware,
  MiddlewareError,
} from '../core/types';

export class MiddlewareRunner {
  private middleware: MiddlewareConfig;

  constructor(middleware: MiddlewareConfig) {
    this.middleware = middleware;
  }

  /**
   * Run authentication middleware
   */
  async runAuth(context: MiddlewareContext): Promise<any> {
    if (!this.middleware.auth || this.middleware.auth.length === 0) {
      return;
    }

    try {
      for (const authMiddleware of this.middleware.auth) {
        const result = await authMiddleware(context);
        if (result) {
          context.user = result;
        }
      }
    } catch (error) {
      throw new MiddlewareError(
        `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        { phase: 'auth', context, originalError: error }
      );
    }
  }

  /**
   * Run authorization middleware
   */
  async runAuthz(context: MiddlewareContext): Promise<void> {
    if (!this.middleware.authz || this.middleware.authz.length === 0) {
      return;
    }

    try {
      for (const authzMiddleware of this.middleware.authz) {
        const authorized = await authzMiddleware(context);
        if (!authorized) {
          throw new Error('Access denied');
        }
      }
    } catch (error) {
      throw new MiddlewareError(
        `Authorization failed: ${error instanceof Error ? error.message : String(error)}`,
        { phase: 'authz', context, originalError: error }
      );
    }
  }

  /**
   * Run pre-request middleware
   */
  async runPre(context: MiddlewareContext): Promise<void> {
    if (!this.middleware.pre || this.middleware.pre.length === 0) {
      return;
    }

    try {
      for (const preMiddleware of this.middleware.pre) {
        await preMiddleware(context);
      }
    } catch (error) {
      throw new MiddlewareError(
        `Pre-middleware failed: ${error instanceof Error ? error.message : String(error)}`,
        { phase: 'pre', context, originalError: error }
      );
    }
  }

  /**
   * Run post-response middleware
   */
  async runPost(context: MiddlewareContext, response: any): Promise<any> {
    if (!this.middleware.post || this.middleware.post.length === 0) {
      return response;
    }

    try {
      let processedResponse = response;
      
      for (const postMiddleware of this.middleware.post) {
        processedResponse = await postMiddleware(context, processedResponse);
      }
      
      return processedResponse;
    } catch (error) {
      throw new MiddlewareError(
        `Post-middleware failed: ${error instanceof Error ? error.message : String(error)}`,
        { phase: 'post', context, response, originalError: error }
      );
    }
  }

  /**
   * Run error middleware
   */
  async runError(context: MiddlewareContext, error: Error): Promise<never> {
    if (!this.middleware.error || this.middleware.error.length === 0) {
      throw error;
    }

    try {
      for (const errorMiddleware of this.middleware.error) {
        await errorMiddleware(context, error);
      }
      
      // If we get here, the error middleware didn't throw, so we throw the original error
      throw error;
    } catch (middlewareError) {
      // Error middleware threw, so throw that error instead
      throw middlewareError;
    }
  }

  /**
   * Update middleware configuration
   */
  updateMiddleware(middleware: MiddlewareConfig): void {
    this.middleware = middleware;
  }

  /**
   * Get current middleware configuration
   */
  getMiddleware(): MiddlewareConfig {
    return { ...this.middleware };
  }
}