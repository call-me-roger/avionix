/** F-13's sentences (spec §4.6, §4.7). Plain words only: no names, ids or codes (R10). */
export function mapUnavailable(aircraft: string | null): string {
  return `The moving map isn't available on ${aircraft === null ? 'this aircraft' : `the ${aircraft}`}: X-Plane doesn't report its position.`;
}

export const WAITING_FOR_POSITION = 'Waiting for position.';
export const TRACK_NOT_AVAILABLE = 'Track not available.';
export const LAST_KNOWN = 'LAST KNOWN';
export const MAP_CREDIT = 'Outlines: Natural Earth. Runways: OurAirports. Not for navigation.';
