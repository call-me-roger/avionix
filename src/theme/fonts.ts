import { B612_400Regular, B612_700Bold } from '@expo-google-fonts/b612';
import { B612Mono_400Regular, B612Mono_700Bold } from '@expo-google-fonts/b612-mono';

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

/** Re-exported for existing importers; `typography.ts` takes it from `font-families.ts`. */
export { AVIONICS_FAMILIES } from '@/theme/font-families';
