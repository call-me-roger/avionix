import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
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
  activate: jest.fn(async () => undefined),
};

function tree(snapshot: SessionSnapshot, now = NOW) {
  const storage = createMemorySettingsStorage();
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
    // The codebase's formatDistance rounds to a whole number at or above 10 nm (it is written for
    // the GPS distance-to-go, not the DME readout), so 12.4 nm reads "12 nm" here.
    expect(screen.getByText('IBOS · 12 nm · CRS 247°')).toBeTruthy();
    // NAV2 has no identifier, no DME and no course in this snapshot: no details line.
    expect(screen.queryByText(/CRS 090°/)).toBeNull();
  });

  it('hides DME distance while there is no DME signal', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.nav1HasDme]: 0 }) })));
    expect(screen.getByText('IBOS · CRS 247°')).toBeTruthy();
  });

  it('swaps with the radio’s own command', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Swap NAV1 active and standby'));
    expect(actions.activate).toHaveBeenCalledWith('nav1', C.nav1Flip);
  });

  it('says when X-Plane did not swap', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Swap COM1 active and standby'));
    const ok = { [C.com1Flip]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
    await view.rerender(tree(live({ operations: ok }), NOW + 4000));
    expect(screen.getByText('X-Plane did not swap COM1.')).toBeTruthy();
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

  it('marks values not live and disables every control while the link is down', async () => {
    await render(tree(live({ state: 'reconnecting' })));
    expect(screen.getByLabelText('COM1: active 121.500, standby 118.005, not live')).toBeTruthy();
    expect(
      screen.getByLabelText('Swap COM1 active and standby').props.accessibilityState,
    ).toMatchObject({ disabled: true });
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
});
