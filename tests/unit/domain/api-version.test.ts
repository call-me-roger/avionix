import { isAvionixError } from '@/domain/errors/avionix-error';
import { isApiVersion, negotiateApiVersion } from '@/domain/simulator/api-version';
import type { SimulatorCapabilities } from '@/domain/simulator/types';

function caps(versions: string[]): SimulatorCapabilities {
  return {
    simulatorVersion: '12.4.0',
    rawApiVersions: versions,
    supportedApiVersions: versions.filter(isApiVersion),
  };
}

describe('negotiateApiVersion', () => {
  it('picks v3 when the sim offers v1..v3', () => {
    expect(negotiateApiVersion(caps(['v1', 'v2', 'v3']))).toBe('v3');
  });

  it('picks v2 when v3 is absent', () => {
    expect(negotiateApiVersion(caps(['v1', 'v2']))).toBe('v2');
  });

  it('ignores unknown future versions', () => {
    expect(negotiateApiVersion(caps(['v2', 'v3', 'v9']))).toBe('v3');
  });

  it('respects a custom supported list', () => {
    expect(negotiateApiVersion(caps(['v1', 'v2', 'v3']), ['v2'])).toBe('v2');
  });

  it('throws UNSUPPORTED_API when only v1 is available', () => {
    try {
      negotiateApiVersion(caps(['v1']));
      throw new Error('expected throw');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('UNSUPPORTED_API');
      expect(isAvionixError(error) && error.message).toContain('12.1.4');
    }
  });
});

describe('isApiVersion', () => {
  it('recognizes v1, v2, v3 only', () => {
    expect(isApiVersion('v1')).toBe(true);
    expect(isApiVersion('v3')).toBe(true);
    expect(isApiVersion('v4')).toBe(false);
    expect(isApiVersion('')).toBe(false);
  });
});
