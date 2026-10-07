import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AppState, type AppStateStatus, Text } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { FEATURE_HEADING_CONTROL, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { ActivationResult } from '@/domain/panels/activation';
import type { HoldPhase } from '@/domain/panels/hold-lease';
import { holdCapped, holdNoResponse } from '@/domain/systems/messages';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { useHoldControl } from '@/features/panels/primitives/useHoldControl';
import { ThemeProvider } from '@/theme/theme-context';

jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }));

const NOW = 100_000;
const FEATURE = FEATURE_HEADING_CONTROL;
const COMMAND = 'sim/flight_controls/pitch_trim_up';
const base = initialSnapshot(GENERIC_PROFILE, 5);
const CAPPED = holdCapped('pitch trim', 10, 'Hold it again to keep trimming.');
const NO_RESPONSE = holdNoResponse(null, 'move the pitch trim');

function live(): SessionSnapshot {
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
  };
}
const stale: SessionSnapshot = { ...live(), state: 'reconnecting' };

const hold = jest.fn<Promise<ActivationResult>, [string, string, HoldPhase]>(async () => 'ok');
const actions: PanelScopeActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
  hold,
};

interface ProbeProps {
  value: number | null;
  capMs?: number;
  atLimit?: (value: number | null) => boolean;
  enabled?: boolean;
}

function Probe({ value, capMs = 10_000, atLimit, enabled }: ProbeProps) {
  const control = useHoldControl({
    featureId: FEATURE,
    command: COMMAND,
    capMs,
    name: 'pitch trim',
    value,
    cappedMessage: CAPPED,
    noResponseMessage: NO_RESPONSE,
    atLimit,
    enabled,
  });
  return (
    <>
      <ControlButton
        label="NOSE DN"
        featureId={FEATURE}
        target="pitch-trim"
        onPress={() => undefined}
        hold={{ onStart: control.start, onEnd: control.end }}
      />
      <Text testID="held">{control.held ? 'held' : 'free'}</Text>
      {control.message === null ? null : <Text testID="message">{control.message}</Text>}
    </>
  );
}

function tree(snapshot: SessionSnapshot, props: ProbeProps) {
  return (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
        <Probe {...props} />
      </PanelScope>
    </ThemeProvider>
  );
}

const key = () => screen.getByRole('button', { name: 'NOSE DN' });
const phases = () => hold.mock.calls.map(([, , phase]) => phase);
const message = () => screen.queryByTestId('message')?.props.children ?? null;

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const originalCurrentState = AppState.currentState;

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {
    value: originalCurrentState,
    configurable: true,
    writable: true,
  });
});

