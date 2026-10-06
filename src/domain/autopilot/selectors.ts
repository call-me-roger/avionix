import type { DataRefValue } from '@/domain/simulator/types';

/** The airspeed selector is `knots` or `mach` depending on X-Plane's flag. */
export type SelectorKind = 'heading' | 'altitude' | 'verticalSpeed' | 'knots' | 'mach';

type Limited = Exclude<SelectorKind, 'heading'>;

/** Inclusive limits; the heading wraps instead. */
export const SELECTOR_LIMITS: Readonly<Record<Limited, { min: number; max: number }>> = {
  altitude: { min: 0, max: 50_000 },
  verticalSpeed: { min: -9_900, max: 9_900 },
  knots: { min: 40, max: 500 },
  mach: { min: 0.1, max: 0.99 },
};

/** The small and the large step of each selector's steppers. */
export const SELECTOR_STEPS: Readonly<Record<SelectorKind, readonly [number, number]>> = {
  heading: [1, 10],
  altitude: [100, 1000],
  verticalSpeed: [100, 500],
  knots: [1, 10],
  mach: [0.01, 0.05],
};

/** Altitude preselectors and vertical speed wheels move in hundreds of feet. */
const GRID_FT = 100;
const MINUS = '−';

function grouped(value: number): string {
  return String(Math.abs(Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 0–359, whole degrees. */
export function normaliseHeading(degrees: number): number {
  const whole = Math.round(degrees) % 360;
  return whole < 0 ? whole + 360 : whole;
}

/** ".78": Mach as pilots read it, to the hundredth, no leading zero. */
export function formatMach(value: number): string {
  const hundredths = Math.round(value * 100);
  return hundredths >= 100
    ? (hundredths / 100).toFixed(2)
    : `.${String(hundredths).padStart(2, '0')}`;
}

export function formatSelector(kind: SelectorKind, value: number): string {
  switch (kind) {
    case 'heading': {
      const heading = normaliseHeading(value);
      return `${String(heading === 0 ? 360 : heading).padStart(3, '0')}°`;
    }
    case 'altitude':
      return `${Math.round(value) < 0 ? MINUS : ''}${grouped(value)} ft`;
    case 'verticalSpeed': {
      const rounded = Math.round(value);
      if (rounded === 0) {
        return '0 fpm';
      }
      return `${rounded > 0 ? '+' : MINUS}${grouped(rounded)} fpm`;
    }
    case 'knots':
      return `${Math.round(value)} kt`;
    case 'mach':
      return `M ${formatMach(value)}`;
  }
}

/**
 * A step back toward the range lands on the limit; a step further outside, or past a limit from
 * inside, is refused (null) so the stepper is disabled.
 */
function limited(kind: Limited, value: number, delta: number): number | null {
  const { min, max } = SELECTOR_LIMITS[kind];
  const epsilon = 1e-9;
  if (value > max + epsilon) {
    return delta < 0 ? max : null;
  }
  if (value < min - epsilon) {
    return delta > 0 ? min : null;
  }
  return value;
}

/** The value one stepper press sends from `base`, or null when it may not step that way. */
export function stepSelector(kind: SelectorKind, base: number, delta: number): number | null {
  switch (kind) {
    case 'heading':
      return normaliseHeading(Math.round(base) + delta);
    case 'altitude':
    case 'verticalSpeed': {
      const onGrid =
        delta > 0 ? Math.floor(base / GRID_FT) * GRID_FT : Math.ceil(base / GRID_FT) * GRID_FT;
      return limited(kind, onGrid + delta, delta);
    }
    case 'knots':
      return limited(kind, Math.round(base) + delta, delta);
    case 'mach':
      return limited(kind, (Math.round(base * 100) + Math.round(delta * 100)) / 100, delta);
  }
}

export function stepLabel(kind: SelectorKind, delta: number): string {
  const sign = delta < 0 ? MINUS : '+';
  const amount = Math.abs(delta);
  return kind === 'mach' ? `${sign}${formatMach(amount)}` : `${sign}${amount}`;
}

const UNIT_WORDS: Readonly<Record<SelectorKind, readonly [string, string]>> = {
  heading: ['degree', 'degrees'],
  altitude: ['foot', 'feet'],
  verticalSpeed: ['foot per minute', 'feet per minute'],
  knots: ['knot', 'knots'],
  mach: ['Mach', 'Mach'],
};

/** "Altitude plus 100 feet": a stepper's accessibility label. */
export function stepSpoken(label: string, kind: SelectorKind, delta: number): string {
  const direction = delta < 0 ? 'minus' : 'plus';
  const amount = Math.abs(delta);
  const [one, many] = UNIT_WORDS[kind];
  const amountText = kind === 'mach' ? formatMach(amount) : String(amount);
  return `${label} ${direction} ${amountText} ${amount === 1 ? one : many}`;
}

function numberOf(value: DataRefValue | undefined): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

/** Whether X-Plane's value reads as `expected` for this selector (the read-back predicate). */
export function selectorMatches(
  kind: SelectorKind,
  expected: number,
): (value: DataRefValue | undefined) => boolean {
  return (value) => {
    const current = numberOf(value);
    if (current === null) {
      return false;
    }
    if (kind === 'heading') {
      const difference = Math.abs(((current - expected) % 360) + 360) % 360;
      return Math.min(difference, 360 - difference) < 0.5;
    }
    return Math.abs(current - expected) < (kind === 'mach' ? 0.005 : 0.5);
  };
}

const PHRASE: Readonly<Record<SelectorKind, string>> = {
  heading: 'heading',
  altitude: 'altitude',
  verticalSpeed: 'vertical speed',
  knots: 'airspeed',
  mach: 'Mach',
};

/** R4's sentence when X-Plane did not adopt a selector value. */
export function selectorNotTaken(
  kind: SelectorKind,
  value: number,
  current: number | null,
): string {
  const sent = kind === 'mach' ? formatMach(value) : formatSelector(kind, value);
  const still =
    current === null ? '' : ` The selector still shows ${formatSelector(kind, current)}.`;
  return `X-Plane did not take ${PHRASE[kind]} ${sent}.${still}`;
}
