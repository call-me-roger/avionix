import {
  darkTheme,
  keyboardAppearanceFor,
  lightTheme,
  nightTheme,
  themeForMode,
} from '@/theme/tokens';

const HEX = /^#[0-9a-f]{6}$/i;

/** Relative luminance per WCAG 2.x. */
function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const linearize = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = linearize(parseInt(normalized.slice(0, 2), 16));
  const g = linearize(parseInt(normalized.slice(2, 4), 16));
  const b = linearize(parseInt(normalized.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, order-independent. */
function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

const ALL_THEMES = [lightTheme, darkTheme, nightTheme];

describe('theme tokens', () => {
  it('provides one theme per mode', () => {
    expect(lightTheme.mode).toBe('light');
    expect(darkTheme.mode).toBe('dark');
    expect(nightTheme.mode).toBe('night');
    expect(themeForMode('light')).toBe(lightTheme);
    expect(themeForMode('dark')).toBe(darkTheme);
    expect(themeForMode('night')).toBe(nightTheme);
  });

  it('defines the same colour keys in every mode with hex values', () => {
    const lightKeys = Object.keys(lightTheme.colors).sort();
    for (const theme of ALL_THEMES) {
      expect(Object.keys(theme.colors).sort()).toEqual(lightKeys);
      for (const value of Object.values(theme.colors)) {
        expect(value).toMatch(HEX);
      }
    }
  });

  it('uses distinct backgrounds so the toggle is visible', () => {
    const backgrounds = new Set(ALL_THEMES.map((theme) => theme.colors.background));
    expect(backgrounds.size).toBe(ALL_THEMES.length);
    expect(lightTheme.colors.text).not.toBe(darkTheme.colors.text);
  });

  it('shares spacing, radius, typography and touch scales across modes', () => {
    for (const theme of ALL_THEMES) {
      expect(theme.spacing).toEqual(lightTheme.spacing);
      expect(theme.radius).toEqual(lightTheme.radius);
      expect(theme.typography).toEqual(lightTheme.typography);
      expect(theme.touch).toEqual({ minTarget: 48, spacing: 8 });
    }
  });

  it('meets WCAG AA contrast for text pairs in every mode', () => {
    for (const theme of ALL_THEMES) {
      const { colors } = theme;
      const pairs: Array<[string, string]> = [
        [colors.text, colors.background],
        [colors.text, colors.surface],
        [colors.textMuted, colors.surface],
        // A disabled ControlButton is an outline: its muted label sits on the page background.
        [colors.textMuted, colors.background],
        [colors.onPrimary, colors.primary],
        ['#ffffff', colors.primary],
        [colors.placeholder, colors.inputBackground],
        [colors.danger, colors.surface],
        [colors.success, colors.surface],
        // Accent is text and thin indicators (selected tab, current step, next pairing box).
        [colors.accent, colors.surface],
        [colors.accent, colors.background],
      ];
      for (const [foreground, background] of pairs) {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the night palette dark: a black background and nothing that glows', () => {
    expect(nightTheme.colors.background).toBe('#000000');
    for (const [key, value] of Object.entries(nightTheme.colors)) {
      expect({ key, luminance: relativeLuminance(value) <= 0.3 }).toEqual({
        key,
        luminance: true,
      });
    }
  });

  it('keeps danger and success apart from each other and from text at night', () => {
    const { danger, success, text } = nightTheme.colors;
    expect(new Set([danger, success, text]).size).toBe(3);
  });

  it('keeps every instrument colour dark at night', () => {
    for (const [key, value] of Object.entries(nightTheme.instrument)) {
      expect({ key, luminance: relativeLuminance(value) <= 0.3 }).toEqual({
        key,
        luminance: true,
      });
    }
  });

  it('draws instruments on a dark face in every theme, as a real panel does', () => {
    for (const theme of [lightTheme, darkTheme, nightTheme]) {
      expect(contrastRatio(theme.instrument.marking, theme.instrument.face)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(theme.instrument.flagText, theme.instrument.flag),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the F-30 navigation needle tokens legible on the instrument face', () => {
    for (const theme of ALL_THEMES) {
      expect(
        contrastRatio(theme.instrument.navNeedle, theme.instrument.face),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.instrument.gpsNeedle, theme.instrument.face),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the failure flag apart from the yellow and green arcs', () => {
    for (const theme of [lightTheme, darkTheme, nightTheme]) {
      const { flag, arcYellow, arcGreen } = theme.instrument;
      expect(new Set([flag, arcYellow, arcGreen]).size).toBe(3);
    }
  });

  it('gives the keyboard a dark appearance at night', () => {
    expect(keyboardAppearanceFor('light')).toBe('light');
    expect(keyboardAppearanceFor('dark')).toBe('dark');
    expect(keyboardAppearanceFor('night')).toBe('dark');
  });

  it('defines the same avionics keys in every mode with hex values', () => {
    const keys = Object.keys(lightTheme.avionics).sort();
    for (const theme of ALL_THEMES) {
      expect(Object.keys(theme.avionics).sort()).toEqual(keys);
      for (const value of Object.values(theme.avionics)) {
        expect(value).toMatch(HEX);
      }
    }
  });

  it('keeps every avionics colour dark at night', () => {
    for (const [key, value] of Object.entries(nightTheme.avionics)) {
      expect({ key, luminance: relativeLuminance(value) <= 0.3 }).toEqual({ key, luminance: true });
    }
  });

  it('meets 4.5:1 for avionics text on glass and keys in every mode', () => {
    for (const theme of ALL_THEMES) {
      const a = theme.avionics;
      const pairs: Array<[string, string]> = [
        [a.legend, a.glass],
        [a.engaged, a.glass],
        [a.armed, a.glass],
        [a.selected, a.glass],
        [a.caution, a.glass],
        [a.warning, a.glass],
        [a.legend, a.keyFace],
        [theme.instrument.selected, theme.instrument.tape],
        [theme.colors.caution, theme.colors.surface],
        [theme.colors.caution, theme.colors.background],
      ];
      for (const [foreground, background] of pairs) {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(a.legendDim, a.keyFace)).toBeGreaterThanOrEqual(3);
      // Notices printed inside a unit (BodyText on a bezel) must stay readable.
      for (const foreground of [a.legend, a.legendDim, a.warning, a.engaged]) {
        expect(contrastRatio(foreground, a.bezel)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps engaged, selected, caution and warning distinct in every mode', () => {
    for (const theme of ALL_THEMES) {
      const { engaged, selected, caution, warning } = theme.avionics;
      expect(new Set([engaged, selected, caution, warning]).size).toBe(4);
    }
  });

  it('shares one avionics palette between light and dark, as a real panel is dark in daylight', () => {
    expect(darkTheme.avionics).toBe(lightTheme.avionics);
  });

  it('defines the same cdu keys in every mode with hex values', () => {
    const keys = Object.keys(lightTheme.cdu).sort();
    for (const theme of ALL_THEMES) {
      expect(Object.keys(theme.cdu).sort()).toEqual(keys);
      for (const value of Object.values(theme.cdu)) {
        expect(value).toMatch(HEX);
      }
    }
  });

  it('meets 4.5:1 for every F-32 CDU colour on its glass in every mode', () => {
    const CDU_COLOURS = ['white', 'cyan', 'red', 'yellow', 'green', 'magenta', 'amber'] as const;
    for (const theme of ALL_THEMES) {
      for (const key of CDU_COLOURS) {
        expect(contrastRatio(theme.cdu[key], theme.cdu.glass) >= 4.5).toBe(true);
      }
    }
  });

  it('keeps every night CDU colour dark', () => {
    for (const [key, value] of Object.entries(nightTheme.cdu)) {
      expect({ key, luminance: relativeLuminance(value) <= 0.3 }).toEqual({ key, luminance: true });
    }
  });

  it('shares one CDU palette between light and dark, as a real panel is dark in daylight', () => {
    expect(darkTheme.cdu).toBe(lightTheme.cdu);
  });

  it('defines the same map keys in every mode with hex values', () => {
    const keys = Object.keys(lightTheme.map).sort();
    for (const theme of [lightTheme, darkTheme, nightTheme]) {
      expect(Object.keys(theme.map).sort()).toEqual(keys);
      for (const value of Object.values(theme.map)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('keeps every map colour dark at night and the symbol legible on land and water', () => {
    for (const value of Object.values(nightTheme.map)) {
      expect(relativeLuminance(value)).toBeLessThanOrEqual(0.3);
    }
    for (const theme of [lightTheme, nightTheme]) {
      expect(contrastRatio(theme.map.ownship, theme.map.land)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.map.ownship, theme.map.water)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.map.label, theme.map.land)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
