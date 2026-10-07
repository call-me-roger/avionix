import { GAUGES, type GaugeId } from '@/domain/engines/catalogue';

/**
 * Laminar's `acf_en_type`: 0 carburetted and 1 injected piston, 3 electric, 5 single-spool jet,
 * 6 rocket, 7 multi-spool jet, 9 free and 10 fixed turboprop. Anything else (rocket included, and
 * a missing entry) has no gauge set (spec §4.2).
 */
export type EngineKind =
  'piston' | 'turboprop' | 'jet' | 'singleSpoolJet' | 'electric' | 'unsupported';

export function engineKind(type: number | null): EngineKind {
  switch (type) {
    case 0:
    case 1:
      return 'piston';
    case 3:
      return 'electric';
    case 5:
      return 'singleSpoolJet';
    case 7:
      return 'jet';
    case 9:
    case 10:
      return 'turboprop';
    default:
      return 'unsupported';
  }
}

export interface GaugeSet {
  /** The primary gauge, drawn as a dial. */
  dial: GaugeId | null;
  /** The table rows, in order. */
  rows: readonly GaugeId[];
}

/** Spec §4.2. Electric engines have no fuel flow or oil: those rows would only ever read zero. */
export const GAUGE_SETS: Record<EngineKind, GaugeSet> = {
  piston: { dial: 'rpm', rows: ['map', 'ff', 'egt', 'cht', 'oilP', 'oilT'] },
  turboprop: { dial: 'trq', rows: ['itt', 'prop', 'n1', 'ff', 'oilP', 'oilT'] },
  jet: { dial: 'n1', rows: ['egt', 'n2', 'ff', 'oilP', 'oilT', 'epr'] },
  singleSpoolJet: { dial: 'n1', rows: ['egt', 'ff', 'oilP', 'oilT', 'epr'] },
  electric: { dial: 'rpm', rows: ['trq'] },
  unsupported: { dial: null, rows: [] },
};

/** A turboprop's N1 is its gas generator speed, NG on the PT6 gauges this mirrors. */
export function gaugeLegend(id: GaugeId, kind: EngineKind): string {
  return id === 'n1' && kind === 'turboprop' ? 'NG' : GAUGES[id].legend;
}

export function gaugeSpoken(id: GaugeId, kind: EngineKind): string {
  return id === 'n1' && kind === 'turboprop' ? 'NG' : GAUGES[id].spoken;
}
