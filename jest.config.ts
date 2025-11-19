export default {
  extensionsToTreatAsEsm: ['.ts'],
  preset: 'ts-jest',
  roots: ['tests', 'src'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/src/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setupTests.ts'],
  testTimeout: 30000,
  verbose: true,
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.json'
      }
    ]
  },
  transformIgnorePatterns: [
    // Don't transform dist/ files - they're already compiled ES modules
    // Since package.json has "type": "module", .js files are ES modules
    '<rootDir>/dist/'
  ]
};
