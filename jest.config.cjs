module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setupTests.js'],
  testTimeout: 30000,
  verbose: true,
};
