import { isAvionixError } from '@/domain/errors/avionix-error';
import type { CommandDescriptor, DataRefDescriptor } from '@/domain/simulator/types';
import {
  ResolutionCache,
  createCommandRepository,
  createDataRefRepository,
} from '@/infrastructure/xplane/resolution-cache';

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

  it('a lookup still in flight when clear() runs does not repopulate the cache', async () => {
    let release!: (value: DataRefDescriptor | null) => void;
    const lookup = jest.fn(
      () =>
        new Promise<DataRefDescriptor | null>((resolve) => {
          release = resolve;
        }),
    );
    const cache = new ResolutionCache({
      lookup,
      notFoundCode: 'DATAREF_NOT_FOUND',
      kind: 'dataref',
    });
    const pending = cache.resolve('sim/a');
    cache.clear();
    release(table['sim/a'] ?? null);
    await expect(pending).resolves.toEqual(table['sim/a']);
    expect(cache.size).toBe(0);
    expect(cache.peek('sim/a')).toBeUndefined();
  });

  it('a stale completion does not evict a newer in-flight lookup for the same name', async () => {
    let releaseA!: (value: DataRefDescriptor | null) => void;
    let releaseB!: (value: DataRefDescriptor | null) => void;
    let callCount = 0;
    const lookup = jest.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<DataRefDescriptor | null>((resolve) => {
          releaseA = resolve;
        });
      }
      return new Promise<DataRefDescriptor | null>((resolve) => {
        releaseB = resolve;
      });
    });
    const cache = new ResolutionCache({
      lookup,
      notFoundCode: 'DATAREF_NOT_FOUND',
      kind: 'dataref',
    });
    const pendingA = cache.resolve('sim/a');
    cache.clear();
    const pendingB = cache.resolve('sim/a');
    releaseA(table['sim/a'] ?? null);
    await expect(pendingA).resolves.toEqual(table['sim/a']);
    const pendingC = cache.resolve('sim/a');
    expect(pendingC).toBe(pendingB);
    expect(lookup).toHaveBeenCalledTimes(2);
    releaseB(table['sim/a'] ?? null);
    await expect(pendingB).resolves.toEqual(table['sim/a']);
    expect(cache.size).toBe(1);
  });

  it('createCommandRepository resolves a CommandDescriptor and throws COMMAND_NOT_FOUND for unknown names', async () => {
    const commandTable: Record<string, CommandDescriptor> = {
      'sim/command': { id: 1, name: 'sim/command', description: 'Test command' },
    };
    const lookup = jest.fn(async (name: string) => commandTable[name] ?? null);
    const cache = createCommandRepository({ findCommand: lookup });
    await expect(cache.resolve('sim/command')).resolves.toEqual(commandTable['sim/command']);
    try {
      await cache.resolve('sim/unknown');
      throw new Error('expected rejection');
    } catch (error) {
      expect(isAvionixError(error) && error.code).toBe('COMMAND_NOT_FOUND');
      expect(isAvionixError(error) && error.message).toContain('sim/unknown');
    }
  });
});
