/** Spec §4.4 and ruling 3: track while moving, heading while standing, with hysteresis. */
export const TRACK_FROM_KT = 5;
export const HEADING_BELOW_KT = 3;

export interface DirectionInput {
  trueTrack: number | null;
  trueHeading: number | null;
  groundSpeedKt: number | null;
}

export interface Direction {
  source: 'track' | 'heading' | 'none';
  degrees: number | null;
}

export function chooseDirection(input: DirectionInput, wasTrack: boolean): Direction {
  const { trueTrack, trueHeading, groundSpeedKt: speed } = input;
  const wantsTrack =
    speed !== null && (speed >= TRACK_FROM_KT || (wasTrack && speed >= HEADING_BELOW_KT));
  if (wantsTrack && trueTrack !== null) {
    return { source: 'track', degrees: trueTrack };
  }
  if (trueHeading !== null) {
    return { source: 'heading', degrees: trueHeading };
  }
  if (trueTrack !== null) {
    return { source: 'track', degrees: trueTrack };
  }
  return { source: 'none', degrees: null };
}
