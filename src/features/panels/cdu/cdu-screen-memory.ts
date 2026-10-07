import { createContext, useContext, useState } from 'react';

import type { CduUnit } from '@/domain/cdu/keys';

export interface UnitMemory {
  seen: boolean;
  extraRows: boolean;
}

/**
 * "Has text appeared since identification" and "have rows 14–15 ever been used", kept per unit so
 * switching CDU 1 → CDU 2 → CDU 1 never resets unit 1's own memory (spec §4.4: "every text line of
 * the selected unit has been blank since the aircraft was identified" — the memory belongs to the
 * unit, not to whichever unit happened to be selected when it last changed). Only an aircraft
 * change (a new `identity`) resets both units' memory.
 */
export interface ScreenMemory {
  identity: string;
  units: Record<CduUnit, UnitMemory>;
}

export const EMPTY_UNIT_MEMORY: UnitMemory = { seen: false, extraRows: false };

const EMPTY_UNITS: Record<CduUnit, UnitMemory> = { 1: EMPTY_UNIT_MEMORY, 2: EMPTY_UNIT_MEMORY };

/**
 * Where the CDU's screen memory lives, outside any one mount of the panel: the shell mounts only
 * the active panel, and a powered-down screen that was live must still be Live (not No FMS) after
 * the pilot visits another panel and comes back (spec §4.4). Read through `useSyncExternalStore`;
 * `record` is called from an effect, never during render, and notifies only on a real change.
 */
export class CduScreenMemoryStore {
  private memory: ScreenMemory | null = null;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): ScreenMemory | null => this.memory;

  /** Stores `unit`'s memory for the aircraft `identity`; a different aircraft starts both units afresh. */
  record(identity: string, unit: CduUnit, next: UnitMemory): void {
    const remembered = this.memory?.identity === identity ? this.memory : null;
    const units = remembered?.units ?? EMPTY_UNITS;
    const current = units[unit];
    if (remembered !== null && current.seen === next.seen && current.extraRows === next.extraRows) {
      return;
    }
    this.memory = { identity, units: { ...units, [unit]: next } };
    this.listeners.forEach((listener) => listener());
  }
}

/** Provided by `CduPreferenceProvider`, which sits at shell level and so outlives the panel. */
export const CduScreenMemoryContext = createContext<CduScreenMemoryStore | null>(null);

/**
 * The shell's screen memory, or — outside a provider (a panel rendered on its own, as the guards
 * do) — one kept for as long as the caller is mounted.
 */
export function useCduScreenMemoryStore(): CduScreenMemoryStore {
  const shared = useContext(CduScreenMemoryContext);
  const [local] = useState(() => new CduScreenMemoryStore());
  return shared ?? local;
}
