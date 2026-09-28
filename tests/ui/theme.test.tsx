import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

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

  it('useTheme throws outside the provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(render(<Probe />)).rejects.toThrow('ThemeProvider');
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
    expect(screen.getByLabelText('Theme Dark')).toBeChecked();
    expect(screen.getByLabelText('Theme Dark')).toBeSelected();
    expect(screen.getByLabelText('Theme System')).not.toBeChecked();
    expect(screen.getByLabelText('Theme System')).not.toBeSelected();
    await waitFor(async () =>
      expect(await storage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify({ preference: 'dark' })),
    );

    await fireEvent.press(screen.getByLabelText('Theme System'));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('light'));
  });

  it('offers night and applies it', async () => {
    const storage = createMemorySettingsStorage();
    await render(
      <ThemeProvider storage={storage} systemSchemeOverride="light">
        <ThemeToggle />
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('ready'));
    await fireEvent.press(screen.getByLabelText('Theme Night'));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('night'));
    expect(screen.getByLabelText('Theme System (night)')).not.toBeChecked();
  });

  it('meets the touch rules on every chip', async () => {
    await render(
      <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
        <ThemeToggle />
      </ThemeProvider>,
    );
    for (const chip of screen.getAllByRole('radio')) {
      const style = StyleSheet.flatten(chip.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });

  it('a choice made before the stored preference loads is not overwritten', async () => {
    let release: (value: string | null) => void = () => undefined;
    const storage = {
      getItem: () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
      setItem: jest.fn(async () => undefined),
    };

    await render(
      <ThemeProvider storage={storage} systemSchemeOverride="light">
        <ThemeToggle />
        <Probe />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByLabelText('Theme Dark'));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('dark'));

    release(JSON.stringify({ preference: 'light' }));
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('ready'));

    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
  });
});
