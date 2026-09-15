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
      open: false,
      code: '',
      name: '',
      mdns: true,
      dataDir: '',
    });
  });

  it('returns help and rejects unknown flags and bad ports', () => {
    expect(parseArgs(['--help'])).toBe('help');
    expect(() => parseArgs(['--bogus'])).toThrow('Unknown argument');
    expect(() => parseArgs(['--port', '70000'])).toThrow('--port');
  });

  it('throws when --port, --host, --static or --xplane is missing its value', () => {
    expect(() => parseArgs(['--port'])).toThrow('--port requires a value');
    expect(() => parseArgs(['--host'])).toThrow('--host requires a value');
    expect(() => parseArgs(['--static'])).toThrow('--static requires a value');
    expect(() => parseArgs(['--xplane'])).toThrow('--xplane requires a value');
  });

  it('parses connector flags', () => {
    expect(parseArgs(['--open'])).toMatchObject({ open: true });
    expect(parseArgs(['--code', '123456'])).toMatchObject({ code: '123456' });
    expect(() => parseArgs(['--code', '12'])).toThrow('--code must be six digits');
    expect(parseArgs(['--name', 'My PC'])).toMatchObject({ name: 'My PC' });
    expect(parseArgs(['--no-mdns'])).toMatchObject({ mdns: false });
    expect(parseArgs(['--data-dir', '/tmp/x'])).toMatchObject({ dataDir: '/tmp/x' });
  });

  it('defaults include the connector flags', () => {
    expect(DEFAULTS).toMatchObject({ open: false, mdns: true, name: '', dataDir: '', code: '' });
  });
});
