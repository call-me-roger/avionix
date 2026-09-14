import { darkTheme, lightTheme, themeForMode } from '@/theme/tokens';

const HEX = /^#[0-9a-f]{6}$/i;

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
});
