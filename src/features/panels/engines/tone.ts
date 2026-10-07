import type { MarkingColour } from '@/domain/engines/catalogue';
import type { Tone } from '@/domain/engines/markings';
import type { Theme } from '@/theme/tokens';

/** A pointer's, needle's or number's colour (spec §4.5): white in the normal range, as the G1000. */
export function toneColour(theme: Theme, tone: Tone, stale: boolean): string {
  if (stale) {
    return theme.avionics.legendDim;
  }
  switch (tone) {
    case 'yellow':
      return theme.avionics.caution;
    case 'red':
    case 'redline':
      return theme.avionics.warning;
    case 'normal':
      return theme.avionics.legend;
  }
}

export function bandColour(theme: Theme, colour: MarkingColour, stale: boolean): string {
  if (stale) {
    return theme.avionics.legendDim;
  }
  switch (colour) {
    case 'green':
      return theme.avionics.engaged;
    case 'yellow':
      return theme.avionics.caution;
    case 'red':
      return theme.avionics.warning;
  }
}
