import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { InstrumentPreferencesProvider } from '@/features/panels/instruments/InstrumentPreferencesProvider';
import { InstrumentsPanel } from '@/features/panels/instruments/InstrumentsPanel';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

const VALUES: Record<string, number | number[]> = {
  [D.airspeed]: 112.4,
  [D.mach]: 0.18,
  [D.altitude]: 4524,
  [D.verticalSpeed]: 503,
  [D.heading]: 270.2,
  [D.pitch]: 3.2,
  [D.roll]: 15.4,
  [D.turnRate]: 24,
  [D.slip]: 2.2,
  [D.radioAltitude]: 3000,
  [D.engineType]: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [D.vso]: 40,
  [D.vs]: 48,
  [D.vfe]: 85,
  [D.vno]: 129,
  [D.vne]: 163,
  [D.barometer]: 29.92,
};

function telemetry(values: Record<string, number | number[] | string>, receivedAt = NOW) {
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
    compatibility: {
      ...base.compatibility,
      features: base.compatibility.features.map((feature) => ({
        ...feature,
        status: 'available' as const,
      })),
    },
    ...overrides,
  };
}

function withIdentity(snapshot: SessionSnapshot, icaoType: string | null): SessionSnapshot {
  return {
    ...snapshot,
    compatibility: {
      ...snapshot.compatibility,
      identity: { ...snapshot.compatibility.identity, icaoType },
    },
  };
}

const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => undefined),
};

function tree(snapshot: SessionSnapshot, storage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="dark">
      <UnitsProvider storage={storage}>
        <InstrumentPreferencesProvider storage={storage}>
          <PanelFrame title="Instruments" snapshot={snapshot} now={NOW} actions={actions}>
            <InstrumentsPanel />
          </PanelFrame>
        </InstrumentPreferencesProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}

describe('Instruments panel', () => {
  it('opens a piston single on the six-pack by default', async () => {
    await render(tree(withIdentity(live(), 'C172')));
    expect(screen.getByTestId('six-pack')).toBeTruthy();
    expect(screen.getByLabelText('Six-pack gauges')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
  });

  it('opens a jet on the PFD by default', async () => {
    const snapshot = withIdentity(live(), 'B738');
    await render(
      tree({
        ...snapshot,
        telemetry: { ...snapshot.telemetry, ...telemetry({ [D.engineType]: [7, 7] }) },
      }),
    );
    expect(screen.getByTestId('pfd')).toBeTruthy();
  });

  it('remembers the choice per aircraft type', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(tree(withIdentity(live(), 'C172'), storage));
    await fireEvent.press(screen.getByLabelText('Primary flight display'));
    expect(screen.getByTestId('pfd')).toBeTruthy();
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem('avionix.instruments')) ?? '{}')).toEqual({
        last: 'pfd',
        byAircraft: { C172: 'pfd' },
      }),
    );
    // A different piston single still gets its engine default…
    await view.rerender(tree(withIdentity(live(), 'BE58'), storage));
    expect(screen.getByTestId('six-pack')).toBeTruthy();
    // …and the C172 comes back to the PFD, without a restart.
    await view.rerender(tree(withIdentity(live(), 'C172'), storage));
    expect(screen.getByTestId('pfd')).toBeTruthy();
  });

  it('restores the stored choice after a restart', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      'avionix.instruments',
      JSON.stringify({ last: 'pfd', byAircraft: { C172: 'pfd' } }),
    );
    await render(tree(withIdentity(live(), 'C172'), storage));
    expect(await screen.findByTestId('pfd')).toBeTruthy();
  });

  it('uses the last choice for an unidentified aircraft with no engine type', async () => {
    const snapshot = withIdentity(live(), null);
    const { [D.engineType]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }));
    expect(screen.getByTestId('pfd')).toBeTruthy();
  });

  it('shows the altimeter controls under the instruments', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Set standard pressure')).toBeTruthy();
  });
});
