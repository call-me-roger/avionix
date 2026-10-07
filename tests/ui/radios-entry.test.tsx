import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
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
  (actions.write as jest.Mock).mockClear();
  (actions.activate as jest.Mock).mockClear();
});

describe('Radios keypad entry', () => {
  it('stages an entry without writing, and shows it apart from X-Plane’s value', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['1', '3', '2', '0', '0', '5']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    expect(actions.write).not.toHaveBeenCalled();
    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByText('132.005')).toHaveStyle({ color: lightTheme.avionics.selected });
    expect(screen.getByLabelText('COM1: active 121.500, standby 118.005')).toBeTruthy();
  });

  it('draws the keypad in avionics colours inside the radio unit on a phone', async () => {
    // Narrow (the default test window): the pad sits inside COM1's unit, on the bezel.
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    expect(screen.getByText('COM1 standby')).toHaveStyle({ color: lightTheme.avionics.legend });
    expect(screen.getByText('Cancel')).toHaveStyle({ color: lightTheme.avionics.selected });
  });

  it('keeps app colours on the keypad beside the units in a wide layout', async () => {
    // Wide: the pad is its own column beside the units, on the app background.
    const original = Dimensions.get('window');
    Dimensions.set({ window: { width: 1024, height: 768, scale: 1, fontScale: 1 } });
    try {
      await render(tree(live()));
      await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
      expect(screen.getByText('COM1 standby')).toHaveStyle({ color: lightTheme.colors.text });
      expect(screen.getByText('Cancel')).toHaveStyle({ color: lightTheme.colors.accent });
    } finally {
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
  });

  it('always reads as typed, never jumping to the padded value (I2)', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['1', '2', '1', '5']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    expect(screen.getByText('121.5__')).toBeTruthy();
    expect(screen.getByText('Sets 121.500')).toBeTruthy();
    expect(screen.getByLabelText('COM1 standby, new value 121.5')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('0'));
    expect(screen.getByText('121.50_')).toBeTruthy();
    expect(screen.getByText('Sets 121.500')).toBeTruthy();
  });

  it('labels an empty draft as nothing typed yet, never a lone point (I2)', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    expect(screen.getByLabelText('COM1 standby, nothing typed yet')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('1'));
    expect(screen.getByLabelText('COM1 standby, new value 1')).toBeTruthy();
  });

  it('omits the "is still" clause when X-Plane reports a non-positive value (I3)', async () => {
    const view = await render(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.com1Standby]: 0 }) })),
    );
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['1', '2', '2', '8', '0', '0']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
    const ok = {
      [D.com1Standby]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
    };
    await view.rerender(
      tree(
        live({
          telemetry: telemetry({ ...VALUES, [D.com1Standby]: 0 }),
          operations: ok,
        }),
        NOW + 4000,
      ),
    );
    expect(screen.getByText('X-Plane did not take 122.800.')).toBeTruthy();
  });

  it('sends the staged channel with Set', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['1', '2', '2', '8']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
    expect(actions.write).toHaveBeenCalledWith('com1', D.com1Standby, 122_800);
  });

  it('rejects 118.020 with the nearest channels and keeps Set disabled', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['1', '1', '8', '0', '2', '0']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    expect(
      screen.getByText('118.020 is not a COM channel. Nearest: 118.015 or 118.025.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Set COM1 standby').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
    expect(actions.write).not.toHaveBeenCalled();
  });

  it('shows no rejection while a valid channel could still be typed (M3)', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    // 118.025 is a valid channel; at five digits ("11802") it still parses as the invalid 118.020,
    // but one more digit (5) could still complete it, so no message shows yet.
    for (const key of ['1', '1', '8', '0', '2']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    expect(screen.queryByText(/is not a COM channel/)).toBeNull();
    expect(screen.getByLabelText('Set COM1 standby').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByLabelText('5'));
    expect(screen.getByText('118.025')).toBeTruthy();
    expect(screen.getByLabelText('Set COM1 standby').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('shows the band message immediately, before the draft is full length', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['2', '0', '0']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    expect(screen.getByText('COM channels run from 118.000 to 136.990.')).toBeTruthy();
  });

  it('enters NAV frequencies with two decimals', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter NAV1 standby'));
    for (const key of ['1', '1', '3', '9']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set NAV1 standby'));
    expect(actions.write).toHaveBeenCalledWith('nav1', D.nav1Standby, 11_390);
  });

  it('deletes, clears and cancels', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM2 standby'));
    await fireEvent.press(screen.getByLabelText('1'));
    await fireEvent.press(screen.getByLabelText('2'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(screen.getByText('1__.___')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Clear'));
    expect(screen.getByText('___.___')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel entry'));
    expect(screen.queryByLabelText('Set COM2 standby')).toBeNull();
  });

  it('switching target starts a fresh draft', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    await fireEvent.press(screen.getByLabelText('1'));
    await fireEvent.press(screen.getByLabelText('Enter NAV2 standby'));
    expect(screen.getByText('___.__')).toBeTruthy();
    expect(screen.getByText('NAV2 standby')).toBeTruthy();
  });

  it('closes after X-Plane accepts the write, and keeps the draft after a failure', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['1', '2', '2', '8']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
    const failed = {
      [D.com1Standby]: {
        status: 'failed' as const,
        failure: null,
        refusal: 'notConnected' as const,
        at: NOW,
      },
    };
    await view.rerender(tree(live({ operations: failed })));
    expect(screen.getByText('122.8__')).toBeTruthy();
    expect(screen.getByText('Sets 122.800')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
    const ok = {
      [D.com1Standby]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
    };
    await view.rerender(tree(live({ operations: ok })));
    expect(screen.queryByLabelText('Set COM1 standby')).toBeNull();
  });

  it('disables Set while the write is pending, so a double tap writes once', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['1', '2', '2', '8']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
    const pending = {
      [D.com1Standby]: { status: 'pending' as const, failure: null, refusal: null, at: NOW },
    };
    await view.rerender(tree(live({ operations: pending })));
    await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
    expect(actions.write).toHaveBeenCalledTimes(1);
  });

  it('drops the draft when the link goes down, and does not bring it back', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    await fireEvent.press(screen.getByLabelText('1'));
    await view.rerender(tree(live({ state: 'reconnecting' })));
    expect(screen.queryByLabelText('Set COM1 standby')).toBeNull();
    await view.rerender(tree(live()));
    expect(screen.queryByLabelText('Set COM1 standby')).toBeNull();
    expect(actions.write).not.toHaveBeenCalled();
  });

  it('drops the draft when the aircraft changes', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    await fireEvent.press(screen.getByLabelText('1'));
    const snapshot = live();
    await view.rerender(
      tree({
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          identity: { ...snapshot.compatibility.identity, icaoType: 'B738' },
        },
      }),
    );
    expect(screen.queryByLabelText('Set COM1 standby')).toBeNull();
  });

  it('says when X-Plane did not take the channel, with the 25 kHz hint for an 8.33-only channel', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const key of ['1', '3', '2', '0', '0', '5']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set COM1 standby'));
    const ok = {
      [D.com1Standby]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
    };
    await view.rerender(tree(live({ operations: ok }), NOW + 4000));
    expect(
      screen.getByText(
        'X-Plane did not take 132.005. COM1 standby is still 118.005. This aircraft’s radio may tune 25 kHz channels only.',
      ),
    ).toBeTruthy();
  });

  it('keeps every keypad key at least 56 dp tall', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    for (const label of ['1', '0', 'Delete', 'Clear']) {
      const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(56);
    }
  });
});
