export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
  inputBackground: string;
  placeholder: string;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { sm: number; md: number };
  typography: { headingSize: number; titleSize: number; bodySize: number };
}

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
const radius = { sm: 4, md: 8 } as const;
const typography = { headingSize: 24, titleSize: 16, bodySize: 14 } as const;

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#f6f7f9',
    surface: '#ffffff',
    text: '#111417',
    textMuted: '#5f6670',
    border: '#c9ced6',
    primary: '#1f6feb',
    onPrimary: '#ffffff',
    danger: '#b00020',
    success: '#1a7f37',
    inputBackground: '#ffffff',
    placeholder: '#6b7280',
  },
  spacing,
  radius,
  typography,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#0e1117',
    surface: '#161b22',
    text: '#e6edf3',
    textMuted: '#9aa4b2',
    border: '#30363d',
    primary: '#1f6feb',
    onPrimary: '#ffffff',
    danger: '#ff7b72',
    success: '#3fb950',
    inputBackground: '#0d1117',
    placeholder: '#8b949e',
  },
  spacing,
  radius,
  typography,
};

const THEMES: Record<ThemeMode, Theme> = { light: lightTheme, dark: darkTheme };

export function themeForMode(mode: ThemeMode): Theme {
  return THEMES[mode];
}
