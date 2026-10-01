import { useMemo } from 'react';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { baroShort, baroWords, formatBaro } from '@/domain/instruments/baro';
import {
  type InstrumentStatus,
  instrumentStatus,
  machShown,
  radioAltitudeShown,
} from '@/domain/instruments/labels';
import { type SpeedMarkings, speedMarkings } from '@/domain/instruments/speed-markings';
import type { DataRefValue } from '@/domain/simulator/types';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useUnits } from '@/features/units/UnitsProvider';

export interface InstrumentValues {
  airspeed: { status: InstrumentStatus; knots: number | null; mach: number | null };
  attitude: { status: InstrumentStatus; pitch: number | null; roll: number | null };
  altitude: {
    status: InstrumentStatus;
    feet: number | null;
    radioAltitude: number | null;
    baroShort: string | null;
    baroText: string | null;
    baroWords: string | null;
  };
  verticalSpeed: { status: InstrumentStatus; fpm: number | null };
  heading: { status: InstrumentStatus; degrees: number | null };
  turn: { status: InstrumentStatus; rate: number | null; slip: number | null };
  markings: SpeedMarkings | null;
}

/** A finite number, or the first element of a numeric array; anything else is no value. */
export function firstNumber(value: DataRefValue | undefined): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

/**
 * Every instrument value, read once per render and reduced to primitives, so each `React.memo`
 * instrument re-renders only when its own numbers change (spec: "Performance"). No flight loaded
 * means no values at all (R8); freshness is the link's, never a sample's (spec: "Values and states").
 */
export function useInstrumentValues(): InstrumentValues {
  const { snapshot, link } = usePanel();
  const { units } = useUnits();
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const missing = (name: string) => snapshot.compatibility.bindings[name]?.status === 'missing';
  const read = (name: string) =>
    noFlight || missing(name) ? null : firstNumber(snapshot.telemetry[name]?.value);
  const current = link.valuesCurrent;
  const status = (names: readonly string[], values: readonly (number | null)[]) =>
    instrumentStatus(
      names.some(missing),
      values.every((value) => value !== null),
      current,
    );

  const knots = read(D.airspeed);
  const pitch = read(D.pitch);
  const roll = read(D.roll);
  const feet = read(D.altitude);
  const fpm = read(D.verticalSpeed);
  const degrees = read(D.heading);
  const rate = read(D.turnRate);
  const slip = read(D.slip);
  const baro = read(D.barometer);
  const unit = units.pressure;
  // Null while out of the shown band, so a radio altitude moving at cruise or a Mach number
  // creeping below 0.40 re-renders nothing; every drawing and label applies the same test.
  const mach = read(D.mach);
  const radioAltitude = read(D.radioAltitude);

  const vso = read(D.vso);
  const vs = read(D.vs);
  const vfe = read(D.vfe);
  const vno = read(D.vno);
  const vne = read(D.vne);
  const markings = useMemo<SpeedMarkings | null>(
    () => speedMarkings({ vso, vs, vfe, vno, vne }),
    [vso, vs, vfe, vno, vne],
  );

  // Turn and slip share a face: it is unavailable only when both are missing, and shows whichever
  // part has a value.
  const turnMissing = missing(D.turnRate) && missing(D.slip);
  const turnStatus: InstrumentStatus = instrumentStatus(
    turnMissing,
    rate !== null || slip !== null,
    current,
  );

  return {
    airspeed: {
      status: status([D.airspeed], [knots]),
      knots,
      mach: machShown(mach) ? mach : null,
    },
    attitude: { status: status([D.pitch, D.roll], [pitch, roll]), pitch, roll },
    altitude: {
      status: status([D.altitude], [feet]),
      feet,
      radioAltitude: radioAltitudeShown(radioAltitude) ? radioAltitude : null,
      baroShort: baro === null ? null : baroShort(baro, unit),
      baroText: baro === null ? null : formatBaro(baro, unit),
      baroWords: baro === null ? null : baroWords(baro, unit),
    },
    verticalSpeed: { status: status([D.verticalSpeed], [fpm]), fpm },
    heading: { status: status([D.heading], [degrees]), degrees },
    turn: { status: turnStatus, rate, slip },
    markings,
  };
}
