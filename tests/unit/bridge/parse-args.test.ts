import { DEFAULTS, parseArgs } from '../../../scripts/avionix-bridge';

describe('avionix-bridge parseArgs', () => {
  it('returns defaults with no arguments', () => {
    expect(parseArgs([])).toEqual(DEFAULTS);
  });

  it('parses every flag', () => {
    expect(
      parseArgs([
        '--port',
        '9000',
        '--host',
        '192.168.1.5',
        '--xplane',
        '127.0.0.1:8090',
        '--static',
        'out',
      ]),
    ).toEqual({
      port: 9000,
      host: '192.168.1.5',
      xplaneHost: '127.0.0.1',
      xplanePort: 8090,
      staticDir: 'out',
    });
  });

  it('returns help and rejects unknown flags and bad ports', () => {
    expect(parseArgs(['--help'])).toBe('help');
    expect(() => parseArgs(['--bogus'])).toThrow('Unknown argument');
    expect(() => parseArgs(['--port', '70000'])).toThrow('--port');
  });

  it('throws when --host, --static or --xplane is missing its value', () => {
    expect(() => parseArgs(['--host'])).toThrow('--host requires a value');
    expect(() => parseArgs(['--static'])).toThrow('--static requires a value');
    expect(() => parseArgs(['--xplane'])).toThrow('--xplane requires a value');
  });
});
