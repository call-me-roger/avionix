import { isAvionixError } from '@/domain/errors/avionix-error';
import type { DataRefDescriptor } from '@/domain/simulator/types';
import { ResolutionCache, createDataRefRepository } from '@/infrastructure/xplane/resolution-cache';

function makeLookup(table: Record<string, DataRefDescriptor>) {
  const calls: string[] = [];
  const lookup = jest.fn(async (name: string) => {
    calls.push(name);
    return table[name] ?? null;
  });
  return { lookup, calls };
}

const table: Record<string, DataRefDescriptor> = {
  'sim/a': { id: 1, name: 'sim/a', valueType: 'float' },
  'sim/b': { id: 2, name: 'sim/b', valueType: 'int' },
};

describe('ResolutionCache', () => {
  it('resolves on first call and serves cache hits afterwards', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    await expect(cache.resolve('sim/a')).resolves.toEqual(table['sim/a']);
    await expect(cache.resolve('sim/a')).resolves.toEqual(table['sim/a']);
    expect(calls).toEqual(['sim/a']);
    expect(cache.peek('sim/a')).toEqual(table['sim/a']);
    expect(cache.peek('sim/b')).toBeUndefined();
  });

  it('de-duplicates concurrent in-flight lookups', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    await Promise.all([cache.resolve('sim/a'), cache.resolve('sim/a'), cache.resolve('sim/a')]);
    expect(calls).toEqual(['sim/a']);
  });

  it('resolveMany resolves each unique name once and preserves order', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    const result = await cache.resolveMany(['sim/b', 'sim/a', 'sim/b']);
    expect(result.map((d) => d.id)).toEqual([2, 1, 2]);
    expect(calls.sort()).toEqual(['sim/a', 'sim/b']);
  });

  it('throws DATAREF_NOT_FOUND for unknown names and does not cache the miss', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    for (let i = 0; i < 2; i += 1) {
      try {
        await cache.resolve('sim/missing');
        throw new Error('expected rejection');
      } catch (error) {
        expect(isAvionixError(error) && error.code).toBe('DATAREF_NOT_FOUND');
        expect(isAvionixError(error) && error.message).toContain('sim/missing');
      }
    }
    expect(calls).toEqual(['sim/missing', 'sim/missing']);
  });

  it('propagates lookup failures and allows retry', async () => {
    let fail = true;
    const lookup = jest.fn(async (name: string) => {
      if (fail) {
        throw new Error('network');
      }
      return table[name] ?? null;
    });
    const cache = new ResolutionCache({
      lookup,
      notFoundCode: 'DATAREF_NOT_FOUND',
      kind: 'dataref',
    });
    await expect(cache.resolve('sim/a')).rejects.toThrow('network');
    fail = false;
    await expect(cache.resolve('sim/a')).resolves.toEqual(table['sim/a']);
  });

  it('clear forgets everything so a new session re-resolves ids', async () => {
    const { lookup, calls } = makeLookup(table);
    const cache = createDataRefRepository({ findDataRef: lookup });
    await cache.resolve('sim/a');
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
    await cache.resolve('sim/a');
    expect(calls).toEqual(['sim/a', 'sim/a']);
  });
});