describe('useHoldControl', () => {
  it('presses on press-in, renews every 200 ms, and releases on press-out', async () => {
    await render(tree(live(), { value: 0 }));
    await fireEvent(key(), 'pressIn');
    expect(screen.getByTestId('held').props.children).toBe('held');
    await advance(600);
    await fireEvent(key(), 'pressOut');
    expect(hold.mock.calls).toEqual([
      [FEATURE, COMMAND, 'press'],
      [FEATURE, COMMAND, 'renew'],
      [FEATURE, COMMAND, 'renew'],
      [FEATURE, COMMAND, 'renew'],
      [FEATURE, COMMAND, 'release'],
    ]);
    expect(screen.getByTestId('held').props.children).toBe('free');
  });

  it('releases a quick tap whose press arrives before its press-out', async () => {
    await render(tree(live(), { value: 0 }));
    await fireEvent(key(), 'pressIn');
    await fireEvent.press(key());
    await fireEvent(key(), 'pressOut');
    await advance(1000);
    const sent = phases();
    expect(sent.filter((phase) => phase === 'press')).toHaveLength(1);
    expect(sent.filter((phase) => phase === 'release')).toHaveLength(1);
    expect(sent.at(-1)).toBe('release');
    expect(screen.getByTestId('held').props.children).toBe('free');
  });

  it('keeps holding when a new touch lands inside a tap’s minimum-hold tail', async () => {
    await render(tree(live(), { value: 0 }));
    await fireEvent(key(), 'pressIn');
    await fireEvent.press(key());
    await fireEvent(key(), 'pressOut');
    await advance(150);
    await fireEvent(key(), 'pressIn');
    for (let elapsed = 0; elapsed < 2000; elapsed += 200) {
      await advance(200);
      expect(screen.getByTestId('held').props.children).toBe('held');
    }
    expect(phases().filter((phase) => phase === 'press')).toHaveLength(1);
    expect(phases().filter((phase) => phase === 'release')).toHaveLength(0);
    // Renewed every 200 ms from the first press, without a gap: 2150 ms / 200 ms.
    expect(phases().filter((phase) => phase === 'renew')).toHaveLength(10);
    await fireEvent(key(), 'pressOut');
    expect(phases().filter((phase) => phase === 'release')).toHaveLength(1);
    expect(phases().at(-1)).toBe('release');
    expect(screen.getByTestId('held').props.children).toBe('free');
  });

  it('releases when controls disable mid-hold, says why, and never resumes', async () => {
    const { rerender } = await render(tree(live(), { value: 0 }));
    await fireEvent(key(), 'pressIn');
    await advance(200);
    await rerender(tree(stale, { value: 0 }));
    expect(phases()).toEqual(['press', 'renew', 'release']);
    expect(message()).toBe('Pitch trim released: the connection to X-Plane dropped.');
    expect(screen.getByTestId('held').props.children).toBe('free');

    await rerender(tree(live(), { value: 0 }));
    await advance(1000);
    expect(phases()).toEqual(['press', 'renew', 'release']);
  });

  it('releases, without a link sentence, when the key itself becomes unusable mid-hold', async () => {
    const { rerender } = await render(tree(live(), { value: 0, enabled: true }));
    await fireEvent(key(), 'pressIn');
    await advance(400);
    await rerender(tree(live(), { value: 0, enabled: false }));
    expect(phases()).toEqual(['press', 'renew', 'renew', 'release']);
    expect(screen.getByTestId('held').props.children).toBe('free');
    expect(message()).toBeNull();
    await advance(1000);
    expect(phases()).toEqual(['press', 'renew', 'renew', 'release']);
    await fireEvent(key(), 'pressOut');
    expect(phases()).toEqual(['press', 'renew', 'renew', 'release']);
  });

  it('releases when the app goes to the background mid-hold', async () => {
    await render(tree(live(), { value: 0 }));
    const handlers = jest
      .mocked(AppState.addEventListener)
      .mock.calls.filter(([type]) => type === 'change')
      .map(([, handler]) => handler);
    expect(handlers.length).toBeGreaterThan(0);
    await fireEvent(key(), 'pressIn');
    await act(async () => {
      const status: AppStateStatus = 'background';
      Object.defineProperty(AppState, 'currentState', {
        value: status,
        configurable: true,
        writable: true,
      });
      for (const handler of handlers) {
        handler(status);
      }
    });
    expect(phases()).toEqual(['press', 'release']);
    expect(message()).toBe('Pitch trim released: Avionix left the foreground.');
    await advance(1000);
    expect(phases()).toEqual(['press', 'release']);
  });

  it('releases at the cap and says so', async () => {
    await render(tree(live(), { value: 0, capMs: 1000 }));
    await fireEvent(key(), 'pressIn');
    await advance(1000);
    expect(phases().filter((phase) => phase === 'release')).toHaveLength(1);
    expect(phases().at(-1)).toBe('release');
    expect(message()).toBe(CAPPED);
    await fireEvent(key(), 'pressOut');
    expect(phases().filter((phase) => phase === 'release')).toHaveLength(1);
  });

  describe('no response', () => {
    it('is reported after a 1.2 s hold that moved nothing', async () => {
      await render(tree(live(), { value: 0.1 }));
      await fireEvent(key(), 'pressIn');
      await advance(1200);
      await fireEvent(key(), 'pressOut');
      expect(message()).toBe(NO_RESPONSE);
    });

    it('is not reported when the value moved during the hold', async () => {
      const { rerender } = await render(tree(live(), { value: 0.1 }));
      await fireEvent(key(), 'pressIn');
      await advance(600);
      await rerender(tree(live(), { value: 0.12 }));
      await advance(600);
      await fireEvent(key(), 'pressOut');
      expect(message()).toBeNull();
    });

    it('is not reported at the limit', async () => {
      const atLimit = jest.fn(() => true);
      await render(tree(live(), { value: 1, atLimit }));
      await fireEvent(key(), 'pressIn');
      await advance(1200);
      await fireEvent(key(), 'pressOut');
      expect(atLimit).toHaveBeenCalledWith(1);
      expect(message()).toBeNull();
    });

    it('is not reported after a hold shorter than a second', async () => {
      await render(tree(live(), { value: 0.1 }));
      await fireEvent(key(), 'pressIn');
      await advance(500);
      await fireEvent(key(), 'pressOut');
      expect(message()).toBeNull();
    });

    it('is not reported when the value is unknown', async () => {
      await render(tree(live(), { value: null }));
      await fireEvent(key(), 'pressIn');
      await advance(1200);
      await fireEvent(key(), 'pressOut');
      expect(message()).toBeNull();
    });
  });

  it('clears the previous message on a new press', async () => {
    await render(tree(live(), { value: 0.1 }));
    await fireEvent(key(), 'pressIn');
    await advance(1200);
    await fireEvent(key(), 'pressOut');
    await fireEvent.press(key());
    expect(message()).toBe(NO_RESPONSE);
    await fireEvent(key(), 'pressIn');
    expect(message()).toBeNull();
    await fireEvent(key(), 'pressOut');
  });

  it('nudges on a screen reader’s activation: press, then release after the minimum hold', async () => {
    await render(tree(live(), { value: 0 }));
    await fireEvent.press(key());
    expect(phases()).toEqual(['press']);
    await advance(250);
    expect(phases()).toEqual(['press', 'renew', 'release']);
    expect(screen.getByTestId('held').props.children).toBe('free');
  });

  it('releases on unmount mid-hold', async () => {
    const errors = jest.spyOn(console, 'error');
    const { unmount } = await render(tree(live(), { value: 0 }));
    await fireEvent(key(), 'pressIn');
    await act(async () => {
      unmount();
    });
    expect(phases()).toEqual(['press', 'release']);
    await advance(1000);
    expect(phases()).toEqual(['press', 'release']);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
