import {
  DEFAULT_PORT,
  createConnectionConfig,
  validateHost,
  validatePort,
} from '@/domain/connection/connection-config';
import { isAvionixError } from '@/domain/errors/avionix-error';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return isAvionixError(error) ? error.code : 'NOT_AVIONIX';
  }
}

describe('validateHost', () => {
  it('accepts IPv4 addresses and hostnames, trimming whitespace', () => {
    expect(validateHost('192.168.1.100')).toBe('192.168.1.100');
    expect(validateHost('  10.0.0.50 ')).toBe('10.0.0.50');
    expect(validateHost('sim-pc')).toBe('sim-pc');
    expect(validateHost('SimPC.local')).toBe('simpc.local');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['http://192.168.1.1', 'scheme'],
    ['192.168.1.1:8086', 'port suffix'],
    ['192.168.1.1/api', 'path'],
    ['256.1.1.1', 'octet out of range'],
    ['192.168.1', 'too few octets'],
    ['host name', 'inner whitespace'],
    ['-bad.host', 'leading hyphen'],
    ['::1', 'IPv6 not supported'],
  ])('rejects %s (%s) with INVALID_HOST', (input) => {
    expect(codeOf(() => validateHost(input))).toBe('INVALID_HOST');
  });
});

describe('validatePort', () => {
  it('accepts integers 1..65535 as number or string', () => {
    expect(validatePort(8086)).toBe(8086);
    expect(validatePort('8086')).toBe(8086);
    expect(validatePort(' 1 ')).toBe(1);
    expect(validatePort(65535)).toBe(65535);
  });

  it.each(['', 'abc', '0', '65536', '80.5', '-1', '8086abc'])(
    'rejects %s with INVALID_PORT',
    (input) => {
      expect(codeOf(() => validatePort(input))).toBe('INVALID_PORT');
    },
  );

  it('rejects non-integer and out of range numbers', () => {
    expect(codeOf(() => validatePort(1.5))).toBe('INVALID_PORT');
    expect(codeOf(() => validatePort(0))).toBe('INVALID_PORT');
    expect(codeOf(() => validatePort(Number.NaN))).toBe('INVALID_PORT');
  });
});

describe('createConnectionConfig', () => {
  it('builds a normalized config', () => {
    expect(createConnectionConfig(' 192.168.1.100 ', '8086')).toEqual({
      host: '192.168.1.100',
      port: 8086,
    });
  });

  it('exposes the X-Plane default port', () => {
    expect(DEFAULT_PORT).toBe(8080);
  });
});
