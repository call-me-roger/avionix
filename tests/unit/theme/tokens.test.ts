import { darkTheme, lightTheme, themeForMode } from '@/theme/tokens';

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

describe('theme tokens', () => {
  it('provides one theme per mode', () => {
    expect(lightTheme.mode).toBe('light');
    expect(darkTheme.mode).toBe('dark');
    expect(themeForMode('light')).toBe(lightTheme);
    expect(themeForMode('dark')).toBe(darkTheme);
  });

  it('defines the same colour keys in both modes with hex values', () => {
    const lightKeys = Object.keys(lightTheme.colors).sort();
    const darkKeys = Object.keys(darkTheme.colors).sort();
    expect(darkKeys).toEqual(lightKeys);
    for (const value of [...Object.values(lightTheme.colors), ...Object.values(darkTheme.colors)]) {
      expect(value).toMatch(HEX);
    }
  });

  it('uses distinct backgrounds so the toggle is visible', () => {
    expect(lightTheme.colors.background).not.toBe(darkTheme.colors.background);
    expect(lightTheme.colors.text).not.toBe(darkTheme.colors.text);
  });

  it('shares spacing, radius and typography scales across modes', () => {
    expect(darkTheme.spacing).toEqual(lightTheme.spacing);
    expect(darkTheme.radius).toEqual(lightTheme.radius);
    expect(darkTheme.typography).toEqual(lightTheme.typography);
  });

  it('meets WCAG AA contrast for text pairs in both modes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const { colors } = theme;
      const pairs: Array<[string, string]> = [
        [colors.text, colors.background],
        [colors.text, colors.surface],
        [colors.textMuted, colors.surface],
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
});
