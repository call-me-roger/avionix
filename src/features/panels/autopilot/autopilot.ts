import type { SessionSnapshot } from '@/application/session-snapshot';
import type { SelectorKind } from '@/domain/autopilot/selectors';
import {
  FEATURE_AIRSPEED_SELECT,
  FEATURE_ALTITUDE_SELECT,
  FEATURE_AUTOPILOT,
  FEATURE_AUTOTHROTTLE,
  FEATURE_FLIGHT_DIRECTOR,
  FEATURE_HEADING_CONTROL,
  FEATURE_MODE_ALT,
  FEATURE_MODE_APR,
  FEATURE_MODE_FLC,
  FEATURE_MODE_HDG,
  FEATURE_MODE_NAV,
  FEATURE_MODE_VS,
  FEATURE_VERTICAL_SPEED_SELECT,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';

export const AUTOPILOT_PANEL: PanelDescriptor = {
  id: 'autopilot',
  title: 'Autopilot',
  features: [
    FEATURE_AUTOPILOT,
    FEATURE_FLIGHT_DIRECTOR,
    FEATURE_AUTOTHROTTLE,
    FEATURE_MODE_HDG,
    FEATURE_MODE_NAV,
    FEATURE_MODE_APR,
    FEATURE_MODE_ALT,
    FEATURE_MODE_VS,
    FEATURE_MODE_FLC,
    FEATURE_HEADING_CONTROL,
    FEATURE_ALTITUDE_SELECT,
    FEATURE_VERTICAL_SPEED_SELECT,
    FEATURE_AIRSPEED_SELECT,
  ],
  supports: EVERYWHERE,
};

/** R10: shown, and every control disabled, while a plugin owns X-Plane's autopilot. */
export const OVERRIDE_NOTICE =
  "Another program is flying X-Plane's autopilot. These controls are off until it hands control back.";

export type SelectorId = 'heading' | 'altitude' | 'verticalSpeed' | 'speed';

export interface SelectorSpec {
  id: SelectorId;
  label: string;
  featureId: string;
  /** The DataRef the selector shows and writes. */
  name: string;
}

export const SELECTORS: readonly SelectorSpec[] = [
  { id: 'heading', label: 'Heading', featureId: FEATURE_HEADING_CONTROL, name: D.headingBug },
  { id: 'altitude', label: 'Altitude', featureId: FEATURE_ALTITUDE_SELECT, name: D.altitudeDial },
  {
    id: 'verticalSpeed',
    label: 'Vertical speed',
    featureId: FEATURE_VERTICAL_SPEED_SELECT,
    name: D.verticalSpeedDial,
  },
  { id: 'speed', label: 'Airspeed', featureId: FEATURE_AIRSPEED_SELECT, name: D.airspeedDial },
];

/** The airspeed selector's kind follows X-Plane's knots/Mach flag. */
export function selectorKind(id: SelectorId, isMach: boolean): SelectorKind {
  if (id === 'speed') {
    return isMach ? 'mach' : 'knots';
  }
  return id;
}

/**
 * The read-back key for a selector: airspeed splits by kind, so a watch started in knots never
 * answers for a step pressed after X-Plane flips to Mach (or back), and never supplies a pending
 * base from the other unit.
 */
export function readBackKey(spec: SelectorSpec, kind: SelectorKind): string {
  return spec.id === 'speed' ? `speed-${kind}` : spec.id;
}

export interface ModeSpec {
  key: string;
  label: string;
  featureId: string;
  status: string;
  command: string;
  /** NAV and APR need a navigation source; their "did not engage" says where to look. */
  needsSource: boolean;
}

export const MODES: readonly ModeSpec[] = [
  {
    key: 'hdg',
    label: 'HDG',
    featureId: FEATURE_MODE_HDG,
    status: D.headingStatus,
    command: C.modeHeading,
    needsSource: false,
  },
  {
    key: 'nav',
    label: 'NAV',
    featureId: FEATURE_MODE_NAV,
    status: D.navStatus,
    command: C.modeNav,
    needsSource: true,
  },
  {
    key: 'apr',
    label: 'APR',
    featureId: FEATURE_MODE_APR,
    status: D.approachStatus,
    command: C.modeApproach,
    needsSource: true,
  },
  {
    key: 'alt',
    label: 'ALT',
    featureId: FEATURE_MODE_ALT,
    status: D.altitudeStatus,
    command: C.modeAltitude,
    needsSource: false,
  },
  {
    key: 'vs',
    label: 'VS',
    featureId: FEATURE_MODE_VS,
    status: D.verticalSpeedStatus,
    command: C.modeVerticalSpeed,
    needsSource: false,
  },
  {
    key: 'flc',
    label: 'FLC',
    featureId: FEATURE_MODE_FLC,
    status: D.speedStatus,
    command: C.modeLevelChange,
    needsSource: false,
  },
];

/** A number from the stream; none while no flight is loaded (the values would be meaningless). */
export function autopilotNumber(snapshot: SessionSnapshot, name: string): number | null {
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  return noFlight ? null : firstNumber(snapshot.telemetry[name]?.value);
}
