import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import {
  type OperationOutcome,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  FEATURE_HEADING_CONTROL,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { explainFailure } from '@/domain/health/failure-explanation';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import {
  ControlButton,
  OperationNotice,
  REFUSAL_LABEL,
} from '@/features/panels/primitives/ControlButton';
import { DisplayWindow } from '@/features/panels/primitives/DisplayWindow';
import { Keypad } from '@/features/panels/primitives/Keypad';
import { type PanelScopeActions, usePanel } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { Readout } from '@/features/panels/primitives/Readout';
import { ValueEntry } from '@/features/panels/primitives/ValueEntry';
import { haptics } from '@/platform/haptics';
import { BodyText } from '@/theme/primitives';
import { ThemeProvider } from '@/theme/theme-context';
import { lightTheme } from '@/theme/tokens';

jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }));

afterEach(() => {
  jest.clearAllMocks();
});

// LightBar is hidden from accessibility (the button's own label already speaks its state).
const HIDDEN = { includeHiddenElements: true };

const NOW = 100_000;
const HEADING = GENERIC_DATAREFS.headingBug;
const base = initialSnapshot(GENERIC_PROFILE, 5);

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
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

const actions: PanelScopeActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

async function renderInFrame(snapshot: SessionSnapshot, children: React.ReactNode) {
  const tree = (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelFrame title="Test panel" snapshot={snapshot} now={NOW} actions={actions}>
        {children}
      </PanelFrame>
    </ThemeProvider>
  );
  const result = await render(tree);
  return { ...result, tree };
}

function failed(outcome: Partial<OperationOutcome>): OperationOutcome {
  return { status: 'failed', failure: null, refusal: null, at: NOW, ...outcome };
}

