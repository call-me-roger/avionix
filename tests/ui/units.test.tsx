import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import { UNITS_STORAGE_KEY } from '@/application/unit-preferences';
import { UnitsProvider, useUnits } from '@/features/units/UnitsProvider';
import { UnitsSection } from '@/features/units/UnitsSection';
import { ThemeProvider } from '@/theme/theme-context';

function Probe() {
  const { units, ready } = useUnits();
  return (
    <Text testID="units">{`${ready ? 'ready' : 'loading'} ${units.fuel} ${units.temperature} ${units.distance}`}</Text>
  );
}

function tree(storage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <UnitsSection />
        <Probe />
      </UnitsProvider>
    </ThemeProvider>
  );
}

describe('units', () => {
  it('starts on the defaults', async () => {
    await render(tree());
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('ready kg C nm'));
    expect(screen.getByRole('radio', { name: 'Fuel in kilograms' })).toBeChecked();
  });

  it('changes a unit and keeps it across a restart', async () => {
    const storage = createMemorySettingsStorage();
    const first = await render(tree(storage));
    await waitFor(() =>
      expect(screen.getByTestId('units')).toHaveTextContent('ready', { exact: false }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Fuel in pounds' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Temperature in Fahrenheit' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Distance in kilometres' }));
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem(UNITS_STORAGE_KEY)) ?? 'null')).toEqual({
        fuel: 'lb',
        temperature: 'F',
        distance: 'km',
      }),
    );
    await first.unmount();
    await render(tree(storage));
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('ready lb F km'));
  });

  it('a choice made before the stored units load is not overwritten', async () => {
    let release: (value: string | null) => void = () => undefined;
    const storage = {
      getItem: (key: string) =>
        key === UNITS_STORAGE_KEY
          ? new Promise<string | null>((resolve) => (release = resolve))
          : Promise.resolve(null),
      setItem: jest.fn(async () => undefined),
    };
    await render(tree(storage));
    await fireEvent.press(screen.getByRole('radio', { name: 'Fuel in pounds' }));
    release(JSON.stringify({ fuel: 'kg', temperature: 'F', distance: 'km' }));
    await waitFor(() => expect(screen.getByTestId('units')).toHaveTextContent('ready lb C nm'));
  });

  it('meets the touch rules on every chip', async () => {
    await render(tree());
    for (const chip of screen.getAllByRole('radio')) {
      const style = StyleSheet.flatten(chip.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });

  it('useUnits throws outside the provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(render(<Probe />)).rejects.toThrow('useUnits must be used inside UnitsProvider');
    } finally {
      spy.mockRestore();
    }
  });
});
