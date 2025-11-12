import * as options from '../options';
import { parseCliOptions, DEFAULT_OPTIONS, type GlobalOptions } from '../options';
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

describe('DEFAULT_OPTIONS', () => {
  it('should have consistent default properties', () => {
    expect(DEFAULT_OPTIONS).toMatchSnapshot();
  });

  it('should have required properties defined', () => {
    expect(DEFAULT_OPTIONS.name).toBeDefined();
    expect(DEFAULT_OPTIONS.version).toBeDefined();
    expect(DEFAULT_OPTIONS.docsPath).toBeDefined();
    expect(DEFAULT_OPTIONS.llmsFilesPath).toBeDefined();
  });
});

describe('context-based options', () => {
  it('should set and get options from context', () => {
    const testOptions = { ...DEFAULT_OPTIONS, docsHost: true } as GlobalOptions;

    const frozen = setOptions(testOptions);

    const retrieved = getOptions();

    expect(Object.isFrozen(retrieved)).toBe(true);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(retrieved.docsHost).toBe(true);
    expect(frozen.docsHost).toBe(true);
  });

  it('should allow different options in different contexts', () => {
    const options1 = { ...DEFAULT_OPTIONS, docsHost: true } as GlobalOptions;
    const options2 = { ...DEFAULT_OPTIONS, docsHost: false } as GlobalOptions;

    // Test that we can set different options
    setOptions(options1);
    expect(getOptions().docsHost).toBe(true);

    setOptions(options2);
    expect(getOptions().docsHost).toBe(false);
  });

  it('should return frozen options from setOptions', () => {
    const testOptions = { ...DEFAULT_OPTIONS, docsHost: true } as GlobalOptions;

    const result = setOptions(testOptions);

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.docsHost).toBe(true);
  });
});
