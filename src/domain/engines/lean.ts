import type { EnginesModel, GaugeReading } from '@/domain/engines/engine-page';
import { convertTemperatureDelta } from '@/domain/engines/units';
import { groupedWhole } from '@/domain/units/numbers';
import type { UnitPreferences } from '@/domain/units/units';

/** Engine number → the highest EGT seen since LEAN went on, in the EGT's source unit. */
export type Peaks = Readonly<Record<number, number>>;

export interface EgtSample {
  engine: number;
  value: number | null;
}

/** The piston engines' EGT (spec §4.6: lean assist is piston only). */
export function egtSamples(model: EnginesModel): EgtSample[] {
  return model.columns
    .filter((column) => column.kind === 'piston' && column.cells.egt !== undefined)
    .map((column) => ({ engine: column.engine, value: column.cells.egt?.value ?? null }));
}

/** The LEAN key is shown when at least one piston engine has an EGT gauge. */
export function leanAvailable(model: EnginesModel): boolean {
  return model.status === 'ready' && egtSamples(model).length > 0;
}

/** Raises each engine's peak to its current EGT; the same object when nothing rose. */
export function advancePeaks(peaks: Peaks, samples: readonly EgtSample[]): Peaks {
  let next: Record<number, number> | null = null;
  for (const { engine, value } of samples) {
    const peak = peaks[engine];
    if (value !== null && (peak === undefined || value > peak)) {
      next = next ?? { ...peaks };
      next[engine] = value;
    }
  }
  return next ?? peaks;
}

export interface LeanDelta {
  text: string;
  spoken: string;
}

/** ΔPEAK: the current EGT minus the peak, in the pilot's unit (as reported when unknown). */
export function leanDelta(
  egt: GaugeReading,
  peak: number | undefined,
  units: UnitPreferences,
): LeanDelta {
  if (egt.value === null || peak === undefined || egt.source === 'pending') {
    return { text: '—', spoken: `Engine ${egt.engine}, no peak EGT yet` };
  }
  const raw = egt.value - peak;
  const delta =
    egt.source === 'C' || egt.source === 'F'
      ? convertTemperatureDelta(raw, egt.source, units.temperature)
      : raw;
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return { text: '0', spoken: `Engine ${egt.engine} at peak EGT` };
  }
  return {
    text: groupedWhole(rounded),
    spoken: `Engine ${egt.engine} ${Math.abs(rounded)} degrees ${rounded < 0 ? 'below' : 'above'} peak EGT`,
  };
}
