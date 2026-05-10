// Shared helpers for scripts Jest tests
import fs from 'node:fs';
import { jest } from '@jest/globals';

/**
 * Set up global.fetch spy for e2e tests
 *
 * Global spy, tests can use jest.spyOn(fs, 'existsSync').mockImplementation() to customize behavior.
 *
 * The spy is automatically restored after each test suite via jest.restoreAllMocks().
 * Individual tests should restore their mocks in afterAll/afterEach if needed.
 */
beforeAll(() => {
  // jest.spyOn(fs, 'existsSync');
  // jest.spyOn(fs, 'readFileSync');
});
