import type { ComNumber } from '@/domain/audio/catalogue';
import { unitUnavailable } from '@/domain/systems/messages';

/**
 * Every sentence the audio unit shows (R9): plain words, the aircraft named when known, never a
 * name, id or code. `aircraft` is X-Plane's description of the loaded aircraft, or null.
 */

function subject(aircraft: string | null): string {
  return aircraft === null ? 'This aircraft' : `The ${aircraft}`;
}

/** R6: every audio name is definitively missing. */
export function audioUnavailable(aircraft: string | null): string {
  return unitUnavailable('The audio panel', aircraft);
}

export function notHeard(com: ComNumber): string {
  return `You transmit on COM${com} but aren't listening to it.`;
}

export function micNotTaken(aircraft: string | null, com: ComNumber): string {
  return `${subject(aircraft)} didn't switch the microphone to COM${com}.`;
}

export function listenNotTaken(aircraft: string | null, name: string, wantedOn: boolean): string {
  return `${subject(aircraft)} didn't ${wantedOn ? 'start' : 'stop'} listening to ${name}.`;
}
