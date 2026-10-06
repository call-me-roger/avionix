/**
 * Loads the avionics fonts. Never throws and never logs: a build or a platform without the font
 * loader keeps the system font (R-01 U5).
 */
export async function loadAvionicsFonts(): Promise<boolean> {
  try {
    // Both required lazily, inside the try: an old development build without the native loader, or
    // without `expo-font` resolvable at all, must not fail at import. `@expo-google-fonts/*` re-exports
    // a hook that imports `expo-font` eagerly, so even the font-assets module must be required here,
    // not at the top of this file, or that same failure would happen outside this catch.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Font = require('expo-font') as typeof import('expo-font');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AVIONICS_FONT_ASSETS } = require('@/theme/fonts') as typeof import('@/theme/fonts');
    await Font.loadAsync(AVIONICS_FONT_ASSETS);
    return true;
  } catch {
    return false;
  }
}
