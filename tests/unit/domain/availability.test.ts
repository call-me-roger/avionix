import {
  type BindingResults,
  FEATURE_STATUS_LABEL,
  deriveAvailability,
  deriveFeatureAvailability,
  summariseAvailability,
} from '@/domain/aircraft/availability';
import type { FeatureSpec } from '@/domain/aircraft/profile';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';

const feature: FeatureSpec = {
  id: 'radios',
  label: 'Radios',
  bindings: [
    { kind: 'dataref', name: 'com1', required: true, write: true, purpose: 'COM1 frequency' },
    { kind: 'dataref', name: 'com2', required: false, purpose: 'COM2 frequency' },
    { kind: 'command', name: 'swap', required: true, purpose: 'Standby swap' },
  ],
};

function results(entries: Record<string, 'ok' | 'missing' | 'readOnly'>): BindingResults {
  const out: BindingResults = {};
  for (const [name, status] of Object.entries(entries)) {
    out[name] = { name, kind: name === 'swap' ? 'command' : 'dataref', status };
  }
  return out;
}

describe('deriveFeatureAvailability', () => {
  it('is available when every binding resolved', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'ok', com2: 'ok', swap: 'ok' }),
    );
    expect(derived).toEqual({ id: 'radios', label: 'Radios', status: 'available', missing: [] });
  });

  it('is partly available when only an optional binding is missing, and names it', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'ok', com2: 'missing', swap: 'ok' }),
    );
    expect(derived.status).toBe('partial');
    expect(derived.missing).toEqual([
      { name: 'com2', kind: 'dataref', purpose: 'COM2 frequency', status: 'missing' },
    ]);
  });

  it('is unavailable when a required binding is missing', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'ok', com2: 'ok', swap: 'missing' }),
    );
    expect(derived.status).toBe('unavailable');
    expect(derived.missing.map((item) => item.name)).toEqual(['swap']);
  });

  it('is unavailable when a required binding it writes to is read-only', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'readOnly', com2: 'ok', swap: 'ok' }),
    );
    expect(derived.status).toBe('unavailable');
    expect(derived.missing[0]?.status).toBe('readOnly');
  });

  it('lists every miss, not only the first', () => {
    const derived = deriveFeatureAvailability(
      feature,
      results({ com1: 'missing', com2: 'missing', swap: 'missing' }),
    );
    expect(derived.missing).toHaveLength(3);
  });

  it('is unknown when any binding was never probed', () => {
    expect(deriveFeatureAvailability(feature, {}).status).toBe('unknown');
    expect(deriveFeatureAvailability(feature, results({ com1: 'ok' })).status).toBe('unknown');
  });

  it('is available when the feature declares no bindings at all', () => {
    expect(
      deriveFeatureAvailability({ id: 'empty', label: 'Empty', bindings: [] }, {}).status,
    ).toBe('available');
  });
});

describe('deriveAvailability', () => {
  it('derives one entry per profile feature, in declaration order', () => {
    const derived = deriveAvailability(GENERIC_PROFILE, {});
    expect(derived.map((item) => item.id)).toEqual(GENERIC_PROFILE.features.map((item) => item.id));
  });
});

describe('summariseAvailability', () => {
  const entry = (id: string, status: 'available' | 'partial' | 'unavailable' | 'unknown') => ({
    id,
    label: id,
    status,
    missing: [],
  });

  it('says so when everything is available', () => {
    expect(summariseAvailability([entry('a', 'available'), entry('b', 'available')])).toBe(
      'All features available',
    );
  });

  it('counts what is degraded, worst first', () => {
    expect(
      summariseAvailability([
        entry('a', 'available'),
        entry('b', 'partial'),
        entry('c', 'unavailable'),
        entry('d', 'unavailable'),
      ]),
    ).toBe('2 features not available, 1 partly available');
  });

  it('counts what has not been checked', () => {
    expect(summariseAvailability([entry('a', 'unknown')])).toBe('1 feature not checked yet');
  });

  it('says nothing was checked when the profile has no features', () => {
    expect(summariseAvailability([])).toBe('No features to check');
  });
});

describe('FEATURE_STATUS_LABEL', () => {
  it('gives every status words the pilot reads', () => {
    expect(FEATURE_STATUS_LABEL).toEqual({
      available: 'available',
      partial: 'partly available',
      unavailable: 'not available on this aircraft',
      unknown: 'not checked yet',
    });
  });
});
