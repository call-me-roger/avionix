import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import React from 'react';
import { Text } from 'react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import { HapticsProvider, useHaptics } from '@/features/haptics/HapticsProvider';
import { HapticsToggle } from '@/features/haptics/HapticsToggle';
import { HAPTICS_STORAGE_KEY } from '@/features/haptics/haptics-preference';
import { haptics } from '@/platform/haptics';
import { ThemeProvider } from '@/theme/theme-context';

jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }));

function Probe() {
  const { press } = useHaptics();
  return (
    <Text testID="fire" onPress={press}>
      fire
    </Text>
  );
}

describe('HapticsProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to on: a probe calling useHaptics().press() calls the adapter', async () => {
    await render(
      <HapticsProvider storage={createMemorySettingsStorage()}>
        <Probe />
      </HapticsProvider>,
    );
    await fireEvent.press(screen.getByTestId('fire'));
    expect(haptics.press).toHaveBeenCalledTimes(1);
  });

  it('pressing Off persists the preference and silences later press()', async () => {
    const storage = createMemorySettingsStorage();
    await render(
      <ThemeProvider storage={createMemorySettingsStorage()}>
        <HapticsProvider storage={storage}>
          <HapticsToggle />
          <Probe />
        </HapticsProvider>
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByLabelText('Haptic feedback Off'));
    await waitFor(async () =>
      expect(await storage.getItem(HAPTICS_STORAGE_KEY)).toBe(JSON.stringify({ enabled: false })),
    );

    await fireEvent.press(screen.getByTestId('fire'));
    expect(haptics.press).not.toHaveBeenCalled();
  });

  it('loads a stored off preference', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(HAPTICS_STORAGE_KEY, JSON.stringify({ enabled: false }));
    await render(
      <ThemeProvider storage={createMemorySettingsStorage()}>
        <HapticsProvider storage={storage}>
          <HapticsToggle />
        </HapticsProvider>
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('Haptic feedback Off')).toBeChecked());
    expect(screen.getByLabelText('Haptic feedback On')).not.toBeChecked();
  });

  it('useHaptics() outside the provider still fires', async () => {
    await render(<Probe />);
    await fireEvent.press(screen.getByTestId('fire'));
    expect(haptics.press).toHaveBeenCalledTimes(1);
  });
});
