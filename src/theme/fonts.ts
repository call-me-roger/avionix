import { B612_400Regular, B612_700Bold } from '@expo-google-fonts/b612';
import { B612Mono_400Regular, B612Mono_700Bold } from '@expo-google-fonts/b612-mono';

import type { FontFamilies } from '@/theme/tokens';

/**
 * B612 and B612 Mono: the open (OFL) fonts from Airbus's cockpit-display legibility research,
 * used for every avionics legend and live number (R-01). The keys are the family names.
 */
export const AVIONICS_FONT_ASSETS = {
  B612_400Regular,
  B612_700Bold,
  B612Mono_400Regular,
  B612Mono_700Bold,
};

export const AVIONICS_FAMILIES: Required<FontFamilies> = {
  avionics: 'B612_400Regular',
  avionicsBold: 'B612_700Bold',
  mono: 'B612Mono_400Regular',
  monoBold: 'B612Mono_700Bold',
};
