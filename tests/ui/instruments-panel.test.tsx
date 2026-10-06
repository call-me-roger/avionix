import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import {
  FEATURE_ALTIMETER_SETTING,
  FEATURE_FLIGHT_INSTRUMENTS,
  FEATURE_NAV_AIDS,
  FEATURE_NAV_DEVIATION,
  FEATURE_NAV_GLIDESLOPE,
  FEATURE_NAV_SOURCE,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { AUTOPILOT_PANEL } from '@/features/panels/autopilot/autopilot';
import { InstrumentPreferencesProvider } from '@/features/panels/instruments/InstrumentPreferencesProvider';
import {
  INSTRUMENTS_PANEL,
  InstrumentsPanel,
} from '@/features/panels/instruments/InstrumentsPanel';
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

function withMissing(snapshot: SessionSnapshot, ...names: string[]): SessionSnapshot {
  const bindings = { ...snapshot.compatibility.bindings };
  for (const name of names) {
    bindings[name] = { name, kind: 'dataref', status: 'missing' };
  }
  return { ...snapshot, compatibility: { ...snapshot.compatibility, bindings } };
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
  it('asks for the instruments, the altimeter setting, every autopilot feature and the PFD nav cues', () => {
    // tests/integration/flight-instruments.test.ts streams this same set from the mock X-Plane.
    expect([...INSTRUMENTS_PANEL.features].sort()).toEqual(
      [
        FEATURE_FLIGHT_INSTRUMENTS,
        FEATURE_ALTIMETER_SETTING,
        ...AUTOPILOT_PANEL.features,
        FEATURE_NAV_DEVIATION,
        FEATURE_NAV_GLIDESLOPE,
        FEATURE_NAV_AIDS,
        FEATURE_NAV_SOURCE,
      ].sort(),
    );
    expect(INSTRUMENTS_PANEL.features).toHaveLength(19);
  });

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

  it('makes room for the FMA in the PFD height budget on a landscape phone', async () => {
    const jet = withIdentity(live(), 'B738');
    const flying = {
      ...jet,
      telemetry: { ...jet.telemetry, ...telemetry({ [D.engineType]: [7, 7] }) },
    };
    const noAutopilot = withMissing(
      flying,
      D.autopilotServos,
      D.flightDirectorBars,
      D.autothrottle,
      D.headingBug,
      D.altitudeDial,
      D.verticalSpeedDial,
      D.airspeedDial,
      D.headingStatus,
      D.navStatus,
      D.approachStatus,
      D.altitudeStatus,
      D.verticalSpeedStatus,
      D.speedStatus,
    );
    const pfdWidthNow = () =>
      Number(StyleSheet.flatten(screen.getByTestId('pfd').props.style).width);
    const original = Dimensions.get('window');
    Dimensions.set({ window: { width: 800, height: 360, scale: 1, fontScale: 1 } });
    try {
      const view = await render(tree(noAutopilot));
      expect(screen.queryByTestId('autopilot-fma')).toBeNull();
      const without = pfdWidthNow();
      await view.rerender(tree(flying));
      expect(screen.getByTestId('autopilot-fma')).toBeTruthy();
      const withFma = pfdWidthNow();
      // 360 × 0.7 = 252 tall without the FMA (302.4 wide); 252 − 48 = 204 with it (244.8 wide).
      expect(without).toBeCloseTo(302.4);
      expect(withFma).toBeCloseTo(244.8);
      expect(withFma).toBeLessThan(without);
    } finally {
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
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
    // A piston twin with no choice of its own still gets its engine default…
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
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      'avionix.instruments',
      JSON.stringify({ last: 'sixPack', byAircraft: {} }),
    );
    const snapshot = withIdentity(live(), null);
    const { [D.engineType]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }, storage));
    expect(await screen.findByTestId('six-pack')).toBeTruthy();
  });

  it('follows an engine-type change for an aircraft with no stored choice, without a restart', async () => {
    const snapshot = withIdentity(live(), 'C172');
    const storage = createMemorySettingsStorage();
    const view = await render(tree(snapshot, storage));
    expect(screen.getByTestId('six-pack')).toBeTruthy();
    await view.rerender(
      tree(
        {
          ...snapshot,
          telemetry: { ...snapshot.telemetry, ...telemetry({ [D.engineType]: [7, 7] }) },
        },
        storage,
      ),
    );
    expect(screen.getByTestId('pfd')).toBeTruthy();
  });

  it('keeps every stored choice when one is made before they load', async () => {
    const memory = createMemorySettingsStorage();
    await memory.setItem(
      'avionix.instruments',
      JSON.stringify({ last: 'sixPack', byAircraft: { B738: 'sixPack' } }),
    );
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const storage: SettingsStorage = {
      // Read when asked, answered only on release: the early choice's save cannot leak into it.
      getItem: async (key) => {
        const value = await memory.getItem(key);
        if (key === 'avionix.instruments') {
          await held;
        }
        return value;
      },
      setItem: (key, value) => memory.setItem(key, value),
    };
    const view = await render(tree(withIdentity(live(), 'C172'), storage));
    await fireEvent.press(screen.getByLabelText('Primary flight display'));
    expect(screen.getByTestId('pfd')).toBeTruthy();

    release();
    const merged = { last: 'pfd', byAircraft: { B738: 'sixPack', C172: 'pfd' } };
    await waitFor(async () =>
      expect(JSON.parse((await memory.getItem('avionix.instruments')) ?? '{}')).toEqual(merged),
    );
    // In state too: the early choice holds, and the jet keeps its stored six-pack.
    expect(screen.getByTestId('pfd')).toBeTruthy();
    const jet = withIdentity(live(), 'B738');
    await view.rerender(
      tree(
        { ...jet, telemetry: { ...jet.telemetry, ...telemetry({ [D.engineType]: [7, 7] }) } },
        storage,
      ),
    );
    expect(screen.getByTestId('six-pack')).toBeTruthy();
  });

  it('shows the altimeter controls under the instruments', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Set standard pressure')).toBeTruthy();
  });
});
