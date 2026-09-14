# Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed light/dark theme system with a system/light/dark toggle, persisted preference, and migrate the existing MVP screen to theme tokens.

**Architecture:** A `Theme` token object per mode lives in `src/theme`. `ThemeProvider` resolves the effective mode from the persisted preference and the OS colour scheme, exposes `useTheme()` / `useThemePreference()`, and `useThemedStyles(factory)` memoizes `StyleSheet`s per theme. Small themed primitives (`Section`, `SectionTitle`, `BodyText`, `ThemedTextInput`) keep components free of raw colours. The preference is stored through the existing `SettingsStorage` port under its own key.

**Tech Stack:** React Native core (`useColorScheme`, `StyleSheet`, `Pressable`), React context, zod 4 for the persisted payload, Jest node + expo projects, @testing-library/react-native 14 (async `render`/`renderHook`/`fireEvent`/`act`; built-in `toHaveStyle` matcher).

**Spec:** Design approved in chat on 2026-09-14 (no written spec): scope is light / dark / system only; approach is context + tokens with no styling library; tokens shaped so palettes can be added later; toggle lives under the Avionix heading on the MVP screen; preference persisted as a documented addition to the "host and port only" rule; palettes, colour editor, animations and per-component overrides are out of scope.

## Global Constraints

