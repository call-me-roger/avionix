import type { FontFamilies } from '@/theme/tokens';

/**
 * The B612 family names, kept apart from the font assets: `typography.ts` needs only these strings,
 * and importing `fonts.ts` would pull in `@expo-google-fonts` (and through it `expo-font`) eagerly,
 * defeating `platform/fonts.ts`'s lazy require at start-up.
 */
export const AVIONICS_FAMILIES: Required<FontFamilies> = {
  avionics: 'B612_400Regular',
  avionicsBold: 'B612_700Bold',
  mono: 'B612Mono_400Regular',
  monoBold: 'B612Mono_700Bold',
};
