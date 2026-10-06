import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { UNITS_STORAGE_KEY } from '@/application/unit-preferences';
import {
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { RadiosPanel } from '@/features/panels/radios/RadiosPanel';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';
import { lightTheme } from '@/theme/tokens';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

function telemetry(values: Record<string, number | number[] | string>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

const VALUES = {
  [D.com1Active]: 121_500,
  [D.com1Standby]: 118_005,
  [D.com2Active]: 118_000,
  [D.com2Standby]: 124_850,
  [D.nav1Active]: 11_030,
  [D.nav1Standby]: 10_850,
  [D.nav2Active]: 11_390,
  [D.nav2Standby]: 11_720,
  [D.nav1Id]: 'SUJPUwAAAAA=',
  [D.nav1HasDme]: 1,
  [D.nav1Dme]: 12.4,
  [D.nav1Course]: 247,
  [D.transponderCode]: 7000,
  [D.transponderMode]: 3,
};

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

const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

function tree(
  snapshot: SessionSnapshot,
  now = NOW,
  storage: SettingsStorage = createMemorySettingsStorage(),
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PanelFrame title="Radios" snapshot={snapshot} now={now} actions={actions}>
          <RadiosPanel />
        </PanelFrame>
      </UnitsProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  (actions.activate as jest.Mock).mockClear();
});

describe('Radios panel', () => {
  it('shows each radio’s active and standby as X-Plane reports them', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('COM1: active 121.500, standby 118.005')).toBeTruthy();
    expect(screen.getByLabelText('COM2: active 118.000, standby 124.850')).toBeTruthy();
    expect(screen.getByLabelText('NAV1: active 110.30, standby 108.50')).toBeTruthy();
    expect(screen.getByLabelText('NAV2: active 113.90, standby 117.20')).toBeTruthy();
  });

  it('shows the NAV identifier, DME and course only when present', async () => {
    await render(tree(live()));
    expect(screen.getByText('IBOS · 12.4 nm · CRS 247°')).toBeTruthy();
    // NAV2 has no identifier, no DME and no course in this snapshot: no details line.
    expect(screen.queryByText(/CRS 090°/)).toBeNull();
  });

  it('hides DME distance while there is no DME signal', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.nav1HasDme]: 0 }) })));
    expect(screen.getByText('IBOS · CRS 247°')).toBeTruthy();
  });

  it('shows DME in kilometres, to one decimal, when that is the distance unit', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(UNITS_STORAGE_KEY, JSON.stringify({ distance: 'km' }));
    await render(tree(live(), NOW, storage));
    expect(await screen.findByText('IBOS · 23.0 km · CRS 247°')).toBeTruthy();
  });

  it('swaps with the radio’s own command', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Swap NAV1 active and standby'));
    expect(actions.activate).toHaveBeenCalledWith('nav1', C.nav1Flip);
  });

  it('says when X-Plane did not swap, in the avionics warning colour', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Swap COM1 active and standby'));
    const ok = { [C.com1Flip]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
    await view.rerender(tree(live({ operations: ok }), NOW + 4000));
    expect(screen.getByText('X-Plane did not swap COM1.')).toHaveStyle({
      color: lightTheme.avionics.warning,
    });
  });

  it('keeps the other radios working when NAV2 is missing, and says why once', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          features: snapshot.compatibility.features.map((feature) =>
            feature.id === 'nav2'
              ? {
                  ...feature,
                  status: 'unavailable' as const,
                  missing: [
                    {
                      name: D.nav2Standby,
                      kind: 'dataref' as const,
                      purpose: 'NAV2 standby frequency, written when you set one',
                      status: 'missing' as const,
                    },
                  ],
                }
              : feature,
          ),
        },
      }),
    );
    expect(
      screen.getAllByText(
        'NAV2 is not available on this aircraft: NAV2 standby frequency, written when you set one.',
      ),
    ).toHaveLength(1);
    expect(
      screen.getByLabelText('Swap NAV2 active and standby').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getByLabelText('Swap NAV1 active and standby').props.accessibilityState,
    ).toMatchObject({ disabled: false });
    expect(screen.getByLabelText('Enter COM1 standby').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('dims the standby display window when its radio’s feature is unavailable', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          features: snapshot.compatibility.features.map((feature) =>
            feature.id === 'nav2'
              ? {
                  ...feature,
                  status: 'unavailable' as const,
                  missing: [
                    {
                      name: D.nav2Standby,
                      kind: 'dataref' as const,
                      purpose: 'NAV2 standby frequency, written when you set one',
                      status: 'missing' as const,
                    },
                  ],
                }
              : feature,
          ),
        },
      }),
    );
    const standby = screen.getByLabelText('Enter NAV2 standby');
    expect(standby.props.accessibilityState.disabled).toBe(true);
    const value = within(standby).getByText('117.20');
    expect(StyleSheet.flatten(value.props.style).color).toBe(lightTheme.avionics.legendDim);
  });

  it('marks values not live and disables every control while the link is down', async () => {
    await render(tree(live({ state: 'reconnecting' })));
    expect(screen.getByLabelText('COM1: active 121.500, standby 118.005, not live')).toBeTruthy();
    expect(
      screen.getByLabelText('Swap COM1 active and standby').props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('dims the ident, DME and course line once the values are not current', async () => {
    const view = await render(tree(live()));
    expect(screen.getByText('IBOS · 12.4 nm · CRS 247°')).toHaveStyle({
      color: lightTheme.avionics.selected,
    });
    await view.rerender(tree(live({ state: 'reconnecting' })));
    expect(screen.getByText('IBOS · 12.4 nm · CRS 247°')).toHaveStyle({
      color: lightTheme.avionics.legendDim,
    });
  });

  it('shows no values with no flight loaded', async () => {
    const snapshot = live();
    await render(tree({ ...snapshot, health: { ...snapshot.health, activity: 'noFlight' } }));
    expect(screen.getByLabelText('COM1: active —, standby —')).toBeTruthy();
  });

  it('shows a dash for a value that is not a number', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.com1Active]: 'AAAA' }) })));
    expect(screen.getByLabelText('COM1: active —, standby 118.005')).toBeTruthy();
  });

  it('shows a dash for a frequency that is zero or negative (I3)', async () => {
    const first = await render(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.com1Active]: 0 }) })),
    );
    expect(screen.getByLabelText('COM1: active —, standby 118.005')).toBeTruthy();
    await first.unmount();
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.nav1Standby]: -1 }) })));
    expect(screen.getByLabelText('NAV1: active 110.30, standby —')).toBeTruthy();
  });

  it('puts the entry beside the stack on a wide screen, and under it on a narrow one', async () => {
    const original = Dimensions.get('window');
    Dimensions.set({ window: { width: 1024, height: 768, scale: 1, fontScale: 1 } });
    try {
      await render(tree(live()));
      await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
      expect(
        StyleSheet.flatten(screen.getByTestId('radios-columns').props.style).flexDirection,
      ).toBe('row');

      await act(async () => {
        Dimensions.set({ window: { width: 390, height: 844, scale: 1, fontScale: 1 } });
      });
      expect(
        StyleSheet.flatten(screen.getByTestId('radios-columns').props.style).flexDirection,
      ).toBe('column');
    } finally {
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
  });

  it('on a narrow screen, opens the entry under the row being edited (I1)', async () => {
    const original = Dimensions.get('window');
    await act(async () => {
      Dimensions.set({ window: { width: 390, height: 844, scale: 1, fontScale: 1 } });
    });
    try {
      await render(tree(live()));
      await fireEvent.press(screen.getByLabelText('Enter COM2 standby'));
      expect(
        within(screen.getByTestId('radio-row-com2')).getByLabelText('Set COM2 standby'),
      ).toBeTruthy();
      expect(
        within(screen.getByTestId('radio-row-com1')).queryByLabelText('Set COM2 standby'),
      ).toBeNull();

      await fireEvent.press(screen.getByLabelText('Enter squawk code'));
      expect(
        within(screen.getByTestId('transponder-section')).getByLabelText('Set Squawk code'),
      ).toBeTruthy();
      expect(
        within(screen.getByTestId('radio-row-com2')).queryByLabelText('Set Squawk code'),
      ).toBeNull();
    } finally {
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
  });

  it('on a wide screen, keeps the entry in the right column, not inside a row (I1)', async () => {
    const original = Dimensions.get('window');
    Dimensions.set({ window: { width: 1024, height: 768, scale: 1, fontScale: 1 } });
    try {
      await render(tree(live()));
      await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
      expect(
        within(screen.getByTestId('radio-row-com1')).queryByLabelText('Set COM1 standby'),
      ).toBeNull();
      expect(screen.getByLabelText('Set COM1 standby')).toBeTruthy();
    } finally {
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
  });

  describe('as an avionics hardware unit', () => {
    it('engraves the radio label at the top of its unit', async () => {
      await render(tree(live()));
      expect(screen.getByText('COM1')).toBeTruthy();
      expect(screen.getByText('NAV1')).toBeTruthy();
    });

    it('shows the active value in a display window, in the engaged colour', async () => {
      await render(tree(live()));
      const activeWindow = screen.getByTestId('radio-active-com1');
      expect(within(activeWindow).getByText('121.500')).toHaveStyle({
        color: lightTheme.avionics.engaged,
      });
    });

    it('draws the standby window, with its tuning frame, inside the standby button', async () => {
      await render(tree(live()));
      const standbyButton = screen.getByLabelText('Enter COM1 standby');
      expect(within(standbyButton).getByTestId('display-window-tuning')).toBeTruthy();
      expect(within(standbyButton).getByText('118.005')).toBeTruthy();
    });

    it('colours the ident, DME and course line with the selected colour', async () => {
      await render(tree(live()));
      expect(screen.getByText('IBOS · 12.4 nm · CRS 247°')).toHaveStyle({
        color: lightTheme.avionics.selected,
      });
    });
  });
});