- No new dependencies. Core `react-native` components only (plus `expo-status-bar`, already installed).
- No `any`, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable` without a stated reason, no `as T` casts to bypass validation. Prettier: singleQuote, trailingComma all, printWidth 100. Lint and test output warning-free.
- Alias `@/` → `src/`. Jest `node` project runs `tests/unit/**`, `tests/contract/**`, `tests/integration/**`; Jest `expo` project runs `tests/ui/**/*.test.tsx`. `src/theme` must not import from `src/infrastructure`; it depends only on `SettingsStorage` from `@/application/settings-store` and React Native.
- Every colour a component renders comes from `Theme.colors`; no hard-coded colour literals remain under `src/features` or `src/app`.
- The UI still never builds URLs or protocol messages; this plan touches no networking code.
- `app.json` keeps `"userInterfaceStyle": "automatic"` so the OS scheme reaches the app.
- Persisted theme payload: storage key `avionix.theme`, JSON `{ "preference": "system" | "light" | "dark" }`, default `system`, invalid data falls back to `system`, failed saves never throw.
- Quality gate before each commit: `npm run typecheck && npm run lint && npm run format:check && npm test`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Map

| Path | Responsibility |
|---|---|
| `src/theme/tokens.ts` | `ThemeMode`, `ThemeColors`, `Theme`, `lightTheme`, `darkTheme`, `themeForMode` |
| `src/theme/theme-preference.ts` | `ThemePreference`, `resolveThemeMode`, load/save through `SettingsStorage` |
| `src/theme/theme-context.tsx` | `ThemeProvider`, `useTheme`, `useThemePreference`, `useThemedStyles` |
| `src/theme/primitives.tsx` | `Section`, `SectionTitle`, `BodyText`, `ThemedTextInput` |
| `src/theme/ThemeToggle.tsx` | three-way preference toggle |
| `src/features/**`, `src/app/AvionixApp.tsx` | migrated to tokens; toggle mounted; status bar follows the theme |
| `tests/unit/theme/*.test.ts`, `tests/ui/theme.test.tsx`, `tests/ui/mvp-screen.test.tsx` | tests |
| `docs/architecture.md`, `README.md` | theming documentation |

---

### Task 1: Tokens and preference (pure modules, node tests)

**Files:**
- Create: `src/theme/tokens.ts`, `src/theme/theme-preference.ts`
- Test: `tests/unit/theme/tokens.test.ts`, `tests/unit/theme/theme-preference.test.ts`

**Interfaces:**
- Consumes: `SettingsStorage`, `createMemorySettingsStorage` from `@/application/settings-store`.
- Produces: `type ThemeMode = 'light' | 'dark'`; `interface ThemeColors { background; surface; text; textMuted; border; primary; onPrimary; danger; success; inputBackground; placeholder }` (all `string`); `interface Theme { mode: ThemeMode; colors: ThemeColors; spacing: { xs: number; sm: number; md: number; lg: number; xl: number }; radius: { sm: number; md: number }; typography: { headingSize: number; titleSize: number; bodySize: number } }`; `lightTheme: Theme`; `darkTheme: Theme`; `themeForMode(mode: ThemeMode): Theme`; `type ThemePreference = 'system' | 'light' | 'dark'`; `THEME_PREFERENCES: readonly ThemePreference[]`; `DEFAULT_THEME_PREFERENCE = 'system'`; `resolveThemeMode(preference: ThemePreference, systemScheme: 'light' | 'dark' | null | undefined): ThemeMode`; `loadThemePreference(storage: SettingsStorage): Promise<ThemePreference>`; `saveThemePreference(storage: SettingsStorage, preference: ThemePreference): Promise<void>`; `THEME_STORAGE_KEY = 'avionix.theme'`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/theme/tokens.test.ts`:

```ts
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
```

`tests/unit/theme/theme-preference.test.ts`:

```ts
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  loadThemePreference,
  resolveThemeMode,
  saveThemePreference,
} from '@/theme/theme-preference';

describe('resolveThemeMode', () => {
  it('follows the OS scheme when the preference is system', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
  });

  it('defaults to light when the OS scheme is unknown', () => {
    expect(resolveThemeMode('system', null)).toBe('light');
    expect(resolveThemeMode('system', undefined)).toBe('light');
  });

  it('uses the explicit preference regardless of the OS scheme', () => {
    expect(resolveThemeMode('light', 'dark')).toBe('light');
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
  });
});

describe('theme preference persistence', () => {
  it('defaults to system when nothing is stored', async () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
    await expect(loadThemePreference(createMemorySettingsStorage())).resolves.toBe('system');
  });

  it('round-trips the preference under the documented key', async () => {
    const storage = createMemorySettingsStorage();
    await saveThemePreference(storage, 'dark');
    expect(await storage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify({ preference: 'dark' }));
    await expect(loadThemePreference(storage)).resolves.toBe('dark');
  });

  it.each(['{bad json', JSON.stringify({ preference: 'sepia' }), JSON.stringify({ mode: 'dark' })])(
    'falls back to system on corrupt data %s',
    async (raw) => {
      const storage = createMemorySettingsStorage();
      await storage.setItem(THEME_STORAGE_KEY, raw);
      await expect(loadThemePreference(storage)).resolves.toBe('system');
    },
  );

  it('swallows storage failures on read and write', async () => {
    const failing = {
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => {
        throw new Error('disk');
      },
    };
    await expect(loadThemePreference(failing)).resolves.toBe('system');
    await expect(saveThemePreference(failing, 'light')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/theme`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/theme/tokens.ts`**

```ts
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
    placeholder: '#8b929c',
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
    primary: '#58a6ff',
    onPrimary: '#0e1117',
    danger: '#ff7b72',
    success: '#3fb950',
    inputBackground: '#0d1117',
    placeholder: '#6e7681',
  },
  spacing,
  radius,
  typography,
};

export function themeForMode(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
```

- [ ] **Step 4: Implement `src/theme/theme-preference.ts`**

```ts
import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import type { ThemeMode } from '@/theme/tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export const THEME_STORAGE_KEY = 'avionix.theme';

const storedSchema = z.object({ preference: z.enum(['system', 'light', 'dark']) });

export function resolveThemeMode(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
): ThemeMode {
  if (preference === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return preference;
}

export async function loadThemePreference(storage: SettingsStorage): Promise<ThemePreference> {
  try {
    const raw = await storage.getItem(THEME_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_THEME_PREFERENCE;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.preference : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export async function saveThemePreference(
  storage: SettingsStorage,
  preference: ThemePreference,
): Promise<void> {
  try {
    await storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ preference }));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
```

- [ ] **Step 5: Run, gate, commit**

```bash
npx jest tests/unit/theme
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/theme tests/unit/theme
git commit -m "feat(theme): add light/dark tokens and persisted theme preference

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: ThemeProvider, hooks, primitives and toggle (UI tests)

**Files:**
- Create: `src/theme/theme-context.tsx`, `src/theme/primitives.tsx`, `src/theme/ThemeToggle.tsx`
- Test: `tests/ui/theme.test.tsx`

**Interfaces:**
- Consumes: Task 1 exports; `SettingsStorage`, `createMemorySettingsStorage`.
- Produces: `ThemeProvider({ storage: SettingsStorage; systemSchemeOverride?: ThemeMode | null; children })`; `useTheme(): Theme`; `useThemePreference(): { preference: ThemePreference; setPreference: (p: ThemePreference) => void; ready: boolean }`; `useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): T`; primitives `Section`, `SectionTitle`, `BodyText` (props: `muted?: boolean; tone?: 'danger' | 'success'`), `ThemedTextInput` (all `TextInput` props); `ThemeToggle()` rendering three radios labelled `Theme System`, `Theme Light`, `Theme Dark` with visible text `System`, `Light`, `Dark`.

- [ ] **Step 1: Write the failing UI tests**

`tests/ui/theme.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import { ThemeProvider, useTheme, useThemePreference } from '@/theme/theme-context';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { THEME_STORAGE_KEY, saveThemePreference } from '@/theme/theme-preference';
import { darkTheme, lightTheme } from '@/theme/tokens';

function Probe() {
  const theme = useTheme();
  const { preference, ready } = useThemePreference();
  return (
    <>
      <Text testID="mode">{theme.mode}</Text>
      <Text testID="preference">{preference}</Text>
      <Text testID="ready">{ready ? 'ready' : 'loading'}</Text>
      <Text testID="background">{theme.colors.background}</Text>
    </>
  );
}

describe('ThemeProvider', () => {
  it('follows the OS scheme by default', async () => {
    await render(
      <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="dark">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('ready'));
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('background')).toHaveTextContent(darkTheme.colors.background);
  });

  it('applies a persisted preference over the OS scheme', async () => {
    const storage = createMemorySettingsStorage();
    await saveThemePreference(storage, 'light');
    await render(
      <ThemeProvider storage={storage} systemSchemeOverride="dark">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('preference')).toHaveTextContent('light'));
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(screen.getByTestId('background')).toHaveTextContent(lightTheme.colors.background);
  });

  it('useTheme throws outside the provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => render(<Probe />)).rejects.toThrow('ThemeProvider');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('ThemeToggle', () => {
  it('switches the resolved theme and persists the choice', async () => {
    const storage = createMemorySettingsStorage();
    await render(
      <ThemeProvider storage={storage} systemSchemeOverride="light">
        <ThemeToggle />
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('ready'));
    expect(screen.getByTestId('mode')).toHaveTextContent('light');

    await fireEvent.press(screen.getByLabelText('Theme Dark'));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('dark'));
    expect(screen.getByLabelText('Theme Dark')).toHaveAccessibilityState({ selected: true });
    expect(screen.getByLabelText('Theme System')).toHaveAccessibilityState({ selected: false });
    await waitFor(async () =>
      expect(await storage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify({ preference: 'dark' })),
    );

    await fireEvent.press(screen.getByLabelText('Theme System'));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('light'));
  });
});
```

If `toHaveTextContent`/`toHaveAccessibilityState` are reported as unknown matchers, add `import '@testing-library/react-native/extend-expect';` at the top of the test file (v14 ships the matchers; the import is harmless).

The "throws outside the provider" test: `render` is async in Testing Library 14, so the assertion uses `.rejects`. If the runtime surfaces the error synchronously instead, change the assertion to `await expect(render(<Probe />)).rejects.toThrow('ThemeProvider')` and make the test `async`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest --selectProjects expo tests/ui/theme.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/theme/theme-context.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  const systemScheme = systemSchemeOverride === undefined ? osScheme : systemSchemeOverride;
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadThemePreference(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      setPreferenceState(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
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

export function useThemePreference(): Pick<ThemeContextValue, 'preference' | 'setPreference' | 'ready'> {
  const { preference, setPreference, ready } = useThemeContext();
  return { preference, setPreference, ready };
}

/**
 * Builds a StyleSheet from the current theme. Pass a module-level factory so the
 * memo key is stable and styles are rebuilt only when the theme changes.
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [factory, theme]);
}
```

- [ ] **Step 4: Implement `src/theme/primitives.tsx`**

```tsx
import React from 'react';
import { Text, TextInput, type TextInputProps, type TextProps, View, type ViewProps } from 'react-native';

import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text,
    fontWeight: 'bold' as const,
    fontSize: theme.typography.titleSize,
    marginBottom: theme.spacing.xs,
  },
  body: { color: theme.colors.text, fontSize: theme.typography.bodySize },
  muted: { color: theme.colors.textMuted },
  danger: { color: theme.colors.danger },
  success: { color: theme.colors.success },
  input: {
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    fontSize: theme.typography.bodySize,
  },
});

export function Section({ style, ...rest }: ViewProps) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.section, style]} {...rest} />;
}

export function SectionTitle({ style, ...rest }: TextProps) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={[styles.title, style]} {...rest} />;
}

export interface BodyTextProps extends TextProps {
  muted?: boolean;
  tone?: 'danger' | 'success';
}

export function BodyText({ muted = false, tone, style, ...rest }: BodyTextProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text
      style={[
        styles.body,
        muted ? styles.muted : null,
        tone === 'danger' ? styles.danger : null,
        tone === 'success' ? styles.success : null,
        style,
      ]}
      {...rest}
    />
  );
}

export function ThemedTextInput({ style, ...rest }: TextInputProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TextInput
      placeholderTextColor={theme.colors.placeholder}
      keyboardAppearance={theme.mode}
      style={[styles.input, style]}
      {...rest}
    />
  );
}
```

- [ ] **Step 5: Implement `src/theme/ThemeToggle.tsx`**

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useThemePreference, useThemedStyles } from '@/theme/theme-context';
import { THEME_PREFERENCES, type ThemePreference } from '@/theme/theme-preference';
import type { Theme } from '@/theme/tokens';

const LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { color: theme.colors.text, fontSize: theme.typography.bodySize },
  chipTextSelected: { color: theme.colors.onPrimary, fontWeight: 'bold' as const },
});

export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {THEME_PREFERENCES.map((option) => {
        const selected = option === preference;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={`Theme ${LABELS[option]}`}
            accessibilityState={{ selected }}
            onPress={() => setPreference(option)}
            style={[styles.chip, selected ? styles.chipSelected : null]}
          >
            <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
              {LABELS[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 6: Run, gate, commit**

```bash
npx jest --selectProjects expo tests/ui/theme.test.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/theme tests/ui/theme.test.tsx
git commit -m "feat(theme): add ThemeProvider, themed primitives and the system/light/dark toggle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

If `useThemedStyles`'s generic does not satisfy `StyleSheet.create`'s constraint under React Native 0.86 typings, change the signature to `useThemedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<unknown>>` first; if still rejected, keep `T extends StyleSheet.NamedStyles<T>` and call `StyleSheet.create<T>(factory(theme))`. Never fall back to `any`.

---

### Task 3: Migrate the MVP screen to the theme and mount the toggle

**Files:**
- Modify: `src/features/connection/ConnectionForm.tsx`, `src/features/connection/ConnectionStatus.tsx`, `src/features/diagnostics/DiagnosticsPanel.tsx`, `src/features/mvp/TelemetryPanel.tsx`, `src/features/mvp/ControlPanel.tsx`, `src/features/mvp/MvpScreen.tsx`, `src/app/AvionixApp.tsx`
- Test: `tests/ui/mvp-screen.test.tsx` (wrapper gains `ThemeProvider`; one new test)

**Interfaces:**
- Consumes: `ThemeProvider`, `useTheme`, `useThemedStyles`, `Section`, `SectionTitle`, `BodyText`, `ThemedTextInput`, `ThemeToggle`, `darkTheme`, `lightTheme`.
- Produces: `MvpScreen` root `ScrollView` carries `testID="mvp-screen"` and a `style` with the theme background; every visible string from the existing tests is unchanged.

- [ ] **Step 1: Update the screen test wrapper and add the dark-mode test**

In `tests/ui/mvp-screen.test.tsx` add imports:

```tsx
import { ThemeProvider } from '@/theme/theme-context';
import { saveThemePreference } from '@/theme/theme-preference';
import { darkTheme, lightTheme } from '@/theme/tokens';
```

Replace `renderScreen` with:

```tsx
async function renderScreen(services: AppServices, systemScheme: 'light' | 'dark' = 'light') {
  return render(
    <ServicesProvider services={services}>
      <ThemeProvider storage={services.settingsStorage} systemSchemeOverride={systemScheme}>
        <MvpScreen />
      </ThemeProvider>
    </ServicesProvider>,
  );
}
```

Add two tests at the end of the `describe('MvpScreen', ...)` block:

```tsx
  it('paints the light theme by default and the dark theme when the OS is dark', async () => {
    const { services } = makeServices();
    const light = await renderScreen(services, 'light');
    expect(screen.getByTestId('mvp-screen')).toHaveStyle({
      backgroundColor: lightTheme.colors.background,
    });
    light.unmount();
    await renderScreen(makeServices().services, 'dark');
    await waitFor(() =>
      expect(screen.getByTestId('mvp-screen')).toHaveStyle({
        backgroundColor: darkTheme.colors.background,
      }),
    );
  });

  it('applies a persisted dark preference and lets the toggle switch back', async () => {
    const { services } = makeServices();
    await saveThemePreference(services.settingsStorage, 'dark');
    await renderScreen(services, 'light');
    await waitFor(() =>
      expect(screen.getByTestId('mvp-screen')).toHaveStyle({
        backgroundColor: darkTheme.colors.background,
      }),
    );
    await fireEvent.press(screen.getByLabelText('Theme Light'));
    await waitFor(() =>
      expect(screen.getByTestId('mvp-screen')).toHaveStyle({
        backgroundColor: lightTheme.colors.background,
      }),
    );
  });
```

Run: `npx jest --selectProjects expo tests/ui/mvp-screen.test.tsx`
Expected: FAIL (`ThemeProvider` renders but `mvp-screen` testID and background are missing; existing tests still pass).

- [ ] **Step 2: Rewrite `src/features/connection/ConnectionForm.tsx`**

```tsx
import React from 'react';
import { Button, View } from 'react-native';

import type { ConnectionState } from '@/domain/connection/connection-state';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  host: string;
  port: string;
  state: ConnectionState;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md },
});

export function ConnectionForm(props: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const busy = props.state === 'connecting' || props.state === 'reconnecting';
  const connected = props.state === 'connected' || busy;
  return (
    <Section>
      <SectionTitle>Connection</SectionTitle>
      <BodyText>X-Plane host (IP or hostname on your LAN)</BodyText>
      <ThemedTextInput
        accessibilityLabel="X-Plane host"
        value={props.host}
        onChangeText={props.onHostChange}
        placeholder="192.168.1.100"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!connected}
      />
      <BodyText>Port</BodyText>
      <ThemedTextInput
        accessibilityLabel="Port"
        value={props.port}
        onChangeText={props.onPortChange}
        keyboardType="number-pad"
        editable={!connected}
      />
      <View style={styles.row}>
        <Button
          title="Connect"
          onPress={props.onConnect}
          disabled={connected}
          color={theme.colors.primary}
        />
        <Button
          title="Disconnect"
          onPress={props.onDisconnect}
          disabled={props.state === 'disconnected'}
          color={theme.colors.primary}
        />
      </View>
    </Section>
  );
}
```

- [ ] **Step 3: Rewrite `src/features/connection/ConnectionStatus.tsx`**

```tsx
import React from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';

export function ConnectionStatus({ snapshot }: { snapshot: SessionSnapshot }) {
  const versions = snapshot.capabilities?.rawApiVersions.join(', ') ?? '-';
  const using = snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`;
  return (
    <Section>
      <SectionTitle>Status</SectionTitle>
      <BodyText>Status: {snapshot.state}</BodyText>
      {snapshot.state === 'reconnecting' ? (
        <BodyText>Reconnect attempt: {snapshot.reconnectAttempt}</BodyText>
      ) : null}
      <BodyText>X-Plane version: {snapshot.capabilities?.simulatorVersion ?? '-'}</BodyText>
      <BodyText>
        API versions: {versions}
        {using}
      </BodyText>
      {snapshot.error !== null ? (
        <BodyText tone="danger">
          {snapshot.error.code}: {snapshot.error.message}
        </BodyText>
      ) : null}
    </Section>
  );
}
```

- [ ] **Step 4: Rewrite `src/features/diagnostics/DiagnosticsPanel.tsx`**

```tsx
import React from 'react';

import type { SessionSnapshot, StepStatus } from '@/application/session-snapshot';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';

function label(status: StepStatus): string {
  switch (status) {
    case 'ok':
      return 'YES';
    case 'failed':
      return 'NO';
    case 'pending':
      return '...';
    case 'idle':
      return '-';
  }
}

function tone(status: StepStatus): 'danger' | 'success' | undefined {
  if (status === 'ok') {
    return 'success';
  }
  if (status === 'failed') {
    return 'danger';
  }
  return undefined;
}

export function DiagnosticsPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  const d = snapshot.diagnostics;
  return (
    <Section>
      <SectionTitle>Diagnostics</SectionTitle>
      <BodyText>
        Target: {snapshot.config === null ? '-' : `${snapshot.config.host}:${snapshot.config.port}`}
      </BodyText>
      <BodyText tone={tone(d.http)}>HTTP: {label(d.http)}</BodyText>
      <BodyText tone={tone(d.capabilities)}>Capabilities: {label(d.capabilities)}</BodyText>
      <BodyText tone={tone(d.websocket)}>WebSocket: {label(d.websocket)}</BodyText>
      {Object.entries(d.dataRefs).map(([name, status]) => (
        <BodyText key={name} tone={tone(status)}>
          DataRef {name}: {label(status)}
        </BodyText>
      ))}
      <BodyText tone={tone(d.command)}>Command: {label(d.command)}</BodyText>
      <BodyText tone={tone(d.subscription)}>Subscription: {label(d.subscription)}</BodyText>
    </Section>
  );
}
```

- [ ] **Step 5: Rewrite `src/features/mvp/TelemetryPanel.tsx`**

```tsx
import React from 'react';
import { View } from 'react-native';

import { MVP_DATAREFS } from '@/application/mvp-bindings';
import type { SessionSnapshot, TelemetrySample } from '@/application/session-snapshot';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

function formatValue(sample: TelemetrySample | undefined): string {
  if (sample === undefined) {
    return '-';
  }
  if (typeof sample.value === 'number') {
    return Number.isInteger(sample.value) ? String(sample.value) : sample.value.toFixed(1);
  }
  if (Array.isArray(sample.value)) {
    return `[${sample.value.join(', ')}]`;
  }
  return sample.value;
}

const ROWS: { label: string; name: string }[] = [
  { label: 'Sim running time (s)', name: MVP_DATAREFS.heartbeat },
  { label: 'Indicated airspeed (kt)', name: MVP_DATAREFS.airspeed },
  { label: 'Heading bug (deg)', name: MVP_DATAREFS.heading },
];

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing.sm,
  },
  value: { fontVariant: ['tabular-nums' as const], fontWeight: 'bold' as const },
});

export function TelemetryPanel({ snapshot, now }: { snapshot: SessionSnapshot; now: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Section>
      <SectionTitle>Live telemetry</SectionTitle>
      {ROWS.map((row) => {
        const sample = snapshot.telemetry[row.name];
        const age =
          sample === undefined
            ? ''
            : ` (${Math.max(0, Math.round((now - sample.receivedAt) / 1000))}s ago)`;
        return (
          <View key={row.name} style={styles.row}>
            <BodyText>{row.label}</BodyText>
            <BodyText style={styles.value}>{formatValue(sample)}</BodyText>
            <BodyText muted>{age}</BodyText>
          </View>
        );
      })}
    </Section>
  );
}
```

- [ ] **Step 6: Rewrite `src/features/mvp/ControlPanel.tsx`**

```tsx
import React, { useState } from 'react';
import { Button, View } from 'react-native';

import type { LastOperation } from '@/application/session-snapshot';
import { BodyText, Section, SectionTitle, ThemedTextInput } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

interface Props {
  enabled: boolean;
  lastOperation: LastOperation | null;
  onWriteHeading: (value: number) => void;
  onHeadingUp: () => void;
}

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md, marginBottom: theme.spacing.sm },
});

export function ControlPanel(props: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [heading, setHeading] = useState('90');
  const parsed = Number(heading);
  const canWrite = props.enabled && heading.trim() !== '' && Number.isFinite(parsed);
  return (
    <Section>
      <SectionTitle>Test controls</SectionTitle>
      <BodyText>Heading bug to write (0-360)</BodyText>
      <ThemedTextInput
        accessibilityLabel="Heading to write"
        value={heading}
        onChangeText={setHeading}
        keyboardType="numeric"
      />
      <View style={styles.row}>
        <Button
          title="Write heading"
          onPress={() => props.onWriteHeading(parsed)}
          disabled={!canWrite}
          color={theme.colors.primary}
        />
        <Button
          title="Heading up"
          onPress={props.onHeadingUp}
          disabled={!props.enabled}
          color={theme.colors.primary}
        />
      </View>
      <BodyText tone={props.lastOperation === null || props.lastOperation.ok ? undefined : 'danger'}>
        Last operation:{' '}
        {props.lastOperation === null
          ? '-'
          : `${props.lastOperation.ok ? 'OK' : 'FAILED'} ${props.lastOperation.message}`}
      </BodyText>
    </Section>
  );
}
```

- [ ] **Step 7: Rewrite `src/features/mvp/MvpScreen.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { ConnectionForm } from '@/features/connection/ConnectionForm';
import { ConnectionStatus } from '@/features/connection/ConnectionStatus';
import { DiagnosticsPanel } from '@/features/diagnostics/DiagnosticsPanel';
import { ControlPanel } from '@/features/mvp/ControlPanel';
import { TelemetryPanel } from '@/features/mvp/TelemetryPanel';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { useSimulatorSession } from '@/hooks/useSimulatorSession';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  container: { padding: theme.spacing.lg, paddingTop: 56 },
  heading: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    marginBottom: theme.spacing.md,
  },
});

export function MvpScreen() {
  const { snapshot, connect, disconnect, writeHeading, activateHeadingUp } = useSimulatorSession();
  const settings = useConnectionSettings();
  const styles = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const onConnect = useCallback(() => {
    void settings.persist();
    void connect(settings.host, settings.port);
  }, [connect, settings]);

  return (
    <ScrollView
      testID="mvp-screen"
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Avionix</Text>
      <ThemeToggle />
      <ConnectionForm
        host={settings.host}
        port={settings.port}
        state={snapshot.state}
        onHostChange={settings.setHost}
        onPortChange={settings.setPort}
        onConnect={onConnect}
        onDisconnect={disconnect}
      />
      <ConnectionStatus snapshot={snapshot} />
      <DiagnosticsPanel snapshot={snapshot} />
      <TelemetryPanel snapshot={snapshot} now={now} />
      <ControlPanel
        enabled={snapshot.state === 'connected'}
        lastOperation={snapshot.lastOperation}
        onWriteHeading={(value) => void writeHeading(value)}
        onHeadingUp={() => void activateHeadingUp()}
      />
    </ScrollView>
  );
}
```

- [ ] **Step 8: Rewrite `src/app/AvionixApp.tsx`**

```tsx
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';

import { createAppServices } from '@/app/composition-root';
import { ServicesProvider } from '@/app/services-context';
import { MvpScreen } from '@/features/mvp/MvpScreen';
import { ThemeProvider, useTheme } from '@/theme/theme-context';

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />;
}

export function AvionixApp() {
  const services = useMemo(() => createAppServices(), []);
  return (
    <ServicesProvider services={services}>
      <ThemeProvider storage={services.settingsStorage}>
        <ThemedStatusBar />
        <MvpScreen />
      </ThemeProvider>
    </ServicesProvider>
  );
}
```

- [ ] **Step 9: Run the UI tests, verify no colour literals remain, gate, commit**

```bash
npx jest --selectProjects expo
grep -rnE "#[0-9a-fA-F]{3,6}\b" src/features src/app && echo "COLOUR LITERALS FOUND" || echo "no colour literals"
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:validate
git add src/features src/app tests/ui/mvp-screen.test.tsx
git commit -m "feat(ui): migrate the MVP screen to theme tokens and mount the theme toggle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: all existing screen assertions unchanged and passing (the visible strings are identical), the two new tests pass, no colour literals under `src/features` or `src/app`.

---

### Task 4: Documentation

**Files:**
- Modify: `docs/architecture.md`, `README.md`

- [ ] **Step 1: Append a "Theming" section to `docs/architecture.md`**

```markdown
## Theming

`src/theme` owns appearance. A `Theme` (`tokens.ts`) holds `mode`, `colors`, `spacing`, `radius`
and `typography`; `lightTheme` and `darkTheme` share one shape, so adding a palette later means
adding one more `Theme` object. `ThemeProvider` (`theme-context.tsx`) resolves the effective mode
from the persisted preference (`system`, `light`, `dark`; key `avionix.theme`, validated with zod,
default `system`) and the OS colour scheme, and exposes `useTheme()`, `useThemePreference()` and
`useThemedStyles(factory)`. Components never hold colour literals; they use the primitives in
`primitives.tsx` (`Section`, `SectionTitle`, `BodyText`, `ThemedTextInput`) or build styles from
the theme. The toggle (`ThemeToggle.tsx`) sits under the Avionix heading. The theme preference is
the second persisted setting after host and port; nothing else is stored.
```

- [ ] **Step 2: Add a feature line to `README.md` "MVP scope"**

Insert after the diagnostics bullet:

```markdown
- Light / dark theme with a system / light / dark toggle; the choice is persisted.
```

- [ ] **Step 3: Gate and commit**

```bash
npm run format:check && npm test
git add docs/architecture.md README.md
git commit -m "docs: describe the theme system

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan self-review notes

- **Design coverage:** tokens → Task 1; preference + resolution + persistence → Task 1; provider/hooks/`useThemedStyles` → Task 2; toggle under the heading → Tasks 2–3; migration of the six components, status bar following the theme, `userInterfaceStyle: automatic` untouched → Task 3; tests for resolution, persistence, provider default, toggle switching/persisting, screen in both modes → Tasks 1–3; docs → Task 4. Out-of-scope items are not implemented anywhere.
- **Type consistency:** `ThemeMode`, `Theme`, `ThemePreference`, `resolveThemeMode`, `THEME_STORAGE_KEY`, `ThemeProvider` props (`storage`, `systemSchemeOverride`), `useThemedStyles(factory)`, primitive names and `BodyText` props (`muted`, `tone`) are used identically in Tasks 2, 3 and the tests.
- **Test contract:** all visible strings asserted by the existing screen tests (`Status: disconnected`, `X-Plane version: ...`, `WebSocket: YES`, `124.3`, `Last operation: OK ...`, `Capabilities: NO`, accessibility labels) are preserved verbatim by the migrated components.
