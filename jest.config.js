module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30000, // Increase timeout for E2E tests
  // Run unit tests and E2E tests separately if needed
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/*.test.ts'],
      testTimeout: 10000,
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/*.e2e.test.ts'],
      testTimeout: 30000,
    }
  ]
};