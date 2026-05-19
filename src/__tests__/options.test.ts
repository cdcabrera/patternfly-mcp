import { parseCliOptions, parseProgrammaticOptions, type ProgrammaticOptions } from '../options';

describe('parseCliOptions', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it.each([
    {
      description: 'with --verbose flag',
      args: ['node', 'script.js', '--verbose']
    },
    {
      description: 'with --verbose flag and --log-level flag',
      args: ['node', 'script.js', '--verbose', '--log-level', 'warn']
    },
    {
      description: 'with --log-level flag',
      args: ['node', 'script.js', '--log-level', 'warn']
    },
    {
      description: 'with --log-stderr flag and --log-protocol flag',
      args: ['node', 'script.js', '--log-stderr', '--log-protocol']
    },
    {
      description: 'with other arguments',
      args: ['node', 'script.js', 'other', 'args']
    },
    {
      description: 'with --http flag',
      args: ['node', 'script.js', '--http']
    },
    {
      description: 'with --http and --port',
      args: ['node', 'script.js', '--http', '--port', '6000']
    },
    {
      description: 'with --http and invalid --port',
      args: ['node', 'script.js', '--http', '--port', '0']
    },
    {
      description: 'with --http and --host',
      args: ['node', 'script.js', '--http', '--host', '0.0.0.0']
    },
    {
      description: 'with --allowed-origins',
      args: ['node', 'script.js', '--http', '--allowed-origins', 'https://app.com,https://admin.app.com']
    },
    {
      description: 'with --allowed-hosts',
      args: ['node', 'script.js', '--http', '--allowed-hosts', 'localhost,127.0.0.1']
    },
    {
      description: 'with --tool',
      args: ['node', 'script.js', '--tool', 'my-tool', '--tool', 'my-other-tool']
    },
    {
      description: 'with --plugin-isolation strict',
      args: ['node', 'script.js', '--plugin-isolation', 'STRICT']
    },
    {
      description: 'with --plugin-isolation none',
      args: ['node', 'script.js', '--plugin-isolation', 'none']
    },
    {
      description: 'with --plugin-isolation undefined',
      args: ['node', 'script.js', '--plugin-isolation', '--verbose']
    }
    // {
    //  description: 'with experimental prefixes',
    //  args: ['node', 'script.js', '--experimental-context-management', 'strict']
    // }
  ])('should attempt to parse args $description', ({ args = [] }) => {
    const result = parseCliOptions(args);

    expect(result).toMatchSnapshot();
  });

  it('parses from a provided argv independent of process.argv', () => {
    const customArgv = ['node', 'cli', '--http', '--port', '3101'];
    const { options } = parseCliOptions(customArgv);

    expect(options.http?.port).toBe(3101);
  });

  it('trims spaces in list flags', () => {
    const argv = ['node', 'cli', '--http', '--allowed-hosts', ' localhost , 127.0.0.1  '];
    const { options } = parseCliOptions(argv);

    expect(options.http?.allowedHosts).toEqual(['localhost', '127.0.0.1']);
  });

  it('does not apply HTTP flags when --http is absent', () => {
    const { options } = parseCliOptions(['node', 'cli', '--port', '9000', '--host', '0.0.0.0']);

    expect(options.isHttp).toBe(false);
    expect(options.http).toBeUndefined();
  });

  it('tolerates an explicitly undefined experimental registry', () => {
    const { options, experimentalOptions } = parseCliOptions(['node', 'cli', '--verbose'], undefined);

    expect(options.logging.level).toBe('debug');
    expect(experimentalOptions).toEqual([]);
  });

  it('ignores direct CLI flags for registered experimental options', () => {
    const registry = new Set(['pluginIsolation']);
    const directKebab = parseCliOptions(['node', 'cli', '--plugin-isolation', 'none'], registry);
    const directCamel = parseCliOptions(['node', 'cli', '--pluginIsolation', 'none'], registry);

    expect(directKebab.options.pluginIsolation).toBeUndefined();
    expect(directCamel.options.pluginIsolation).toBeUndefined();
    expect(directKebab.experimentalOptions).toEqual([]);
    expect(directCamel.experimentalOptions).toEqual([]);
  });

  it('applies registered experimental options via --experimental- prefix', () => {
    const registry = new Set(['pluginIsolation']);
    const { options, experimentalOptions } = parseCliOptions(
      ['node', 'cli', '--experimental-plugin-isolation', 'none'],
      registry
    );

    expect(options.pluginIsolation).toBe('none');
    expect(experimentalOptions).toEqual(['pluginIsolation']);
  });

  it('dedupes repeated experimental CLI flags', () => {
    const registry = new Set(['pluginIsolation']);
    const { experimentalOptions } = parseCliOptions(
      [
        'node',
        'cli',
        '--experimental-plugin-isolation',
        'none',
        '--experimental-plugin-isolation',
        'strict'
      ],
      registry
    );

    expect(experimentalOptions).toEqual(['pluginIsolation']);
  });
});

describe('parseProgrammaticOptions', () => {
  it('maps experimental-prefixed keys when registered', () => {
    const registry = new Set(['pluginIsolation']);
    const { options, experimentalOptions } = parseProgrammaticOptions(
      { experimentalPluginIsolation: 'none', pluginIsolation: 'strict' } as ProgrammaticOptions,
      registry
    );

    expect(options.pluginIsolation).toBe('none');
    expect(experimentalOptions).toEqual(['pluginIsolation']);
  });

  it('passes through the experimental metadata array unchanged', () => {
    const { options, experimentalOptions } = parseProgrammaticOptions({
      experimental: ['pluginIsolation']
    } as Parameters<typeof parseProgrammaticOptions>[0]);

    expect(options.experimental).toEqual(['pluginIsolation']);
    expect(experimentalOptions).toEqual([]);
  });

  it('ignores experimental-prefixed keys that are not registered', () => {
    const { options, experimentalOptions } = parseProgrammaticOptions({
      experimentalPluginIsolation: 'none'
    } as ProgrammaticOptions);

    expect(options.pluginIsolation).toBeUndefined();
    expect(experimentalOptions).toEqual([]);
  });

  it('tolerates an explicitly undefined experimental registry', () => {
    const { options, experimentalOptions } = parseProgrammaticOptions(
      { logging: { level: 'warn' } },
      undefined
    );

    expect(options.logging?.level).toBe('warn');
    expect(experimentalOptions).toEqual([]);
  });

});
