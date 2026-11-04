import { splitServerClientArgv } from '../cli.client';

describe('splitServerClientArgv', () => {
  it('forwards npm start server flags and keeps the search query', () => {
    expect(splitServerClientArgv(['--log-stderr', '--client', 'button'])).toEqual({
      clientArgv: ['button'],
      serverExtraArgs: ['--log-stderr']
    });
  });

  it('leaves pf-client subcommands untouched', () => {
    expect(splitServerClientArgv(['search', 'modal', '--json'])).toEqual({
      clientArgv: ['search', 'modal', '--json'],
      serverExtraArgs: []
    });
  });

  it('retains collection flags in clientArgv for subcommands and interactive search', () => {
    expect(splitServerClientArgv(['search', 'modal', '-c', 'patternfly-docs', '--json'])).toEqual({
      clientArgv: ['search', 'modal', '-c', 'patternfly-docs', '--json'],
      serverExtraArgs: []
    });

    expect(splitServerClientArgv(['--log-stderr', '--client', 'modal', '--collection', 'patternfly-api'])).toEqual({
      clientArgv: ['modal', '--collection', 'patternfly-api'],
      serverExtraArgs: ['--log-stderr']
    });

    expect(splitServerClientArgv(['--log-stderr', '--client', 'modal', '-c', 'patternfly-docs'])).toEqual({
      clientArgv: ['modal', '-c', 'patternfly-docs'],
      serverExtraArgs: ['--log-stderr']
    });
  });
});
