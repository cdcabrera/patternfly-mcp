import * as options from '../options';
import { parseCliOptions, freezeOptions, createOptions, OPTIONS } from '../options';
import { setOptions, getOptions } from '../options.context';

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
  it('should return options with consistent properties (freezing now happens via setOptions)', () => {
    const result = freezeOptions({ docsHost: true });

    // freezeOptions now just creates options, doesn't freeze globally
    // Freezing happens via setOptions() in context
    expect(result.docsHost).toBe(true);
    expect(result).toMatchSnapshot('frozen');
  });
});

describe('createOptions', () => {
  it('should create options from CLI options', () => {
    const result = createOptions({ docsHost: true });

    expect(result.docsHost).toBe(true);
    expect(result.name).toBeDefined();
    expect(result.version).toBeDefined();
  });
});

describe('context-based options', () => {
  it('should set and get options from context', () => {
    const testOptions = createOptions({ docsHost: true });
    setOptions(testOptions);

    const retrieved = getOptions();
    expect(Object.isFrozen(retrieved)).toBe(true);
    expect(retrieved.docsHost).toBe(true);
  });

  it('should allow different options in different contexts', async () => {
    const options1 = createOptions({ docsHost: true });
    const options2 = createOptions({ docsHost: false });

    // Test that we can set different options
    setOptions(options1);
    expect(getOptions().docsHost).toBe(true);

    setOptions(options2);
    expect(getOptions().docsHost).toBe(false);
  });
});
