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
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
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
        '^.+\\.ts$': 'ts-jest',
      },
    },
    {
      preset: 'ts-jest',
      testEnvironment: 'node', 
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/*.e2e.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
    }
  ]
};