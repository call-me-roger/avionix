import { formatMach } from '@/domain/autopilot/selectors';
import {
  ARMABLE,
  LATERAL,
  type ModeStatuses,
  VERTICAL,
  autothrottleArmed,
  autothrottleWord,
  modeState,
} from '@/domain/autopilot/modes';

/** A new active mode is boxed this long, as Boeing's FMA does (R-01). */
export const FMA_BOX_MS = 10_000;
/** An autopilot disconnect is annunciated this long, as Garmin's normal disconnect is. */
export const AP_DISCONNECT_MS = 5_000;

const MINUS = '−';
const LATERAL_ARMABLE = new Set(['nav', 'apr']);

export interface FmaInput {
  statuses: ModeStatuses;
  autothrottle: number | null;
  ap: boolean;
  fd: boolean;
  vsFpm: number | null;
  speed: number | null;
  speedIsMach: boolean;
}

export interface FmaColumns {
  autothrottle: { active: string | null; armed: boolean };
  lateral: { active: string | null; armed: readonly string[] };
  vertical: { active: string | null; reference: string | null; armed: readonly string[] };
  ap: boolean;
  fd: boolean;
}

function engaged(axis: typeof LATERAL, statuses: ModeStatuses): string | null {
  return axis.find(([key]) => modeState(statuses[key]) === 'engaged')?.[1] ?? null;
}

function verticalReference(active: string | null, input: FmaInput): string | null {
  if (active === 'VS' && input.vsFpm !== null) {
    const hundreds = Math.round(input.vsFpm / 100) * 100;
    return `${hundreds < 0 ? MINUS : ''}${Math.abs(hundreds)}FPM`;
  }
  if (active === 'FLC' && input.speed !== null) {
    return input.speedIsMach ? `M${formatMach(input.speed)}` : `${Math.round(input.speed)}KT`;
  }
  return null;
}

/** The G1000-style status bar: autothrottle, lateral, AP/FD and vertical, engaged over armed. */
export function fmaColumns(input: FmaInput): FmaColumns {
  const { statuses } = input;
  const armed = ARMABLE.filter(([key]) => modeState(statuses[key]) === 'armed');
  const lateralActive = engaged(LATERAL, statuses);
  const verticalActive = engaged(VERTICAL, statuses);
  return {
    autothrottle: {
      active: autothrottleWord(input.autothrottle),
      armed: autothrottleArmed(input.autothrottle) && autothrottleWord(input.autothrottle) === null,
    },
    lateral: {
      active: lateralActive,
      armed: armed.filter(([key]) => LATERAL_ARMABLE.has(key)).map(([, label]) => label),
    },
    vertical: {
      active: verticalActive,
      reference: verticalReference(verticalActive, input),
      armed: armed.filter(([key]) => !LATERAL_ARMABLE.has(key)).map(([, label]) => label),
    },
    ap: input.ap,
    fd: input.fd,
  };
}

export type FmaSlot = 'autothrottle' | 'lateral' | 'vertical' | 'ap';
const SLOTS: readonly FmaSlot[] = ['autothrottle', 'lateral', 'vertical', 'ap'];

export interface BoxState {
  /** The active mode per slot last seen; null before the first sample, so nothing starts boxed. */
  seen: Readonly<Record<FmaSlot, string | null>> | null;
  changedAt: Readonly<Partial<Record<FmaSlot, number>>>;
}

export const EMPTY_BOX_STATE: BoxState = { seen: null, changedAt: {} };

/** The mode word only: a new VS target is not a new mode, so it never re-boxes. */
function slotValues(columns: FmaColumns): Record<FmaSlot, string | null> {
  return {
    autothrottle: columns.autothrottle.active,
    lateral: columns.lateral.active,
    vertical: columns.vertical.active,
    ap: columns.ap ? 'AP' : null,
  };
}

export function nextBoxState(prev: BoxState, columns: FmaColumns, now: number): BoxState {
  const values = slotValues(columns);
  if (prev.seen === null) {
    return { seen: values, changedAt: {} };
  }
  let changedAt: Partial<Record<FmaSlot, number>> | null = null;
  for (const slot of SLOTS) {
    if (values[slot] === prev.seen[slot]) {
      continue;
    }
    changedAt ??= { ...prev.changedAt };
    if (values[slot] === null) {
      delete changedAt[slot];
    } else {
      changedAt[slot] = now;
    }
  }
  return changedAt === null ? prev : { seen: values, changedAt };
}

export function isBoxed(state: BoxState, slot: FmaSlot, now: number): boolean {
  const at = state.changedAt[slot];
  return at !== undefined && now - at < FMA_BOX_MS;
}

export interface DisconnectState {
  /** AP as last seen with current values; null after a link loss, so a gap never counts. */
  lastAp: boolean | null;
  since: number | null;
}

export const EMPTY_DISCONNECT: DisconnectState = { lastAp: null, since: null };

export function nextDisconnect(
  prev: DisconnectState,
  ap: boolean | null,
  valuesCurrent: boolean,
  now: number,
): DisconnectState {
  if (!valuesCurrent || ap === null) {
    return prev.lastAp === null && prev.since === null ? prev : EMPTY_DISCONNECT;
  }
  if (prev.lastAp === true && !ap) {
    return { lastAp: false, since: now };
  }
  if (prev.lastAp === ap) {
    return prev;
  }
  return { lastAp: ap, since: ap ? null : prev.since };
}

export function disconnectShowing(state: DisconnectState, now: number): boolean {
  return state.since !== null && now - state.since < AP_DISCONNECT_MS;
}