describe('PanelFrame', () => {
  it('shows no notice while live', async () => {
    await renderInFrame(live(), null);
    expect(screen.getByText('Test panel')).toBeTruthy();
    expect(screen.queryByTestId('panel-notice')).toBeNull();
  });

  it('scrolls a focused entry clear of the keyboard on iOS', async () => {
    await renderInFrame(live(), null);
    expect(screen.getByTestId('panel-frame').props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('shows exactly one notice for the whole panel when not connected', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      { ...base, state: 'disconnected' },
      <>
        <ControlButton label="A" featureId={FEATURE_HEADING_CONTROL} target="a" onPress={onPress} />
        <ControlButton label="B" featureId={FEATURE_HEADING_CONTROL} target="b" onPress={onPress} />
      </>,
    );
    expect(screen.getAllByTestId('panel-notice')).toHaveLength(1);
    expect(screen.getByText('Not connected. Showing the last known values.')).toBeTruthy();
  });

  describe('default hold', () => {
    function HoldProbe({ onResult }: { onResult: (result: string) => void }) {
      const { hold } = usePanel();
      return (
        <Text
          accessibilityRole="button"
          onPress={() => {
            void hold('feature', 'name', 'press').then(onResult);
          }}
        >
          Hold
        </Text>
      );
    }

    it('refuses every hold when the panel is given no hold action', async () => {
      const onResult = jest.fn();
      await renderInFrame(live(), <HoldProbe onResult={onResult} />);
      await fireEvent.press(screen.getByText('Hold'));
      await waitFor(() => expect(onResult).toHaveBeenCalledWith('refused'));
    });

    it('calls the given hold action with its arguments', async () => {
      const hold = jest.fn(async () => 'ok' as const);
      const onResult = jest.fn();
      await render(
        <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
          <PanelFrame title="Test panel" snapshot={live()} now={NOW} actions={{ ...actions, hold }}>
            <HoldProbe onResult={onResult} />
          </PanelFrame>
        </ThemeProvider>,
      );
      await fireEvent.press(screen.getByText('Hold'));
      await waitFor(() => expect(onResult).toHaveBeenCalledWith('ok'));
      expect(hold).toHaveBeenCalledWith('feature', 'name', 'press');
    });
  });
});

describe('Readout', () => {
  it('shows the simulator value', async () => {
    await renderInFrame(
      live({ telemetry: { [HEADING]: { value: 270, receivedAt: NOW } } }),
      <Readout label="Heading bug" name={HEADING} unit="°" />,
    );
    expect(screen.getByText('270°')).toBeTruthy();
    expect(screen.queryByText('not live')).toBeNull();
  });

  it('shows a dash when there is no value yet', async () => {
    await renderInFrame(live(), <Readout label="Heading bug" name={HEADING} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('marks the last known value not live after the link drops', async () => {
    await renderInFrame(
      { ...base, state: 'disconnected', telemetry: { [HEADING]: { value: 270, receivedAt: 1 } } },
      <Readout label="Heading bug" name={HEADING} />,
    );
    expect(screen.getByText('270')).toBeTruthy();
    expect(screen.getByText('not live')).toBeTruthy();
    expect(screen.getByLabelText('Heading bug: 270, not live')).toBeTruthy();
  });

  it('says the value is not on this aircraft when its DataRef is missing', async () => {
    const snapshot = live();
    await renderInFrame(
      {
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          bindings: { [HEADING]: { name: HEADING, kind: 'dataref', status: 'missing' } },
        },
      },
      <Readout label="Heading bug" name={HEADING} />,
    );
    expect(screen.getByText('not available on this aircraft')).toBeTruthy();
  });

  it('still shows a read-only value', async () => {
    const snapshot = live({ telemetry: { [HEADING]: { value: 90, receivedAt: NOW } } });
    await renderInFrame(
      {
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          bindings: { [HEADING]: { name: HEADING, kind: 'dataref', status: 'readOnly' } },
        },
      },
      <Readout label="Heading bug" name={HEADING} />,
    );
    expect(screen.getByText('90')).toBeTruthy();
  });
});

describe('ControlButton', () => {
  it('acts when live and available', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      live(),
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the touch rules', async () => {
    await renderInFrame(
      live(),
      <ControlButton
        label="Up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={jest.fn()}
      />,
    );
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Up' }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });

  it('looks unmistakably different when disabled: an outline, not a fill', async () => {
    const button = (
      <ControlButton
        label="Up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={jest.fn()}
      />
    );
    const { rerender } = await renderInFrame(live(), button);
    const enabled = StyleSheet.flatten(screen.getByRole('button', { name: 'Up' }).props.style);
    expect(enabled.backgroundColor).toBe(lightTheme.avionics.keyFace);
    expect(enabled.borderColor).toBe(lightTheme.avionics.bezelEdge);

    await rerender(
      <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
        <PanelFrame
          title="Test panel"
          snapshot={{ ...base, state: 'disconnected' }}
          now={NOW}
          actions={actions}
        >
          {button}
        </PanelFrame>
      </ThemeProvider>,
    );
    const disabled = StyleSheet.flatten(screen.getByRole('button', { name: 'Up' }).props.style);
    expect(disabled.backgroundColor).toBe('transparent');
    expect(disabled.borderColor).toBe(lightTheme.avionics.bezelEdge);
    expect(StyleSheet.flatten(screen.getByText('Up').props.style).color).toBe(
      lightTheme.avionics.legendDim,
    );
  });

  it('does nothing when the link is not live', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      { ...base, state: 'reconnecting' },
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Heading up' })).toBeDisabled();
  });

  it('is unavailable with the reason when the aircraft lacks the feature', async () => {
    const onPress = jest.fn();
    const snapshot = live();
    await renderInFrame(
      {
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          features: snapshot.compatibility.features.map((feature) =>
            feature.id === FEATURE_HEADING_CONTROL
              ? {
                  ...feature,
                  status: 'unavailable' as const,
                  missing: [
                    {
                      name: HEADING,
                      kind: 'dataref' as const,
                      purpose: 'Heading bug',
                      status: 'missing' as const,
                    },
                  ],
                }
              : feature,
          ),
        },
      },
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={onPress}
      />,
    );
    expect(
      screen.getByText('Heading control is not available on this aircraft: Heading bug.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('stays quiet: no reason and no outcome text, for a control whose sibling already shows them', async () => {
    const onPress = jest.fn();
    const snapshot = live();
    await renderInFrame(
      {
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          features: snapshot.compatibility.features.map((feature) =>
            feature.id === FEATURE_HEADING_CONTROL
              ? {
                  ...feature,
                  status: 'unavailable' as const,
                  missing: [
                    {
                      name: HEADING,
                      kind: 'dataref' as const,
                      purpose: 'Heading bug',
                      status: 'missing' as const,
                    },
                  ],
                }
              : feature,
          ),
        },
        operations: { t: failed({ failure: { code: 'WRITE_FAILED', step: 'operation' } }) },
      },
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={onPress}
        quiet
      />,
    );
    expect(
      screen.queryByText('Heading control is not available on this aircraft: Heading bug.'),
    ).toBeNull();
    expect(screen.queryByText(explainFailure('WRITE_FAILED', 'operation').cause)).toBeNull();
  });

  it('says an unchecked feature has not been checked yet', async () => {
    await renderInFrame(
      { ...base, state: 'disconnected' },
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Heading control has not been checked yet.')).toBeTruthy();
  });

  it('is disabled while its own operation is pending', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      live({ operations: { t: { status: 'pending', failure: null, refusal: null, at: NOW } } }),
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('stays enabled while pending when repeatable, and presses queue', async () => {
    const onPress = jest.fn();
    await renderInFrame(
      live({ operations: { t: { status: 'pending', failure: null, refusal: null, at: NOW } } }),
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={onPress}
        repeatable
      />,
    );
    const button = screen.getByRole('button', { name: 'Heading up' });
    expect(button).toBeEnabled();
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('reports its own failure as a cause and an action, and nobody else’s', async () => {
    const { cause } = explainFailure('WRITE_FAILED', 'operation');
    await renderInFrame(
      live({
        operations: { mine: failed({ failure: { code: 'WRITE_FAILED', step: 'operation' } }) },
      }),
      <>
        <ControlButton
          label="Mine"
          featureId={FEATURE_HEADING_CONTROL}
          target="mine"
          onPress={jest.fn()}
        />
        <ControlButton
          label="Other"
          featureId={FEATURE_HEADING_CONTROL}
          target="other"
          onPress={jest.fn()}
        />
      </>,
    );
    expect(screen.getAllByText(cause)).toHaveLength(1);
  });

  it('reports a refusal in plain words', async () => {
    await renderInFrame(
      live({ operations: { t: failed({ refusal: 'notConnected' }) } }),
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText(REFUSAL_LABEL.notConnected)).toBeTruthy();
  });

  it('marks a selected control for sight and for screen readers', async () => {
    await renderInFrame(
      live(),
      <ControlButton
        label="ALT"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        selected
        onPress={() => undefined}
      />,
    );
    const button = screen.getByRole('button', { name: 'ALT' });
    expect(button.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('ALT')).toBeTruthy();
    expect(within(button).getByTestId('light-bar-engaged', HIDDEN)).toBeTruthy();
  });

  it('maps selected={false} to the off light bar', async () => {
    await renderInFrame(
      live(),
      <ControlButton
        label="ALT"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        selected={false}
        onPress={() => undefined}
      />,
    );
    const button = screen.getByRole('button', { name: 'ALT' });
    expect(within(button).getByTestId('light-bar-off', HIDDEN)).toBeTruthy();
  });

  describe('annunciation', () => {
    const wrap = (node: React.ReactNode) => (
      <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
        <PanelFrame title="Test panel" snapshot={live()} now={NOW} actions={actions}>
          {node}
        </PanelFrame>
      </ThemeProvider>
    );
    const button = (annunciation?: 'engaged' | 'armed' | 'off') => (
      <ControlButton
        label="HDG"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        annunciation={annunciation}
        onPress={() => undefined}
      />
    );

    it('draws a solid bar when engaged', async () => {
      await render(wrap(button('engaged')));
      expect(
        within(screen.getByRole('button', { name: 'HDG' })).getByTestId(
          'light-bar-engaged',
          HIDDEN,
        ),
      ).toBeTruthy();
    });

    it('draws a hollow bar when armed', async () => {
      await render(wrap(button('armed')));
      expect(
        within(screen.getByRole('button', { name: 'HDG' })).getByTestId('light-bar-armed', HIDDEN),
      ).toBeTruthy();
    });

    it('draws a dim bar when off', async () => {
      await render(wrap(button('off')));
      expect(
        within(screen.getByRole('button', { name: 'HDG' })).getByTestId('light-bar-off', HIDDEN),
      ).toBeTruthy();
    });

    it('draws a lit lamp in the legend colour', async () => {
      await render(
        wrap(
          <ControlButton
            label="HDG"
            featureId={FEATURE_HEADING_CONTROL}
            target="t"
            annunciation="lit"
            onPress={() => undefined}
          />,
        ),
      );
      expect(
        within(screen.getByRole('button', { name: 'HDG' })).getByTestId('light-bar-lit', HIDDEN),
      ).toHaveStyle({ backgroundColor: lightTheme.avionics.legend });
    });

    it('dims a lit bar to legendDim on a stale link, keeping its shape', async () => {
      const stale = { ...live(), state: 'reconnecting' as const };
      const inStale = (node: React.ReactNode) => (
        <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
          <PanelFrame title="Test panel" snapshot={stale} now={NOW} actions={actions}>
            {node}
          </PanelFrame>
        </ThemeProvider>
      );
      const view = await render(inStale(button('engaged')));
      expect(screen.getByTestId('light-bar-engaged', HIDDEN)).toHaveStyle({
        backgroundColor: lightTheme.avionics.legendDim,
      });
      await view.rerender(inStale(button('armed')));
      expect(screen.getByTestId('light-bar-armed', HIDDEN)).toHaveStyle({
        borderColor: lightTheme.avionics.legendDim,
        backgroundColor: 'transparent',
      });
      await view.rerender(
        inStale(
          <ControlButton
            label="HDG"
            featureId={FEATURE_HEADING_CONTROL}
            target="t"
            annunciation="lit"
            onPress={() => undefined}
          />,
        ),
      );
      expect(screen.getByTestId('light-bar-lit', HIDDEN)).toHaveStyle({
        backgroundColor: lightTheme.avionics.legendDim,
      });
    });

    it('keeps a pending key’s engaged bar lit while the link is live', async () => {
      const pending = live({
        operations: { t: { status: 'pending', failure: null, refusal: null, at: NOW } },
      });
      await render(
        <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
          <PanelFrame title="Test panel" snapshot={pending} now={NOW} actions={actions}>
            {button('engaged')}
          </PanelFrame>
        </ThemeProvider>,
      );
      const key = screen.getByRole('button', { name: 'HDG' });
      expect(key.props.accessibilityState.disabled).toBe(true);
      expect(within(key).getByTestId('light-bar-engaged', HIDDEN)).toHaveStyle({
        backgroundColor: lightTheme.avionics.engaged,
      });
    });

    it('draws no bar at all with no annunciation and no selected', async () => {
      await render(wrap(button(undefined)));
      const found = within(screen.getByRole('button', { name: 'HDG' }));
      expect(found.queryByTestId('light-bar-engaged', HIDDEN)).toBeNull();
      expect(found.queryByTestId('light-bar-armed', HIDDEN)).toBeNull();
      expect(found.queryByTestId('light-bar-off', HIDDEN)).toBeNull();
    });
  });

  it('renders children in place of the legend, keeping the accessible name', async () => {
    await renderInFrame(
      live(),
      <ControlButton
        label="COM1 active"
        accessibilityLabel="Enter COM1 active"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={() => undefined}
      >
        <Text>118.000</Text>
      </ControlButton>,
    );
    expect(screen.getByText('118.000')).toBeTruthy();
    expect(screen.queryByText('COM1 active')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enter COM1 active' })).toBeTruthy();
  });

  it('dims a DisplayWindow child through KeyEnabledContext when the key is disabled', async () => {
    await renderInFrame(
      { ...base, state: 'disconnected' },
      <ControlButton
        label="COM1 active"
        accessibilityLabel="Enter COM1 active"
        featureId={FEATURE_HEADING_CONTROL}
        target="t"
        onPress={() => undefined}
      >
        <DisplayWindow text="118.000" role="selected" />
      </ControlButton>,
    );
    expect(screen.getByText('118.000')).toHaveStyle({ color: lightTheme.avionics.legendDim });
  });

  describe('haptics', () => {
    it('fires a press on tap, then onPress', async () => {
      const onPress = jest.fn();
      await renderInFrame(
        live(),
        <ControlButton
          label="Up"
          featureId={FEATURE_HEADING_CONTROL}
          target="t"
          onPress={onPress}
        />,
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Up' }));
      expect(haptics.press).toHaveBeenCalledTimes(1);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fires neither on a disabled button', async () => {
      const onPress = jest.fn();
      await renderInFrame(
        { ...base, state: 'reconnecting' },
        <ControlButton
          label="Up"
          featureId={FEATURE_HEADING_CONTROL}
          target="t"
          onPress={onPress}
        />,
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Up' }));
      expect(haptics.press).not.toHaveBeenCalled();
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  it('prints a quiet control’s failure once through OperationNotice', async () => {
    await renderInFrame(
      live({ operations: { t: failed({ refusal: 'notConnected' }) } }),
      <>
        <ControlButton
          label="A"
          featureId={FEATURE_HEADING_CONTROL}
          target="t"
          quiet
          onPress={() => undefined}
        />
        <OperationNotice target="t" />
      </>,
    );
    expect(screen.getAllByText('Not sent: Avionix is not connected to X-Plane.')).toHaveLength(1);
  });

  describe('confirmation', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('arms on the first press, acts on the second', async () => {
      const onPress = jest.fn();
      await renderInFrame(
        live(),
        <ControlButton
          label="Disconnect"
          featureId={FEATURE_HEADING_CONTROL}
          target="t"
          onPress={onPress}
          confirm
        />,
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      expect(onPress).not.toHaveBeenCalled();
      expect(haptics.press).toHaveBeenCalledTimes(1);
      await fireEvent.press(screen.getByRole('button', { name: 'Tap again: Disconnect' }));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    });

    it('disarms after three seconds', async () => {
      const onPress = jest.fn();
      await renderInFrame(
        live(),
        <ControlButton
          label="Disconnect"
          featureId={FEATURE_HEADING_CONTROL}
          target="t"
          onPress={onPress}
          confirm
        />,
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('stays armed across a re-render, as on rotation', async () => {
      const onPress = jest.fn();
      const button = (
        <ControlButton
          label="Disconnect"
          featureId={FEATURE_HEADING_CONTROL}
          target="t"
          onPress={onPress}
          confirm
        />
      );
      const { rerender, tree } = await renderInFrame(live(), button);
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      await rerender(tree);
      expect(screen.getByRole('button', { name: 'Tap again: Disconnect' })).toBeTruthy();
    });

    it('disarms when it becomes disabled', async () => {
      const onPress = jest.fn();
      const make = (snapshot: SessionSnapshot) => (
        <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
          <PanelFrame title="Test panel" snapshot={snapshot} now={NOW} actions={actions}>
            <ControlButton
              label="Disconnect"
              featureId={FEATURE_HEADING_CONTROL}
              target="t"
              onPress={onPress}
              confirm
            />
          </PanelFrame>
        </ThemeProvider>
      );
      const { rerender } = await render(make(live()));
      await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
      await rerender(make({ ...base, state: 'reconnecting' }));
      await rerender(make(live()));
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    });
  });
});

describe('Keypad', () => {
  it('fires a press and the digit callback', async () => {
    const onDigit = jest.fn();
    await renderInFrame(
      live(),
      <Keypad
        digits={[1, 2, 3, 4, 5, 6, 7, 8, 9, 0]}
        onDigit={onDigit}
        onErase={() => undefined}
        onClear={() => undefined}
      />,
    );
    await fireEvent.press(screen.getByLabelText('5'));
    expect(haptics.press).toHaveBeenCalledTimes(1);
    expect(onDigit).toHaveBeenCalledWith(5);
  });

  it('prints word and symbol keys at the legend size, digits at the display size', async () => {
    await renderInFrame(
      live(),
      <Keypad
        digits={[1, 2, 3, 4, 5, 6, 7, 8, 9, 0]}
        onDigit={() => undefined}
        onErase={() => undefined}
        onClear={() => undefined}
        onSign={() => undefined}
      />,
    );
    const { legendSize, displaySize } = lightTheme.typography;
    for (const word of ['Clear', '⌫', '±']) {
      expect(screen.getByText(word)).toHaveStyle({ fontSize: legendSize });
    }
    expect(screen.getByText('5')).toHaveStyle({ fontSize: displaySize });
  });
});

describe('DisplayWindow', () => {
  it('colours an active value with the engaged colour', async () => {
    await renderInFrame(live(), <DisplayWindow text="118.000" role="active" />);
    expect(screen.getByText('118.000')).toHaveStyle({ color: lightTheme.avionics.engaged });
  });

  it('colours a selected value with the selected colour', async () => {
    await renderInFrame(live(), <DisplayWindow text="121.500" role="selected" />);
    expect(screen.getByText('121.500')).toHaveStyle({ color: lightTheme.avionics.selected });
  });

  it('is unaffected by key state outside any ControlButton', async () => {
    // No ControlButton wraps this window, so KeyEnabledContext's default (true) applies: it
    // never dims on account of a key it is not inside.
    await renderInFrame(live(), <DisplayWindow text="121.500" role="selected" />);
    expect(screen.getByText('121.500')).toHaveStyle({ color: lightTheme.avionics.selected });
  });

  it('draws a stale value in legendDim', async () => {
    await renderInFrame(live(), <DisplayWindow text="118.000" role="active" stale />);
    expect(screen.getByText('118.000')).toHaveStyle({ color: lightTheme.avionics.legendDim });
  });

  it('renders the tuning frame', async () => {
    await renderInFrame(live(), <DisplayWindow text="118.000" role="active" tuning />);
    expect(screen.getByTestId('display-window-tuning')).toBeTruthy();
  });

  it('overrides the role colour with warning for an emergency squawk', async () => {
    await renderInFrame(live(), <DisplayWindow text="7700" role="active" tone="warning" />);
    expect(screen.getByText('7700')).toHaveStyle({ color: lightTheme.avionics.warning });
  });

  it('dims a stale emergency squawk, keeping its EMERG caption', async () => {
    await renderInFrame(
      live(),
      <DisplayWindow text="7700" role="plain" caption="ALT · EMERG" tone="warning" stale />,
    );
    expect(screen.getByText('7700')).toHaveStyle({ color: lightTheme.avionics.legendDim });
    expect(screen.getByText('ALT · EMERG')).toBeTruthy();
  });
});

describe('BodyText on a bezel', () => {
  it('uses the avionics warning colour for danger inside an AvionicsUnit', async () => {
    await renderInFrame(
      live(),
      <AvionicsUnit>
        <BodyText tone="danger">Oops</BodyText>
      </AvionicsUnit>,
    );
    expect(screen.getByText('Oops')).toHaveStyle({ color: lightTheme.avionics.warning });
  });

  it('uses colors.danger for the same text outside a unit', async () => {
    await renderInFrame(live(), <BodyText tone="danger">Oops</BodyText>);
    expect(screen.getByText('Oops')).toHaveStyle({ color: lightTheme.colors.danger });
  });

  it('uses legendDim for muted text inside a unit', async () => {
    await renderInFrame(
      live(),
      <AvionicsUnit>
        <BodyText muted>Quiet</BodyText>
      </AvionicsUnit>,
    );
    expect(screen.getByText('Quiet')).toHaveStyle({ color: lightTheme.avionics.legendDim });
  });
});

describe('ValueEntry', () => {
  function entry(onSubmit: (value: number) => void) {
    return (
      <ValueEntry
        label="New heading"
        featureId={FEATURE_HEADING_CONTROL}
        target={HEADING}
        min={0}
        max={360}
        onSubmit={onSubmit}
      />
    );
  }

  it('submits a number in range', async () => {
    const onSubmit = jest.fn();
    await renderInFrame(live(), entry(onSubmit));
    await fireEvent.changeText(screen.getByLabelText('New heading'), '95');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(onSubmit).toHaveBeenCalledWith(95);
  });

  it('refuses a number out of range, in the pilot’s words', async () => {
    const onSubmit = jest.fn();
    await renderInFrame(live(), entry(onSubmit));
    await fireEvent.changeText(screen.getByLabelText('New heading'), '400');
    expect(screen.getByText('Enter a number from 0 to 360.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each(['0x10', '1e2', '12.', '.5', '+5', '-5', '5 5'])(
    'refuses %s, which is not a plain decimal number here',
    async (text) => {
      const onSubmit = jest.fn();
      await renderInFrame(live(), entry(onSubmit));
      await fireEvent.changeText(screen.getByLabelText('New heading'), text);
      expect(screen.getByText('Enter a number from 0 to 360.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Set New heading' })).toBeDisabled();
      await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('accepts a decimal with surrounding spaces', async () => {
    const onSubmit = jest.fn();
    await renderInFrame(live(), entry(onSubmit));
    await fireEvent.changeText(screen.getByLabelText('New heading'), ' 95.5 ');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(onSubmit).toHaveBeenCalledWith(95.5);
  });

  it('accepts a negative number only where the range allows one', async () => {
    const onSubmit = jest.fn();
    await renderInFrame(
      live(),
      <ValueEntry
        label="Trim"
        featureId={FEATURE_HEADING_CONTROL}
        target={HEADING}
        min={-10}
        max={10}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Trim'), '-2.5');
    await fireEvent.press(screen.getByRole('button', { name: 'Set Trim' }));
    expect(onSubmit).toHaveBeenCalledWith(-2.5);
  });

  it('keeps the draft after a failed write so the pilot can retry', async () => {
    const onSubmit = jest.fn();
    const { rerender } = await renderInFrame(live(), entry(onSubmit));
    await fireEvent.changeText(screen.getByLabelText('New heading'), '95');
    await rerender(
      <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
        <PanelFrame
          title="Test panel"
          snapshot={live({
            operations: {
              [HEADING]: failed({ failure: { code: 'WRITE_FAILED', step: 'operation' } }),
            },
          })}
          now={NOW}
          actions={actions}
        >
          {entry(onSubmit)}
        </PanelFrame>
      </ThemeProvider>,
    );
    expect(screen.getByDisplayValue('95')).toBeTruthy();
  });
});
