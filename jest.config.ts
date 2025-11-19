const baseConfig = {
  extensionsToTreatAsEsm: ['.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  // verbose: true,
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.json'
      }
    ]
  }
};

export default {
  projects: [
    {
      displayName: 'unit',
      roots: ['src'],
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/jest.setupTests.ts'],
      ...baseConfig
    },
    {
      displayName: 'e2e',
      roots: ['tests'],
      testMatch: ['<rootDir>/tests/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/jest.setupTests.ts'],
      transformIgnorePatterns: [
        '<rootDir>/dist/'
      ],
      // forceExit: true, // Force exit after tests complete to prevent hanging
      ...baseConfig
    }
  ]
};
