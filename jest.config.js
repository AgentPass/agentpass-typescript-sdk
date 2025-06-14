module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs'
      }
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol)/.*)'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modelcontextprotocol/sdk/(.*)': '<rootDir>/src/mcp/__mocks__/sdk.js'
  },
  // Run unit tests and E2E tests separately if needed
  projects: [
    {
      preset: 'ts-jest',
      testEnvironment: 'node',
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          useESM: false,
          tsconfig: {
            module: 'commonjs'
          }
        }],
      },
      transformIgnorePatterns: [
        'node_modules/(?!(@modelcontextprotocol)/.*)'
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@modelcontextprotocol/sdk/(.*)': '<rootDir>/src/mcp/__mocks__/sdk.js'
      },
    },
    {
      preset: 'ts-jest',
      testEnvironment: 'node', 
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/mcp-real-server.e2e.test.ts', '<rootDir>/tests/e2e/mcp-simple.e2e.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          useESM: false,
          tsconfig: {
            module: 'commonjs'
          }
        }],
      },
      transformIgnorePatterns: [
        'node_modules/(?!(@modelcontextprotocol)/.*)'
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@modelcontextprotocol/sdk/(.*)': '<rootDir>/src/mcp/__mocks__/sdk.js'
      },
    }
  ]
};