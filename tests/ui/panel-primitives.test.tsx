import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

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
import { ControlButton, REFUSAL_LABEL } from '@/features/panels/primitives/ControlButton';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { Readout } from '@/features/panels/primitives/Readout';
import { ValueEntry } from '@/features/panels/primitives/ValueEntry';
import { ThemeProvider } from '@/theme/theme-context';
import { lightTheme } from '@/theme/tokens';

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

const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => undefined),
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
    expect(enabled.backgroundColor).toBe(lightTheme.colors.primary);
    expect(enabled.borderColor).toBe(lightTheme.colors.primary);

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
    expect(disabled.borderColor).toBe(lightTheme.colors.border);
    expect(StyleSheet.flatten(screen.getByText('Up').props.style).color).toBe(
      lightTheme.colors.textMuted,
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
