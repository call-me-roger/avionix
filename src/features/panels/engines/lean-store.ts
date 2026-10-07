import { type EgtSample, type Peaks, advancePeaks } from '@/domain/engines/lean';

export interface LeanState {
  on: boolean;
  /** The aircraft the peaks belong to (`aircraftKey`), so another aircraft starts fresh. */
  aircraft: string | null;
  peaks: Peaks;
}

export const LEAN_OFF: LeanState = { on: false, aircraft: null, peaks: {} };

/**
 * Lean assist's state for the session (spec §4.6): in memory, never persisted, held by the panel's
 * provider so a panel switch keeps the peaks. An external store rather than React state: the
 * section advances it from an effect as EGT arrives, which is how a component feeds a value from
 * outside React (`useSyncExternalStore`) without setting state in an effect.
 */
export class LeanStore {
  private state: LeanState = LEAN_OFF;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): LeanState => this.state;

  toggle(aircraft: string | null): void {
    this.set(this.state.on ? LEAN_OFF : { on: true, aircraft, peaks: {} });
  }

  advance(aircraft: string | null, samples: readonly EgtSample[]): void {
    if (!this.state.on) {
      return;
    }
    const sameAircraft = aircraft === this.state.aircraft;
    const peaks = advancePeaks(sameAircraft ? this.state.peaks : {}, samples);
    if (sameAircraft && peaks === this.state.peaks) {
      return;
    }
    this.set({ on: true, aircraft, peaks });
  }

  private set(next: LeanState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
