// Jest setup file
import { jest } from '@jest/globals';

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set test timeout
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  createMockContext: (overrides = {}) => ({
    endpoint: {
      id: 'test-endpoint',
      method: 'GET' as const,
      path: '/test',
      description: 'Test endpoint',
      tags: [],
      parameters: [],
      responses: {},
      metadata: {},
    },
    request: {
      path: '/test',
      method: 'GET' as const,
      headers: {},
      params: {},
      query: {},
    },
    timestamp: new Date(),
    requestId: 'test-request-id',
    metadata: {},
    ...overrides,
  }),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});