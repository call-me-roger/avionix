import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { FlightDataPanel } from '@/features/panels/flight-data/FlightDataPanel';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider, useUnits } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

const VALUES: Record<string, number | string> = {
  [D.groundSpeed]: 142.4,
  [D.trueAirspeed]: 150.2,
  [D.groundTrack]: 87.2,
  [D.windSpeed]: 12.4,
  [D.windDirection]: 270,
  [D.outsideAirTemp]: -12.3,
  [D.totalAirTemp]: -9,
  [D.fuelTotal]: 1234.5,
  [D.zuluTime]: 50709,
  [D.localTime]: 32709,
  [D.inReplay]: 0,
  [D.gpsDistance]: 126.4,
  [D.gpsTimeToGo]: 53.2,
  [D.gpsDestinationId]: base64('KSEA\0\0\0\0'),
};

function telemetry(values: Record<string, number | string>, receivedAt = NOW) {
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

function PoundsButton() {
  const { setUnit } = useUnits();
  return (
    <Pressable accessibilityRole="button" onPress={() => setUnit('fuel', 'lb')}>
      <Text>use pounds</Text>
    </Pressable>
  );
}

const actions = { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };

async function renderPanel(snapshot: SessionSnapshot) {
  const storage = createMemorySettingsStorage();
  return render(
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PoundsButton />
        <PanelFrame title="Flight data" snapshot={snapshot} now={NOW} actions={actions}>
          <FlightDataPanel />
        </PanelFrame>
      </UnitsProvider>
    </ThemeProvider>,
  );
}

describe('Flight data panel', () => {
  it('shows every field, formatted', async () => {
    await renderPanel(live());
    expect(screen.getByLabelText('Ground speed: 142 kt')).toBeTruthy();
    expect(screen.getByLabelText('True airspeed: 150 kt')).toBeTruthy();
    expect(screen.getByLabelText('Track (magnetic): 087°')).toBeTruthy();
    expect(screen.getByLabelText('Wind (from): 270° / 12 kt')).toBeTruthy();
    expect(screen.getByLabelText('Outside air temp: −12 °C')).toBeTruthy();
    expect(screen.getByLabelText('Total air temp: −9 °C')).toBeTruthy();
    expect(screen.getByLabelText('Fuel remaining: 1,235 kg')).toBeTruthy();
    expect(screen.getByLabelText('Sim zulu: 14:05:09')).toBeTruthy();
    expect(screen.getByLabelText('Sim local: 09:05:09')).toBeTruthy();
    expect(screen.getByLabelText('GPS destination: KSEA, 126 nm, 0:53')).toBeTruthy();
  });

  it('applies a unit change everywhere at once', async () => {
    await renderPanel(live());
    await fireEvent.press(screen.getByText('use pounds'));
    await waitFor(() => expect(screen.getByLabelText('Fuel remaining: 2,722 lb')).toBeTruthy());
  });

  it('a steady value is not marked stale while the link is live', async () => {
    // Fuel arrived long ago and never changed; X-Plane only resends values that change.
    await renderPanel(live({ telemetry: telemetry(VALUES, NOW - 600_000) }));
    expect(screen.getByLabelText('Fuel remaining: 1,235 kg')).toBeTruthy();
    expect(screen.queryByText('not live')).toBeNull();
  });

  it('shows PAUSED without marking values stale', async () => {
    await renderPanel(live({ health: { ...live().health, activity: 'paused', live: false } }));
    expect(screen.getByLabelText('X-Plane is paused')).toBeTruthy();
    expect(screen.queryByText('not live')).toBeNull();
  });

  it('shows REPLAY', async () => {
    await renderPanel(live({ telemetry: telemetry({ ...VALUES, [D.inReplay]: 1 }) }));
    expect(screen.getByLabelText('X-Plane is in replay')).toBeTruthy();
  });

  it('keeps the last values, muted and not live, after the link drops, with no badge', async () => {
    await renderPanel({
      ...live({ telemetry: telemetry({ ...VALUES, [D.inReplay]: 1 }) }),
      state: 'disconnected',
      health: { ...base.health, activity: 'unknown', lastHeartbeatAt: NOW - 5000 },
    });
    expect(screen.getByLabelText('Ground speed: 142 kt, not live')).toBeTruthy();
    expect(screen.queryByLabelText('X-Plane is in replay')).toBeNull();
  });

  it('shows no values when no flight is loaded', async () => {
    await renderPanel(live({ health: { ...live().health, activity: 'noFlight', live: false } }));
    expect(screen.getByText('No flight loaded in X-Plane.')).toBeTruthy();
    expect(screen.getByLabelText('Ground speed: —, not live')).toBeTruthy();
  });

  it('marks only the field whose DataRef is missing', async () => {
    await renderPanel(withMissing(live(), D.totalAirTemp));
    expect(screen.getByLabelText('Total air temp: not available on this aircraft')).toBeTruthy();
    expect(screen.getByLabelText('Outside air temp: −12 °C')).toBeTruthy();
  });

  it('says the aircraft has no GPS destination when the GPS names are missing', async () => {
    await renderPanel(withMissing(live(), D.gpsDistance, D.gpsTimeToGo, D.gpsDestinationId));
    expect(screen.getByText('No destination available on this aircraft.')).toBeTruthy();
    expect(screen.queryByText(/ nm/)).toBeNull();
  });

  it('says no destination is set, never a zero distance', async () => {
    await renderPanel(
      live({
        telemetry: telemetry({
          ...VALUES,
          [D.gpsDestinationId]: base64('\0\0\0\0'),
          [D.gpsDistance]: 0,
        }),
      }),
    );
    expect(screen.getByText('No destination set in the GPS.')).toBeTruthy();
    expect(screen.queryByText(/0\.0 nm/)).toBeNull();
  });

  it('writes nothing', async () => {
    await renderPanel(live());
    await act(async () => undefined);
    expect(actions.write).not.toHaveBeenCalled();
    expect(actions.activate).not.toHaveBeenCalled();
  });
});
