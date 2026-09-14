import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import type { SettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
  loadThemePreference,
  resolveThemeMode,
  saveThemePreference,
} from '@/theme/theme-preference';
import { type Theme, type ThemeMode, themeForMode } from '@/theme/tokens';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  storage: SettingsStorage;
  /** Overrides the OS colour scheme (tests, forced schemes). `undefined` means "use the OS". */
  systemSchemeOverride?: ThemeMode | null;
  children: React.ReactNode;
}

export function ThemeProvider({ storage, systemSchemeOverride, children }: ThemeProviderProps) {
  const osScheme = useColorScheme();
  const normalizedOsScheme = osScheme === 'light' || osScheme === 'dark' ? osScheme : null;
  const systemScheme =
    systemSchemeOverride === undefined ? normalizedOsScheme : systemSchemeOverride;
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [ready, setReady] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadThemePreference(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      if (!touched.current) {
        setPreferenceState(stored);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      touched.current = true;
      setPreferenceState(next);
      void saveThemePreference(storage, next);
    },
    [storage],
  );

  const theme = useMemo(
    () => themeForMode(resolveThemeMode(preference, systemScheme)),
    [preference, systemScheme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, preference, setPreference, ready }),
    [theme, preference, setPreference, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

export function useThemePreference(): Pick<
  ThemeContextValue,
  'preference' | 'setPreference' | 'ready'
> {
  const { preference, setPreference, ready } = useThemeContext();
  return { preference, setPreference, ready };
}

/**
 * Builds a StyleSheet from the current theme. Pass a module-level factory so the
 * memo key is stable and styles are rebuilt only when the theme changes.
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T,
): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [factory, theme]);
}
