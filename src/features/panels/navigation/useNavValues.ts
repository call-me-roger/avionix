import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { type InstrumentStatus, instrumentStatus } from '@/domain/instruments/labels';
import {
  type GlideslopeState,
  type Marker,
  bearingPointer,
  deviationDots,
  dmeSpeedText,
  dmeSpeedWords,
  dmeText,
  dmeTimeText,
  dmeWords,
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

/** X-Plane's glideslope state, or `unavailable` when the aircraft lacks one of its DataRefs. */
export type GlideslopeDisplay = GlideslopeState | 'unavailable';

export interface NavValues {
  status: InstrumentStatus;
  heading: number | null;
  source: number | null;
  course: number | null;
  /** `unavailable`: a course-deviation DataRef is missing on the aircraft, not merely flagged. */
  lateral: { valid: boolean; unavailable: boolean; dots: Deviation };
  toFrom: 'TO' | 'FROM' | null;
  glideslope: { state: GlideslopeDisplay; dots: Deviation };
  bearing1: number | null;
  bearing2: number | null;
  dme: string | null;
  /** The same distance with its unit in words, for the accessible label. */
  dmeSpoken: string | null;
  dmeTime: string | null;
  /** The DME's groundspeed, `110 KT`, only with the distance (R8); and in words. */
  dmeSpeed: string | null;
  dmeSpeedSpoken: string | null;
  ident: string | null;
  marker: Marker | null;
  headingBug: number | null;
}

const LATERAL_NAMES = [D.hsiHdef, D.hsiFromTo, D.hsiHorizontal] as const;
const GLIDESLOPE_NAMES = [D.hsiVdef, D.hsiVertical, D.hsiGsFlag] as const;

/** NAV1 and NAV2 name their station; a GPS source has no navaid identifier (R9: blank). */
function identDataRef(source: number | null): string | null {
  if (source === 0) {
    return D.nav1Id;
  }
  return source === 1 ? D.nav2Id : null;
}

/**
 * Every value the HSI and the PFD's deviation scales draw, read as `useInstrumentValues` reads its
 * own: a missing binding or no flight loaded is no value (R8), and freshness is the link's. The face
 * stands on the heading alone (R11): a missing deviation or glideslope DataRef marks only its own
 * part unavailable. Each validity rule is applied here, once, so no face can draw a needle X-Plane
 * has flagged (R3, R4, R7, R8): a deviation without its value is invalid, never centred.
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
  const status = instrumentStatus(missing(D.heading), heading !== null, link.valuesCurrent);

  const source = read(D.hsiSource);
  // Not yet sampled stays invalid through `lateralValid`, and so shows the NAV flag.
  const lateralUnavailable = LATERAL_NAMES.some(missing);
  const lateralDots = deviationDots(read(D.hsiHdef));
  const fromTo = read(D.hsiFromTo);
  const valid =
    !lateralUnavailable && lateralValid(fromTo, read(D.hsiHorizontal)) && lateralDots !== null;

  // A glideslope X-Plane says is received but whose deflection never arrived is flagged, so the
  // pilot sees why there is no diamond on an ILS rather than a scale that looks like a VOR's.
  const vdefDots = deviationDots(read(D.hsiVdef));
  const reported = glideslopeState(read(D.hsiVertical), read(D.hsiGsFlag));
  let gsState: GlideslopeDisplay = reported;
  if (GLIDESLOPE_NAMES.some(missing)) {
    gsState = 'unavailable';
  } else if (reported === 'valid' && vdefDots === null) {
    gsState = 'flagged';
  }

  const hasDme = read(D.hsiHasDme);
  const distance = read(D.hsiDmeDistance);
  const dme = dmeText(hasDme, distance, units.distance);
  const knots = read(D.hsiDmeSpeed);
  // Only with a received course: a stale ident must never read as a station being received.
  const identName = valid ? identDataRef(source) : null;

  return {
    status,
    heading,
    source,
    course: read(D.hsiCourse),
    lateral: { valid, unavailable: lateralUnavailable, dots: valid ? lateralDots : null },
    toFrom: valid ? toFromWord(fromTo) : null,
    glideslope: { state: gsState, dots: gsState === 'valid' ? vdefDots : null },
    bearing1: bearingPointer(read(D.nav1Bearing), read(D.nav1Signal)),
    bearing2: bearingPointer(read(D.nav2Bearing), read(D.nav2Signal)),
    dme,
    dmeSpoken: dme === null ? null : dmeWords(hasDme, distance, units.distance),
    dmeTime: dme === null ? null : dmeTimeText(read(D.hsiDmeTime)),
    dmeSpeed: dmeSpeedText(hasDme, distance, knots),
    dmeSpeedSpoken: dmeSpeedWords(hasDme, distance, knots),
    ident: identName === null ? null : text(identName),
    marker: markerLit(read(D.outerMarker), read(D.middleMarker), read(D.innerMarker)),
    headingBug: read(D.headingBug),
  };
}
