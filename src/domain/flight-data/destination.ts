import type { BindingStatus } from '@/domain/aircraft/availability';
import { decodeDataRefString } from '@/domain/simulator/dataref-string';
import type { DataRefValue } from '@/domain/simulator/types';

export type DestinationView =
  | { kind: 'unavailable' }
  | { kind: 'waiting' }
  | { kind: 'notSet' }
  | { kind: 'shown'; id: string; distanceNm: number; timeMin: number | null };

export interface DestinationInput {
  idStatus: BindingStatus | undefined;
  distanceStatus: BindingStatus | undefined;
  idValue: DataRefValue | undefined;
  distanceValue: DataRefValue | undefined;
  timeValue: DataRefValue | undefined;
}

/**
 * F-11 R8: a destination is shown only when the aircraft populates the default GPS and one is set;
 * otherwise the reason is given in words, and a blank or zero distance is never shown. The
 * identifier is a `data` DataRef, so it arrives base64-encoded and NUL-padded.
 */
export function destinationView(input: DestinationInput): DestinationView {
  if (input.idStatus === 'missing' || input.distanceStatus === 'missing') {
    return { kind: 'unavailable' };
  }
  if (input.idValue === undefined || typeof input.distanceValue !== 'number') {
    return { kind: 'waiting' };
  }
  const id = decodeDataRefString(input.idValue, 'data');
  if (id === null) {
    return { kind: 'notSet' };
  }
  return {
    kind: 'shown',
    id,
    distanceNm: input.distanceValue,
    timeMin: typeof input.timeValue === 'number' ? input.timeValue : null,
  };
}
