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

  it('gives the keyboard a dark appearance at night', () => {
    expect(keyboardAppearanceFor('light')).toBe('light');
    expect(keyboardAppearanceFor('dark')).toBe('dark');
    expect(keyboardAppearanceFor('night')).toBe('dark');
  });
});
