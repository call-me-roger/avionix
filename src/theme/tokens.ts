export type ThemeMode = 'light' | 'dark' | 'night';

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  /** A fill (buttons, chips); text on it is `onPrimary`. Never text or a thin indicator itself. */
  primary: string;
  onPrimary: string;
  /**
   * Text, glyphs and thin indicators in the app's accent hue (the selected tab, the current setup
   * step, the next pairing box): 4.5:1 on surface and background in every mode, where `primary`,
   * a fill colour, is not (night's is ~1.3:1).
   */
  accent: string;
  danger: string;
  success: string;
  caution: string;
  inputBackground: string;
  placeholder: string;
}

/**
 * R-01: the avionics hardware palette (bezels, glass, key caps, annunciator lights), in the meanings
 * of AC 25-11B and the Garmin guides: green engaged or active, white armed, cyan selected or being
 * tuned, amber caution, red warning. Light and dark share it, as a real panel is dark in daylight.
 */
export interface AvionicsColors {
  bezel: string;
  bezelEdge: string;
  glass: string;
  glassEdge: string;
  keyFace: string;
  keyFacePressed: string;
  legend: string;
  legendDim: string;
  engaged: string;
  armed: string;
  selected: string;
  caution: string;
  warning: string;
  lightOff: string;
}

export interface FontFamilies {
  avionics?: string;
  avionicsBold?: string;
  mono?: string;
  monoBold?: string;
}

/**
 * F-10 instruments. A real panel's instruments are dark in daylight too, so light and dark share
 * one set; night keeps every colour at relative luminance 0.30 or less, like the rest of its
 * palette. A stale instrument is drawn through `flag` (the red-X failure flag pilots know).
 */
export interface InstrumentColors {
  face: string;
  tape: string;
  sky: string;
  ground: string;
  horizon: string;
  marking: string;
  pointer: string;
  arcWhite: string;
  arcGreen: string;
  arcYellow: string;
  arcRed: string;
  flag: string;
  flagText: string;
  selected: string;
  bug: string;
  /** F-30 HSI/CDI: the lateral and glideslope needle, Garmin's VOR/LOC/GS green. */
  navNeedle: string;
  /** F-30 HSI/CDI: the needle when the HSI source is a GPS, Garmin's magenta. */
  gpsNeedle: string;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  instrument: InstrumentColors;
  avionics: AvionicsColors;
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { sm: number; md: number };
  typography: {
    headingSize: number;
    titleSize: number;
    bodySize: number;
    displaySize: number;
    legendSize: number;
    captionSize: number;
    fonts: FontFamilies;
  };
  /** F-04 R4: the same on phone and tablet; a tablet shows more controls, never smaller ones. */
  touch: { minTarget: number; spacing: number };
}

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
const radius = { sm: 4, md: 8 } as const;
// Shared, not frozen: `fonts` is replaced once the B612 families load (withAvionicsFonts).
const typography = {
  headingSize: 24,
  titleSize: 16,
  bodySize: 14,
  displaySize: 28,
  legendSize: 15,
  captionSize: 12,
  fonts: {} as FontFamilies,
};
const touch = { minTarget: 48, spacing: 8 } as const;

/**
 * Day avionics hardware palette, shared by `lightTheme` and `darkTheme`: a real glass-cockpit panel
 * is dark in daylight too, so there is one "day" look, not a light and a dark one.
 */
const dayAvionics: AvionicsColors = {
  bezel: '#1d2126',
  bezelEdge: '#3a4048',
  glass: '#05080b',
  glassEdge: '#2b3138',
  keyFace: '#2c3138',
  keyFacePressed: '#181b20',
  legend: '#e8eaed',
  legendDim: '#8b949e',
  engaged: '#36d35a',
  armed: '#e8eaed',
  selected: '#2fd0f0',
  caution: '#ffb300',
  warning: '#ff4a3d',
  lightOff: '#3a4048',
};

/** Night avionics: every colour kept at relative luminance 0.30 or less, like the rest of the palette. */
const nightAvionics: AvionicsColors = {
  bezel: '#0c0a08',
  bezelEdge: '#2a2117',
  glass: '#000000',
  glassEdge: '#2a2117',
  keyFace: '#14100b',
  keyFacePressed: '#060504',
  legend: '#a88a60',
  legendDim: '#917752',
  engaged: '#4f9a3a',
  armed: '#a88a60',
  selected: '#3f8f9a',
  caution: '#b07a1e',
  warning: '#d0584a',
  lightOff: '#241c13',
};

const dayInstrument: InstrumentColors = {
  face: '#000000',
  tape: '#2b2f36',
  sky: '#2f7fd1',
  ground: '#8a5a2b',
  horizon: '#ffffff',
  marking: '#ffffff',
  pointer: '#ffd200',
  arcWhite: '#ffffff',
  arcGreen: '#2fbf4a',
  arcYellow: '#f2c200',
  arcRed: '#e5322d',
  flag: '#e5322d',
  flagText: '#ffffff',
  selected: '#2fd0f0',
  bug: '#ff8a1f',
  navNeedle: '#36d35a',
  gpsNeedle: '#e040c0',
};

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
    // #1f6feb darkened within its hue: as given it is 4.32:1 on the #f6f7f9 background.
    accent: '#1d69df',
    danger: '#b00020',
    success: '#1a7f37',
    caution: '#8a5d00',
    inputBackground: '#ffffff',
    placeholder: '#6b7280',
  },
  instrument: dayInstrument,
  avionics: dayAvionics,
  spacing,
  radius,
  typography,
  touch,
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
    accent: '#58a6ff',
    danger: '#ff7b72',
    success: '#3fb950',
    caution: '#d29922',
    inputBackground: '#0d1117',
    placeholder: '#8b949e',
  },
  instrument: dayInstrument,
  avionics: dayAvionics,
  spacing,
  radius,
  typography,
  touch,
};

/**
 * For a darkened room (F-04 R6): a black background so an OLED screen is simply off, warm dim text,
 * and nothing whose relative luminance exceeds 0.30, so the panel never lights up the room or
 * spoils the pilot's view of a dim monitor. The AA contrast pairs still hold.
 */
export const nightTheme: Theme = {
  mode: 'night',
  colors: {
    background: '#000000',
    surface: '#0a0806',
    text: '#a88a60',
    textMuted: '#917752',
    border: '#3a2e20',
    primary: '#33200a',
    onPrimary: '#a88a60',
    accent: '#a88a60',
    danger: '#d0584a',
    success: '#6f9a4a',
    caution: '#a07a2a',
    inputBackground: '#000000',
    placeholder: '#917752',
  },
  instrument: {
    face: '#000000',
    tape: '#14100b',
    sky: '#1d3a5c',
    ground: '#3e2a17',
    horizon: '#a88a60',
    marking: '#a88a60',
    pointer: '#a8862a',
    arcWhite: '#8a7a64',
    arcGreen: '#4f7a35',
    arcYellow: '#a08a2a',
    arcRed: '#b0473b',
    flag: '#d0584a',
    flagText: '#000000',
    selected: '#3f8f9a',
    bug: '#a0601e',
    navNeedle: '#4f9a3a',
    gpsNeedle: '#9a3a86',
  },
  avionics: nightAvionics,
  spacing,
  radius,
  typography,
  touch,
};

const THEMES: Record<ThemeMode, Theme> = { light: lightTheme, dark: darkTheme, night: nightTheme };

export function themeForMode(mode: ThemeMode): Theme {
  return THEMES[mode];
}

/** React Native's keyboard has two appearances; night wants the dark one. */
export function keyboardAppearanceFor(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'light' ? 'light' : 'dark';
}
