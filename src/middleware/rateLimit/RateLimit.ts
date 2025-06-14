import { PreMiddleware, MiddlewareContext } from '../../core/types';
import { RATE_LIMIT_WINDOWS } from '../../core/constants';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator?: (context: MiddlewareContext) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimit {
  private config: RateLimitConfig;
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: any;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyGenerator: (context) => context.ip || (context.user as Record<string, string>)?.id || 'anonymous',
      message: 'Too many requests',
      ...config,
    };

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  middleware(): PreMiddleware {
    return async (context: MiddlewareContext) => {
      const key = this.config.keyGenerator!(context);
      const now = Date.now();
      
      let entry = this.store.get(key);
      
      if (!entry || now > entry.resetTime) {
        // Create new entry or reset expired entry
        entry = {
          count: 0,
          resetTime: now + this.config.windowMs,
        };
        this.store.set(key, entry);
      }
      
      entry.count++;
      
      if (entry.count > this.config.max) {
        const resetTime = new Date(entry.resetTime);
        throw new Error(
          `${this.config.message}. Limit: ${this.config.max} requests per window. Reset at: ${resetTime.toISOString()}`
        );
      }
      
      // Add rate limit headers to context metadata
      context.metadata.rateLimit = {
        limit: this.config.max,
        remaining: Math.max(0, this.config.max - entry.count),
        reset: entry.resetTime,
        resetDate: new Date(entry.resetTime).toISOString(),
      };
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get current stats
   */
  getStats(): { totalKeys: number; activeKeys: number } {
    const now = Date.now();
    let activeKeys = 0;
    
    for (const entry of this.store.values()) {
      if (now <= entry.resetTime) {
        activeKeys++;
      }
    }
    
    return {
      totalKeys: this.store.size,
      activeKeys,
    };
  }

  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Destroy the rate limiter and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}