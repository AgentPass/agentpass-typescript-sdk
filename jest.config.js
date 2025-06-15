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
    'node_modules/(?!(@modelcontextprotocol)/.*)',
    'dist/'
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
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
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
        'node_modules/(?!(@modelcontextprotocol)/.*)',
        'dist/'
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@modelcontextprotocol/sdk/(.*)': '<rootDir>/src/mcp/__mocks__/sdk.js'
      },
      modulePathIgnorePatterns: ['<rootDir>/dist/'],
    },
    {
      preset: 'ts-jest',
      testEnvironment: 'node', 
      displayName: 'e2e',
      testMatch: [
        '<rootDir>/tests/e2e/mcp-real-clients.e2e.test.ts'
      ],
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
        'node_modules/(?!(@modelcontextprotocol)/.*)',
        'dist/'
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1'
      },
      modulePathIgnorePatterns: ['<rootDir>/dist/'],
    }
  ]
};