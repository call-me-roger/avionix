/**
 * Every sentence the Engines panel shows (R7): plain words, the aircraft named when known, never a
 * name, id or code. `aircraft` is X-Plane's description of the loaded aircraft, or null.
 */
export { ENGINES_NOT_SHOWN, missingControls as gaugesMissing } from '@/domain/systems/messages';

function subject(aircraft: string | null): string {
  return aircraft === null ? 'This aircraft' : `The ${aircraft}`;
}

function object(aircraft: string | null): string {
  return aircraft === null ? 'this aircraft' : `the ${aircraft}`;
}

function listed(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function enginesUnidentified(aircraft: string | null): string {
  return `The engines on ${object(aircraft)} couldn't be identified.`;
}

export function noEngines(aircraft: string | null): string {
  return `${subject(aircraft)} has no engines.`;
}

export function engineUnsupported(engine: number): string {
  return `Engine ${engine}'s type isn't supported.`;
}

/** `names` are the gauges' spoken names: "EGT", "ITT", "oil temperature". */
export function unitsUnknown(aircraft: string | null, names: readonly string[]): string {
  const plural = names.length > 1;
  return `${subject(aircraft)} doesn't say which unit${plural ? 's' : ''} its ${listed(names)} ${
    plural ? 'use' : 'uses'
  }; shown as reported.`;
}

export function tanksUnavailable(aircraft: string | null): string {
  return `Fuel tanks aren't available on ${object(aircraft)}.`;
}
