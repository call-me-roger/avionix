import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import {
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { AutopilotPanel } from '@/features/panels/autopilot/AutopilotPanel';
import { Fma } from '@/features/panels/autopilot/Fma';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { haptics } from '@/platform/haptics';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }));

// LightBar is hidden from accessibility (the button's own label already speaks its state).
const HIDDEN = { includeHiddenElements: true };

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

function telemetry(values: Record<string, number | number[] | string>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

const VALUES = {
  [D.autopilotServos]: 0,
  [D.autopilotOverride]: 0,
  [D.flightDirectorBars]: 0,
  [D.autothrottle]: 0,
  [D.headingStatus]: 2,
  [D.navStatus]: 1,
  [D.approachStatus]: 0,
  [D.glideslopeStatus]: 0,
  [D.altitudeStatus]: 2,
  [D.verticalSpeedStatus]: 0,
  [D.speedStatus]: 0,
  [D.rollStatus]: 0,
  [D.pitchStatus]: 0,
  [D.headingBug]: 270,
  [D.altitudeDial]: 5000,
  [D.verticalSpeedDial]: 0,
  [D.airspeedDial]: 120,
  [D.airspeedIsMach]: 0,
};

const ok = (name: string) => ({
  [name]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
});

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

function tree(
  snapshot: SessionSnapshot,
  now = NOW,
  storage: SettingsStorage = createMemorySettingsStorage(),
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PanelFrame title="Autopilot" snapshot={snapshot} now={now} actions={actions}>
          <AutopilotPanel />
        </PanelFrame>
      </UnitsProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  (actions.activate as jest.Mock).mockClear();
  (actions.write as jest.Mock).mockClear();
  (haptics.failure as jest.Mock).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const withValues = (values: Record<string, number>, overrides: Partial<SessionSnapshot> = {}) =>
  live({ telemetry: telemetry({ ...VALUES, ...values }), ...overrides });

describe('Autopilot panel', () => {
  it('reads the modes like an annunciator', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Autopilot modes: HDG · ALT · Armed NAV')).toBeTruthy();
  });

  it('marks each mode engaged, armed or off, in shape and in words', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('HDG mode, engaged')).toBeTruthy();
    // Scoped to the key: the FMA shows the same words.
    expect(within(screen.getByLabelText('HDG mode, engaged')).getByText('HDG')).toBeTruthy();
    expect(
      within(screen.getByLabelText('HDG mode, engaged')).getByTestId('light-bar-engaged', HIDDEN),
    ).toBeTruthy();
    expect(screen.getByLabelText('NAV mode, armed')).toBeTruthy();
    expect(within(screen.getByLabelText('NAV mode, armed')).getByText('NAV')).toBeTruthy();
    expect(
      within(screen.getByLabelText('NAV mode, armed')).getByTestId('light-bar-armed', HIDDEN),
    ).toBeTruthy();
    expect(screen.getByLabelText('APR mode, off')).toBeTruthy();
  });

  it('sends a mode’s own command', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('APR mode, off'));
    expect(actions.activate).toHaveBeenCalledWith('ap-mode-apr', C.modeApproach);
  });

  it('says when X-Plane did not engage a navigation mode, with where to look', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('APR mode, off'));
    await view.rerender(tree(live({ operations: ok(C.modeApproach) }), NOW + 4000));
    expect(
      screen.getByText('X-Plane did not engage APR. Check the navigation source.'),
    ).toBeTruthy();
  });

  it('disables a mode button while its own watch is still waiting, so a double tap cannot toggle twice', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('HDG mode, engaged'));
    expect(actions.activate).toHaveBeenCalledTimes(1);
    await view.rerender(tree(live({ operations: ok(C.modeHeading) })));
    expect(screen.getByLabelText('HDG mode, engaged').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('HDG mode, engaged'));
    expect(actions.activate).toHaveBeenCalledTimes(1);
    await view.rerender(
      tree(
        live({
          operations: ok(C.modeHeading),
          telemetry: telemetry({ ...VALUES, [D.headingStatus]: 0 }),
        }),
      ),
    );
    expect(screen.getByLabelText('HDG mode, off').props.accessibilityState.disabled).toBe(false);
  });

  it('says nothing when the mode changed', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('HDG mode, engaged'));
    await view.rerender(
      tree(
        live({
          operations: ok(C.modeHeading),
          telemetry: telemetry({ ...VALUES, [D.headingStatus]: 0 }),
        }),
        NOW + 4000,
      ),
    );
    expect(screen.queryByText(/did not/)).toBeNull();
  });

  it('engages the autopilot when off and disconnects it when engaged, by separate commands', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Engage autopilot'));
    expect(actions.activate).toHaveBeenLastCalledWith('autopilot-engage', C.autopilotEngage);
    await view.rerender(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.autopilotServos]: 1 }) })),
    );
    expect(within(screen.getByLabelText('Disconnect autopilot')).getByText('AP')).toBeTruthy();
    expect(
      within(screen.getByLabelText('Disconnect autopilot')).getByTestId(
        'light-bar-engaged',
        HIDDEN,
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Disconnect autopilot'));
    expect(actions.activate).toHaveBeenLastCalledWith('autopilot-engage', C.autopilotDisconnect);
  });

  it('disconnects with one tap, never a confirmation', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.autopilotServos]: 1 }) })));
    await fireEvent.press(screen.getByLabelText('Disconnect autopilot'));
    expect(actions.activate).toHaveBeenCalledTimes(1);
  });

  it('says when X-Plane did not disconnect, and what to do', async () => {
    const engaged = telemetry({ ...VALUES, [D.autopilotServos]: 1 });
    const view = await render(tree(live({ telemetry: engaged })));
    await fireEvent.press(screen.getByLabelText('Disconnect autopilot'));
    await view.rerender(
      tree(live({ telemetry: engaged, operations: ok(C.autopilotDisconnect) }), NOW + 4000),
    );
    expect(
      screen.getByText('X-Plane did not disconnect the autopilot. Disconnect it in X-Plane.'),
    ).toBeTruthy();
  });

  it('turns the flight director on and off with its own commands', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Turn flight director on'));
    expect(actions.activate).toHaveBeenLastCalledWith('flight-director', C.flightDirectorOn);
    await view.rerender(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.flightDirectorBars]: 1 }) })),
    );
    await fireEvent.press(screen.getByLabelText('Turn flight director off'));
    expect(actions.activate).toHaveBeenLastCalledWith('flight-director', C.flightDirectorOff);
  });

  it('arms, engages and disarms the autothrottle', async () => {
    // autothrottle_enabled 0: armed, not engaged.
    const view = await render(tree(live()));
    expect(screen.getByText('A/T ARM')).toBeTruthy();
    expect(
      within(screen.getByLabelText('Disarm autothrottle')).getByTestId('light-bar-engaged', HIDDEN),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Engage autothrottle'));
    expect(actions.activate).toHaveBeenLastCalledWith('autothrottle', C.autothrottleOn);
    await fireEvent.press(screen.getByLabelText('Disarm autothrottle'));
    expect(actions.activate).toHaveBeenLastCalledWith('autothrottle', C.autothrottleDisarm);
    await view.rerender(tree(live({ telemetry: telemetry({ ...VALUES, [D.autothrottle]: -1 }) })));
    await fireEvent.press(screen.getByLabelText('Arm autothrottle'));
    expect(actions.activate).toHaveBeenLastCalledWith('autothrottle', C.autothrottleArm);
  });

  it('suggests the aircraft may have no autothrottle when it does not engage', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Engage autothrottle'));
    await view.rerender(tree(live({ operations: ok(C.autothrottleOn) }), NOW + 4000));
    expect(
      screen.getByText('X-Plane did not engage the autothrottle. This aircraft may not have one.'),
    ).toBeTruthy();
  });

  it('disables every control and says why while another program flies the autopilot', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.autopilotOverride]: 1 }) })));
    expect(
      screen.getByText(
        "Another program is flying X-Plane's autopilot. These controls are off until it hands control back.",
      ),
    ).toBeTruthy();
    for (const label of ['Engage autopilot', 'Turn flight director on', 'HDG mode, engaged']) {
      expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    }
  });

  it('keeps the other modes working when APR is missing, and says why', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          features: snapshot.compatibility.features.map((feature) =>
            feature.id === 'ap-mode-apr'
              ? {
                  ...feature,
                  status: 'unavailable' as const,
                  missing: [
                    {
                      name: C.modeApproach,
                      kind: 'command' as const,
                      purpose: 'APR mode button',
                      status: 'missing' as const,
                    },
                  ],
                }
              : feature,
          ),
        },
      }),
    );
    expect(screen.getByLabelText('APR mode, off').props.accessibilityState.disabled).toBe(true);
    expect(
      screen.getByText('APR mode is not available on this aircraft: APR mode button.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('HDG mode, engaged').props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it('shows no modes and no engagement while no flight is loaded', async () => {
    await render(
      tree(
        live({
          health: { ...base.health, activity: 'noFlight', live: true, lastHeartbeatAt: NOW },
        }),
      ),
    );
    expect(screen.getByLabelText('Autopilot modes: No modes engaged')).toBeTruthy();
    expect(screen.getByLabelText('HDG mode, off')).toBeTruthy();
  });

  it('marks the annunciator not live when X-Plane stops sending', async () => {
    // Freshness is the session's activity, not the clock: a stalled simulator is not current.
    await render(
      tree(
        live({
          health: { ...base.health, activity: 'stalled', live: false, lastHeartbeatAt: NOW },
        }),
      ),
    );
    expect(screen.getByLabelText('Autopilot modes: HDG · ALT · Armed NAV, not live')).toBeTruthy();
  });

  it('boxes a newly engaged mode for ten seconds, never one already engaged', async () => {
    const view = await render(tree(live()));
    expect(screen.getByTestId('autopilot-fma')).toBeTruthy();
    expect(screen.queryByTestId('fma-box-lateral')).toBeNull();
    const nav = withValues({ [D.headingStatus]: 0, [D.navStatus]: 2 });
    await view.rerender(tree(nav, NOW + 1000));
    expect(screen.getByTestId('fma-box-lateral')).toBeTruthy();
    expect(screen.queryByTestId('fma-box-vertical')).toBeNull();
    await view.rerender(tree(nav, NOW + 11_000));
    expect(screen.queryByTestId('fma-box-lateral')).toBeNull();
  });

  it('does not box a new vertical speed target for the same mode', async () => {
    const vs = { [D.altitudeStatus]: 0, [D.verticalSpeedStatus]: 2 };
    const view = await render(tree(withValues({ ...vs, [D.verticalSpeedDial]: 500 })));
    expect(screen.getByText('VS 500FPM')).toBeTruthy();
    await view.rerender(tree(withValues({ ...vs, [D.verticalSpeedDial]: 600 }), NOW + 1000));
    expect(screen.getByText('VS 600FPM')).toBeTruthy();
    expect(screen.queryByTestId('fma-box-vertical')).toBeNull();
  });

  it('annunciates an autopilot disconnect with a flashing amber AP and one buzz, until tapped', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    const view = await render(tree(withValues({ [D.autopilotServos]: 1 })));
    expect(screen.queryByTestId('fma-ap-disconnect')).toBeNull();
    await view.rerender(tree(withValues({ [D.autopilotServos]: 0 }), NOW + 1000));
    expect(screen.getByTestId('fma-ap-disconnect')).toBeTruthy();
    expect(loop).toHaveBeenCalled();
    const fma = screen.getByTestId('autopilot-fma');
    expect(fma.props.accessibilityLabel).toMatch(/, autopilot disconnected$/);
    expect(fma.props.accessibilityHint).toBe('Tap to acknowledge');
    expect(haptics.failure).toHaveBeenCalledTimes(1);
    await fireEvent.press(fma);
    expect(screen.queryByTestId('fma-ap-disconnect')).toBeNull();
    expect(screen.getByTestId('autopilot-fma').props.accessibilityLabel).toBe(
      'Autopilot modes: HDG · ALT · Armed NAV',
    );
    expect(haptics.failure).toHaveBeenCalledTimes(1);
  });

  it('ends the disconnect annunciation after five seconds even if never acknowledged', async () => {
    const view = await render(tree(withValues({ [D.autopilotServos]: 1 })));
    const off = withValues({ [D.autopilotServos]: 0 });
    await view.rerender(tree(off, NOW + 1000));
    await view.rerender(tree(off, NOW + 5999));
    expect(screen.getByTestId('fma-ap-disconnect')).toBeTruthy();
    await view.rerender(tree(off, NOW + 6000));
    expect(screen.queryByTestId('fma-ap-disconnect')).toBeNull();
  });

  it('does not annunciate a disconnect seen across a gap in live values', async () => {
    const stalled = {
      ...base.health,
      activity: 'stalled' as const,
      live: false,
      lastHeartbeatAt: NOW,
    };
    const view = await render(tree(withValues({ [D.autopilotServos]: 1 })));
    await view.rerender(
      tree(withValues({ [D.autopilotServos]: 1 }, { health: stalled }), NOW + 1000),
    );
    await view.rerender(tree(withValues({ [D.autopilotServos]: 0 }), NOW + 2000));
    expect(screen.queryByTestId('fma-ap-disconnect')).toBeNull();
    expect(haptics.failure).not.toHaveBeenCalled();
  });

  it('holds the disconnect annunciation steady under reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const loop = jest.spyOn(Animated, 'loop');
    const view = await render(tree(withValues({ [D.autopilotServos]: 1 })));
    await view.rerender(tree(withValues({ [D.autopilotServos]: 0 }), NOW + 1000));
    const ap = screen.getByTestId('fma-ap-disconnect');
    expect(StyleSheet.flatten(ap.props.style).opacity).toBe(1);
    expect(loop).not.toHaveBeenCalled();
  });

  it('leaves "not live" to the PFD when compact, keeping it in the label', async () => {
    const storage = createMemorySettingsStorage();
    const stalled = live({
      health: { ...base.health, activity: 'stalled', live: false, lastHeartbeatAt: NOW },
    });
    await render(
      <ThemeProvider storage={storage} systemSchemeOverride="light">
        <PanelFrame title="PFD" snapshot={stalled} now={NOW} actions={actions}>
          <Fma compact />
        </PanelFrame>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('autopilot-fma').props.accessibilityLabel).toBe(
      'Autopilot modes: HDG · ALT · Armed NAV, not live',
    );
    expect(screen.queryByText('not live')).toBeNull();
  });
});
