import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import {
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { AutopilotPanel } from '@/features/panels/autopilot/AutopilotPanel';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
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
});

const type = async (keys: string) => {
  for (const key of keys) {
    await fireEvent.press(screen.getByLabelText(key));
  }
};

describe('autopilot selectors', () => {
  it('shows each selector as X-Plane reports it', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Heading selector: 270°')).toBeTruthy();
    expect(screen.getByLabelText('Altitude selector: 5,000 ft')).toBeTruthy();
    expect(screen.getByLabelText('Vertical speed selector: 0 fpm')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed selector: 120 kt')).toBeTruthy();
  });

  it('shows the selector value in a cyan display window, captioned by the selector', async () => {
    await render(tree(live()));
    const enter = screen.getByLabelText('Enter heading');
    expect(within(enter).getByText('HDG')).toBeTruthy();
    const value = within(enter).getByText('270°');
    const style = StyleSheet.flatten(value.props.style);
    expect(style.color).toBe(lightTheme.avionics.selected);
  });

  it('captions airspeed IAS in knots and MACH in Mach', async () => {
    const view = await render(tree(live()));
    expect(within(screen.getByLabelText('Enter airspeed')).getByText('IAS')).toBeTruthy();
    const mach = telemetry({ ...VALUES, [D.airspeedIsMach]: 1, [D.airspeedDial]: 0.78 });
    await view.rerender(tree(live({ telemetry: mach })));
    expect(within(screen.getByLabelText('Enter airspeed')).getByText('MACH')).toBeTruthy();
  });

  it('shows the unit-switch key as IAS⇄M, keeping its spoken label', async () => {
    await render(tree(live()));
    expect(within(screen.getByLabelText('Use Mach')).getByText('IAS⇄M')).toBeTruthy();
  });

  it('sends one write per stepper press', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Altitude plus 100 feet'));
    expect(actions.write).toHaveBeenCalledTimes(1);
    expect(actions.write).toHaveBeenCalledWith('altitude-select', D.altitudeDial, 5100);
  });

  it('adds up quick taps on top of the value it last sent', async () => {
    await render(tree(live()));
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.press(screen.getByLabelText('Altitude plus 100 feet'));
    }
    expect((actions.write as jest.Mock).mock.calls.map((call) => call[2])).toEqual([
      5100, 5200, 5300,
    ]);
  });

  it('wraps the heading', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.headingBug]: 355 }) })));
    await fireEvent.press(screen.getByLabelText('Heading plus 10 degrees'));
    expect(actions.write).toHaveBeenCalledWith('heading-control', D.headingBug, 5);
  });

  it('disables a stepper that would pass a limit, and all of them with no value', async () => {
    const view = await render(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.altitudeDial]: 50000 }) })),
    );
    expect(screen.getByLabelText('Altitude plus 100 feet').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByLabelText('Altitude minus 100 feet').props.accessibilityState.disabled).toBe(
      false,
    );
    const { [D.altitudeDial]: _omitted, ...rest } = VALUES;
    await view.rerender(tree(live({ telemetry: telemetry(rest) })));
    expect(screen.getByLabelText('Altitude selector: —')).toBeTruthy();
    expect(screen.getByLabelText('Altitude minus 100 feet').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('says when X-Plane did not take a selector value', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Altitude plus 100 feet'));
    await view.rerender(tree(live({ operations: ok(D.altitudeDial) }), NOW + 4000));
    expect(
      screen.getByText(
        'X-Plane did not take altitude 5,100 ft. The selector still shows 5,000 ft.',
      ),
    ).toBeTruthy();
  });

  it('writes a typed altitude only on Set, and shows it only in the New box', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    await type('12000');
    expect(actions.write).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Altitude selector: 5,000 ft')).toBeTruthy();
    expect(screen.getByText('Sets 12,000 ft')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Set altitude'));
    expect(actions.write).toHaveBeenCalledWith('altitude-select', D.altitudeDial, 12000);
  });

  it('explains an out-of-range altitude and keeps Set disabled', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    await type('60000');
    expect(screen.getByText('Altitude runs from 0 to 50,000 ft.')).toBeTruthy();
    expect(screen.getByLabelText('Set altitude').props.accessibilityState.disabled).toBe(true);
  });

  it('types a descent with the sign key', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter vertical speed'));
    await type('1500');
    await fireEvent.press(screen.getByLabelText('Change sign'));
    await fireEvent.press(screen.getByLabelText('Set vertical speed'));
    expect(actions.write).toHaveBeenCalledWith('vertical-speed-select', D.verticalSpeedDial, -1500);
  });

  it('offers no sign key outside vertical speed', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    expect(screen.queryByLabelText('Change sign')).toBeNull();
  });

  it('sends a typed 360 as 0', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter heading'));
    await type('360');
    await fireEvent.press(screen.getByLabelText('Set heading'));
    expect(actions.write).toHaveBeenCalledWith('heading-control', D.headingBug, 0);
  });

  it('shows and types Mach when X-Plane’s selector is in Mach', async () => {
    const mach = telemetry({ ...VALUES, [D.airspeedIsMach]: 1, [D.airspeedDial]: 0.78 });
    await render(tree(live({ telemetry: mach })));
    expect(screen.getByLabelText('Airspeed selector: M .78')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Airspeed plus .01 Mach'));
    expect(actions.write).toHaveBeenLastCalledWith('airspeed-select', D.airspeedDial, 0.79);
    await fireEvent.press(screen.getByLabelText('Enter airspeed'));
    await type('82');
    await fireEvent.press(screen.getByLabelText('Set airspeed'));
    expect(actions.write).toHaveBeenLastCalledWith('airspeed-select', D.airspeedDial, 0.82);
  });

  it('switches between knots and Mach with X-Plane’s own command', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Use Mach'));
    expect(actions.activate).toHaveBeenCalledWith('airspeed-select', C.knotsMachToggle);
  });

  it('bases an airspeed step on X-Plane’s current value, not a pending write in the other unit', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Airspeed plus 10 knots'));
    expect(actions.write).toHaveBeenLastCalledWith('airspeed-select', D.airspeedDial, 130);
    const mach = telemetry({ ...VALUES, [D.airspeedIsMach]: 1, [D.airspeedDial]: 0.42 });
    await view.rerender(tree(live({ telemetry: mach })));
    await fireEvent.press(screen.getByLabelText('Airspeed minus .01 Mach'));
    expect(actions.write).toHaveBeenLastCalledWith('airspeed-select', D.airspeedDial, 0.41);
    await view.rerender(
      tree(live({ telemetry: mach, operations: ok(D.airspeedDial) }), NOW + 4000),
    );
    expect(screen.queryByText(/did not take airspeed 130 kt/)).toBeNull();
  });

  it('disables Use Mach while its own watch is still waiting, so a double tap cannot toggle twice', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Use Mach'));
    expect(actions.activate).toHaveBeenCalledTimes(1);
    await view.rerender(tree(live({ operations: ok(C.knotsMachToggle) })));
    expect(screen.getByLabelText('Use Mach').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Use Mach'));
    expect(actions.activate).toHaveBeenCalledTimes(1);
    const mach = telemetry({ ...VALUES, [D.airspeedIsMach]: 1 });
    await view.rerender(tree(live({ telemetry: mach, operations: ok(C.knotsMachToggle) })));
    expect(screen.getByLabelText('Use knots').props.accessibilityState.disabled).toBe(false);
  });

  it('hides the knots/Mach button when the aircraft lacks the command', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          bindings: {
            ...snapshot.compatibility.bindings,
            [C.knotsMachToggle]: { name: C.knotsMachToggle, kind: 'command', status: 'missing' },
          },
        },
      }),
    );
    expect(screen.queryByLabelText('Use Mach')).toBeNull();
  });

  it('drops an airspeed draft when the unit flips', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter airspeed'));
    await type('25');
    const mach = telemetry({ ...VALUES, [D.airspeedIsMach]: 1, [D.airspeedDial]: 0.4 });
    await view.rerender(tree(live({ telemetry: mach })));
    expect(screen.queryByLabelText('Set airspeed')).toBeNull();
  });

  it('drops the draft when the link drops, and sends nothing', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    await type('8000');
    await view.rerender(tree(live({ state: 'disconnected' })));
    expect(screen.queryByLabelText('Set altitude')).toBeNull();
    await view.rerender(tree(live()));
    expect(screen.queryByLabelText('Set altitude')).toBeNull();
    expect(actions.write).not.toHaveBeenCalled();
  });

  it('override disables the keypad’s Set and every stepper', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    await type('8000');
    await view.rerender(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.autopilotOverride]: 1 }) })),
    );
    expect(screen.getByLabelText('Set altitude').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Altitude plus 100 feet').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('opens the keypad under the selector being edited on a phone', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter altitude'));
    const row = screen.getByTestId('selector-row-altitude');
    expect(within(row).getByLabelText('Set altitude')).toBeTruthy();
  });

  it('mutes the value and disables it while X-Plane is not live', async () => {
    await render(
      tree(
        live({
          health: { ...base.health, activity: 'stalled', live: false, lastHeartbeatAt: NOW },
        }),
      ),
    );
    expect(screen.getByLabelText('Altitude selector: 5,000 ft, not live')).toBeTruthy();
    const button = screen.getByLabelText('Enter altitude');
    expect(button.props.accessibilityState.disabled).toBe(true);
    const label = within(button).getByText('5,000 ft');
    const style = StyleSheet.flatten(label.props.style);
    expect(style.color).toBe(lightTheme.avionics.legendDim);
  });
});
