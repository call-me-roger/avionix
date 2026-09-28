import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { FlightDataStrip } from '@/features/panels/flight-data/FlightDataStrip';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

const VALUES: Record<string, number> = {
  [D.groundSpeed]: 142.4,
  [D.windSpeed]: 12.4,
  [D.windDirection]: 270,
  [D.fuelTotal]: 1234.5,
  [D.zuluTime]: 50709,
  [D.inReplay]: 0,
};

function telemetry(values: Record<string, number>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: telemetry(VALUES),
    ...overrides,
  };
}

function withMissing(snapshot: SessionSnapshot, ...names: string[]): SessionSnapshot {
  const bindings = { ...snapshot.compatibility.bindings };
  for (const name of names) {
    bindings[name] = { name, kind: 'dataref', status: 'missing' };
  }
  return { ...snapshot, compatibility: { ...snapshot.compatibility, bindings } };
}

const NAME =
  'Flight data: ground speed 142 kt, wind 270° / 12 kt, fuel 1,235 kg, sim zulu 14:05:09Z. Open flight data.';

async function renderStrip(
  snapshot: SessionSnapshot,
  onOpen: (() => void) | null = () => undefined,
) {
  const storage = createMemorySettingsStorage();
  return render(
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <FlightDataStrip snapshot={snapshot} now={NOW} onOpen={onOpen} />
      </UnitsProvider>
    </ThemeProvider>,
  );
}

describe('FlightDataStrip', () => {
  it('exposes one accessible name for the row and opens flight data on press', async () => {
    const onOpen = jest.fn();
    await renderStrip(live(), onOpen);
    const strip = screen.getByLabelText(NAME);
    expect(strip).toBeTruthy();
    expect(strip.props.accessibilityRole).toBe('button');
    await fireEvent.press(strip);
    expect(onOpen).toHaveBeenCalled();
  });

  it('is a plain, non-pressable view when onOpen is null', async () => {
    await renderStrip(live(), null);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('flight-data-strip')).toBeTruthy();
  });

  it('says not live when disconnected', async () => {
    await renderStrip({
      ...live(),
      state: 'disconnected',
      health: { ...base.health, activity: 'unknown', lastHeartbeatAt: NOW - 5000 },
    });
    expect(screen.getByLabelText(/not live/)).toBeTruthy();
  });

  it('shows the paused badge', async () => {
    await renderStrip(live({ health: { ...live().health, activity: 'paused', live: false } }));
    expect(screen.getByLabelText('X-Plane is paused')).toBeTruthy();
  });

  it('renders n/a for a missing fuel DataRef only', async () => {
    await renderStrip(withMissing(live(), D.fuelTotal));
    expect(
      screen.getByLabelText(
        'Flight data: ground speed 142 kt, wind 270° / 12 kt, fuel n/a, sim zulu 14:05:09Z. Open flight data.',
      ),
    ).toBeTruthy();
  });

  it('is at least 48 dp in both directions', async () => {
    await renderStrip(live());
    const style = StyleSheet.flatten(screen.getByTestId('flight-data-strip').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });
});
