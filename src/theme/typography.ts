import type { TextStyle } from 'react-native';

import { AVIONICS_FAMILIES } from '@/theme/fonts';
import type { Theme } from '@/theme/tokens';

/** Every live number: tabular digits so a changing value never jitters, in B612 Mono once loaded. */
export function numeric(theme: Theme, bold = false): TextStyle {
  const { fonts } = theme.typography;
  return { fontFamily: bold ? fonts.monoBold : fonts.mono, fontVariant: ['tabular-nums'] };
}

/** Avionics legends and annunciations: B612 once loaded, the system font until then. */
export function avionicsText(theme: Theme, bold = false): TextStyle {
  const { fonts } = theme.typography;
  return { fontFamily: bold ? fonts.avionicsBold : fonts.avionics };
}

/** The same theme with the B612 families named; only once they have loaded (never a warning). */
export function withAvionicsFonts(theme: Theme): Theme {
  return { ...theme, typography: { ...theme.typography, fonts: AVIONICS_FAMILIES } };
}
