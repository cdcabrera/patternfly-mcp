import * as options from '../options';
import { parseCliOptions, freezeOptions, OPTIONS } from '../options';

describe('options', () => {
  it('should return specific properties', () => {
    expect(options).toMatchSnapshot();
  });
});

describe('parseCliOptions', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it.each([
    {
      description: 'with --docs-host flag',
      args: ['node', 'script.js', '--docs-host']
    },
    {
      description: 'without --docs-host flag',
      args: ['node', 'script.js']
    },
    {
      description: 'with other arguments',
      args: ['node', 'script.js', 'other', 'args']
    }
  ])('should attempt to parse args $description', ({ args = [] }) => {
    process.argv = args;

    const result = parseCliOptions();

    expect(result).toMatchSnapshot();
  });
});

describe('freezeOptions', () => {
  it('should return options with consistent properties', () => {
    const result = freezeOptions({ docsHost: true });

    expect(Object.isFrozen(result)).toBe(false); // No longer frozen since we removed Object.freeze()
    expect(result).not.toBe(OPTIONS); // Now returns a fresh instance, not the global OPTIONS
    expect(result).toMatchSnapshot('options');
  });
});
