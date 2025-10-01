module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.(js|cjs)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setupTests.cjs'],
  testTimeout: 30000,
  verbose: true,
};
