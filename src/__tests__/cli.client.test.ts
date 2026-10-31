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
});
