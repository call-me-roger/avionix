/**
 * Every sentence the Systems panel shows (R10): plain words, the aircraft named when known, never a
 * name, id or code. `aircraft` is X-Plane's description of the loaded aircraft, or null.
 */

function subject(aircraft: string | null): string {
  return aircraft === null ? 'This aircraft' : `The ${aircraft}`;
}

function object(aircraft: string | null): string {
  return aircraft === null ? 'this aircraft' : `the ${aircraft}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function switchNotTaken(
  aircraft: string | null,
  name: string,
  wantedOn: boolean,
  nowOn: boolean | null,
): string {
  const first = `${subject(aircraft)} didn't turn the ${name} ${wantedOn ? 'on' : 'off'}.`;
  return nowOn === null ? first : `${first} It's still ${nowOn ? 'on' : 'off'}.`;
}

export function gearNotTaken(aircraft: string | null, wantDown: boolean): string {
  const first = `${subject(aircraft)} didn't move the gear handle ${wantDown ? 'down' : 'up'}.`;
  return wantDown
    ? first
    : `${first} X-Plane keeps the gear down while the aircraft is on the ground.`;
}

export function flapsNotTaken(aircraft: string | null, direction: 'up' | 'down'): string {
  return `${subject(aircraft)} didn't move the flaps ${direction}.`;
}

export function selectorNotTaken(aircraft: string | null, what: string, position: string): string {
  return `${subject(aircraft)} didn't set the ${what} to ${position}.`;
}

export function dimmerNotTaken(aircraft: string | null, name: string): string {
  return `${subject(aircraft)} didn't change the ${name}.`;
}

export function parkingBrakeNotTaken(aircraft: string | null, set: boolean): string {
  return `${subject(aircraft)} didn't ${set ? 'set' : 'release'} the parking brake.`;
}

export function trimSetNotTaken(aircraft: string | null, sentence: string): string {
  return `${subject(aircraft)} didn't ${sentence}.`;
}

/** A hold of at least a second that X-Plane never acted on ("move the pitch trim", "engage starter 1"). */
export function holdNoResponse(aircraft: string | null, phrase: string): string {
  return `${subject(aircraft)} didn't ${phrase}.`;
}

export function holdCapped(name: string, seconds: number, again: string): string {
  return `${capitalise(name)} stopped after ${seconds} seconds. ${again}`;
}

export function holdLinkLost(name: string): string {
  return `${capitalise(name)} released: the connection to X-Plane dropped.`;
}

export function holdBackgrounded(name: string): string {
  return `${capitalise(name)} released: Avionix left the foreground.`;
}

/** One line per unit naming every control that is not drawn or is disabled (S3). */
export function missingControls(aircraft: string | null, legends: readonly string[]): string {
  return `Not available on ${object(aircraft)}: ${legends.join(', ')}.`;
}

export function unitUnavailable(unit: string, aircraft: string | null): string {
  return `${unit} isn't available on ${object(aircraft)}.`;
}

export const ENGINES_NOT_SHOWN = "Engines 5 and up aren't shown.";
