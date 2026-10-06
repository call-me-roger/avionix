import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { type InstrumentStatus, instrumentStatus } from '@/domain/instruments/labels';
import {
  type GlideslopeState,
  type Marker,
  bearingPointer,
  deviationDots,
  dmeText,
  dmeTimeText,
  glideslopeState,
  lateralValid,
  markerLit,
  toFromWord,
} from '@/domain/navigation/hsi';
import { decodeDataRefString } from '@/domain/simulator/dataref-string';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useUnits } from '@/features/units/UnitsProvider';

type Deviation = { dots: number; pegged: boolean } | null;

export interface NavValues {
  status: InstrumentStatus;
  heading: number | null;
  source: number | null;
  course: number | null;
  lateral: { valid: boolean; dots: Deviation };
  toFrom: 'TO' | 'FROM' | null;
  glideslope: { state: GlideslopeState; dots: Deviation };
  bearing1: number | null;
  bearing2: number | null;
  dme: string | null;
  dmeTime: string | null;
  ident: string | null;
  marker: Marker | null;
  headingBug: number | null;
}

/** The face stands on the card and the course deviation: without them there is no HSI. */
const FACE_NAMES = [D.heading, D.hsiHdef, D.hsiFromTo, D.hsiHorizontal] as const;

/**
 * Every value the HSI and the PFD's deviation scales draw, read as `useInstrumentValues` reads its
 * own: a missing binding or no flight loaded is no value (R8), and freshness is the link's. Each
 * validity rule is applied here, once, so no face can draw a needle X-Plane has flagged (R3, R4,
 * R7, R8): a deviation without its value is invalid, never centred.
 */
export function useNavValues(): NavValues {
  const { snapshot, link } = usePanel();
  const { units } = useUnits();
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const missing = (name: string) => snapshot.compatibility.bindings[name]?.status === 'missing';
  const read = (name: string) =>
    noFlight || missing(name) ? null : firstNumber(snapshot.telemetry[name]?.value);
  /** R9: a `data` DataRef is decoded, never shown as its base64 payload. */
  const text = (name: string) => {
    const value = noFlight || missing(name) ? undefined : snapshot.telemetry[name]?.value;
    return value === undefined ? null : decodeDataRefString(value, 'data');
  };

  const heading = read(D.heading);
  const hdef = read(D.hsiHdef);
  const fromTo = read(D.hsiFromTo);
  const horizontal = read(D.hsiHorizontal);
  const status = instrumentStatus(
    FACE_NAMES.some(missing),
    [heading, hdef, fromTo, horizontal].every((value) => value !== null),
    link.valuesCurrent,
  );

  const source = read(D.hsiSource);
  const lateralDots = deviationDots(hdef);
  const valid = lateralValid(fromTo, horizontal) && lateralDots !== null;

  // A glideslope X-Plane says is received but whose deflection never arrived is flagged, so the
  // pilot sees why there is no diamond on an ILS rather than a scale that looks like a VOR's.
  const vdefDots = deviationDots(read(D.hsiVdef));
  const reported = glideslopeState(read(D.hsiVertical), read(D.hsiGsFlag));
  const gsState: GlideslopeState = reported === 'valid' && vdefDots === null ? 'flagged' : reported;

  const dme = dmeText(read(D.hsiHasDme), read(D.hsiDmeDistance), units.distance);
  const identName = source === 0 ? D.nav1Id : source === 1 ? D.nav2Id : null;

  return {
    status,
    heading,
    source,
    course: read(D.hsiCourse),
    lateral: { valid, dots: valid ? lateralDots : null },
    toFrom: valid ? toFromWord(fromTo) : null,
    glideslope: { state: gsState, dots: gsState === 'valid' ? vdefDots : null },
    bearing1: bearingPointer(read(D.nav1Bearing), read(D.nav1Signal)),
    bearing2: bearingPointer(read(D.nav2Bearing), read(D.nav2Signal)),
    dme,
    dmeTime: dme === null ? null : dmeTimeText(read(D.hsiDmeTime)),
    ident: identName === null ? null : text(identName),
    marker: markerLit(read(D.outerMarker), read(D.middleMarker), read(D.innerMarker)),
    headingBug: read(D.headingBug),
  };
}
