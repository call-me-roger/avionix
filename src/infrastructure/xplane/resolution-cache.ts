import { AvionixError } from '@/domain/errors/avionix-error';
import type { SimulatorClient } from '@/domain/simulator/simulator-client';
import type { CommandDescriptor, DataRefDescriptor } from '@/domain/simulator/types';

export interface ResolutionCacheOptions<T> {
  lookup: (name: string) => Promise<T | null>;
  notFoundCode: 'DATAREF_NOT_FOUND' | 'COMMAND_NOT_FOUND';
  kind: string;
}

/**
 * Caches name → descriptor lookups for the lifetime of one simulator session.
 * Numeric ids are only valid for the current X-Plane session; call clear()
 * whenever a new connection is established.
 */
export class ResolutionCache<T extends { id: number; name: string }> {
  private readonly resolved = new Map<string, T>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(private readonly options: ResolutionCacheOptions<T>) {}

  get size(): number {
    return this.resolved.size;
  }

  peek(name: string): T | undefined {
    return this.resolved.get(name);
  }

  resolve(name: string): Promise<T> {
    const cached = this.resolved.get(name);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    const pending = this.inFlight.get(name);
    if (pending !== undefined) {
      return pending;
    }
    const lookup = this.options
      .lookup(name)
      .then((descriptor) => {
        if (descriptor === null) {
          throw new AvionixError({
            code: this.options.notFoundCode,
            message: `X-Plane has no ${this.options.kind} named "${name}"`,
          });
        }
        this.resolved.set(name, descriptor);
        return descriptor;
      })
      .finally(() => {
        this.inFlight.delete(name);
      });
    this.inFlight.set(name, lookup);
    return lookup;
  }

  resolveMany(names: readonly string[]): Promise<T[]> {
    return Promise.all(names.map((name) => this.resolve(name)));
  }

  clear(): void {
    this.resolved.clear();
    this.inFlight.clear();
  }
}

export type DataRefRepository = ResolutionCache<DataRefDescriptor>;
export type CommandRepository = ResolutionCache<CommandDescriptor>;

export function createDataRefRepository(
  client: Pick<SimulatorClient, 'findDataRef'>,
): DataRefRepository {
  return new ResolutionCache({
    lookup: (name) => client.findDataRef(name),
    notFoundCode: 'DATAREF_NOT_FOUND',
    kind: 'dataref',
  });
}

export function createCommandRepository(
  client: Pick<SimulatorClient, 'findCommand'>,
): CommandRepository {
  return new ResolutionCache({
    lookup: (name) => client.findCommand(name),
    notFoundCode: 'COMMAND_NOT_FOUND',
    kind: 'command',
  });
}
