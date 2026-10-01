/**
 * COM channels and NAV frequencies as X-Plane stores them. The COM `_833` DataRefs hold a channel
 * number, which for 8.33 kHz channels is not the physical frequency (Laminar, "8.33 kHz radios");
 * Avionix reads it as whole kHz — 121.500 is 121500, channel 118.005 is 118005 — an assumption the
 * device check confirms, kept in this one constant. NAV DataRefs hold 10 kHz units: 110.30 is 11030.
 */
export const COM_UNITS_PER_MHZ = 1000;
export const NAV_UNITS_PER_MHZ = 100;

export const COM_MIN = 118_000;
export const COM_MAX = 136_990;
export const NAV_MIN = 10_800;
export const NAV_MAX = 11_795;
/** 0.05 MHz in NAV units. */
export const NAV_STEP = 5;

export const COM_BAND_MESSAGE = 'COM channels run from 118.000 to 136.990.';
export const NAV_BAND_MESSAGE = 'NAV frequencies run from 108.00 to 117.95 in 0.05 steps.';

/** Valid endings within every 100 kHz: 00/25/50/75 are 25 kHz channels, the rest 8.33 channels. */
const COM_ENDINGS: ReadonlySet<number> = new Set([
  0, 5, 10, 15, 25, 30, 35, 40, 50, 55, 60, 65, 75, 80, 85, 90,
]);
const TWENTY_FIVE_KHZ_ENDINGS: ReadonlySet<number> = new Set([0, 25, 50, 75]);

export function isComChannel(value: number): boolean {
  return (
    Number.isInteger(value) && value >= COM_MIN && value <= COM_MAX && COM_ENDINGS.has(value % 100)
  );
}

/** A channel a 25 kHz-only radio cannot tune; the read-back hint names that possibility. */
export function isEightThirtyThreeOnly(value: number): boolean {
  return isComChannel(value) && !TWENTY_FIVE_KHZ_ENDINGS.has(value % 100);
}

export function isNavFrequency(value: number): boolean {
  return Number.isInteger(value) && value >= NAV_MIN && value <= NAV_MAX && value % NAV_STEP === 0;
}

function formatUnits(value: number, perMhz: number, decimals: number): string {
  const whole = Math.round(value);
  const mhz = Math.floor(whole / perMhz);
  return `${mhz}.${String(whole - mhz * perMhz).padStart(decimals, '0')}`;
}

export function formatCom(value: number): string {
  return formatUnits(value, COM_UNITS_PER_MHZ, 3);
}

export function formatNav(value: number): string {
  return formatUnits(value, NAV_UNITS_PER_MHZ, 2);
}

/** The valid channel below and the one above `value`, each only if it is inside the band. */
export function nearestComChannels(value: number): number[] {
  const nearest: number[] = [];
  for (let below = Math.ceil(value) - 1; below >= COM_MIN; below -= 1) {
    if (isComChannel(below)) {
      nearest.push(below);
      break;
    }
  }
  for (let above = Math.floor(value) + 1; above <= COM_MAX; above += 1) {
    if (isComChannel(above)) {
      nearest.push(above);
      break;
    }
  }
  return nearest;
}

/** Why `value` cannot be sent, or null. Never a snapped value: the pilot picks the channel. */
export function comRejection(value: number): string | null {
  if (isComChannel(value)) {
    return null;
  }
  if (!Number.isFinite(value) || value < COM_MIN || value > COM_MAX) {
    return COM_BAND_MESSAGE;
  }
  const nearest = nearestComChannels(value).map(formatCom).join(' or ');
  return `${formatCom(value)} is not a COM channel. Nearest: ${nearest}.`;
}

export function navRejection(value: number): string | null {
  return isNavFrequency(value) ? null : NAV_BAND_MESSAGE;
}
