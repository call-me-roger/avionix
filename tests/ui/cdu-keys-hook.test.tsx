import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import type { BindingResults } from '@/domain/aircraft/availability';
import { deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_PROFILE, cduKeysFeatureId } from '@/domain/aircraft/profiles/generic';
import { CDU_QUEUE_LIMIT, SLOW_KEY_MS } from '@/domain/cdu/key-queue';
import type { CduUnit } from '@/domain/cdu/keys';
import { QUEUE_FULL_MESSAGE } from '@/domain/cdu/messages';
import type { ActivationResult } from '@/domain/panels/activation';
import { MESSAGE_MS, SLOW_SHOWN_MS, useCduKeys } from '@/features/panels/cdu/useCduKeys';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

/** The only keys the probe below needs to exercise the hook. */
const PROBE_KEYS = ['key_K', 'key_L', 'key_A', 'key_B'];

/** Every binding either CDU unit's keys feature reads, 'ok': the generic profile's own shape. */
function cduBindingsOk(): BindingResults {
  const results: BindingResults = {};
  for (const unit of [1, 2] as const) {
    const feature = GENERIC_PROFILE.features.find(
      (candidate) => candidate.id === cduKeysFeatureId(unit),
    );
    for (const binding of feature?.bindings ?? []) {
      results[binding.name] = { name: binding.name, kind: binding.kind, status: 'ok' };
    }
  }
  return results;
}

function compatibilityFor() {
  const bindings = cduBindingsOk();
  return {
    ...base.compatibility,
    bindings,
    features: deriveAvailability(GENERIC_PROFILE, bindings),
  };
}

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    compatibility: compatibilityFor(),
    ...overrides,
  };
}

function notConnected(): SessionSnapshot {
  return { ...live(), state: 'disconnected' };
}

function deferredActivation() {
  let resolve!: (result: ActivationResult) => void;
  const promise = new Promise<ActivationResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let pending: ReturnType<typeof deferredActivation>[] = [];

const activate = jest.fn(() => {
  const d = deferredActivation();
  pending.push(d);
  return d.promise;
});

const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate,
};

/** Resolves the oldest still-waiting activation and flushes the queue's reaction to it. */
async function resolveNext(result: ActivationResult) {
  await act(async () => {
    pending.shift()?.resolve(result);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function Probe({ unit }: { unit: CduUnit }) {
  const { press, message, slow } = useCduKeys(unit);
  return (
    <>
      <Text testID="message">{message ?? ''}</Text>
      <Text testID="slow">{slow ? 'slow' : 'not-slow'}</Text>
      {PROBE_KEYS.map((id) => (
        <Pressable key={id} accessibilityLabel={id} onPress={() => press(id)} />
      ))}
    </>
  );
}

function tree(snapshot: SessionSnapshot, unit: CduUnit) {
  return (
    <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
      <Probe unit={unit} />
    </PanelScope>
  );
}

/** Presses a probe key the given number of times (default once), in order. */
async function press(id: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await fireEvent.press(screen.getByLabelText(id));
  }
}

function messageText(): string {
  return screen.getByTestId('message').props.children ?? '';
}

function slowText(): string {
  return screen.getByTestId('slow').props.children;
}

beforeEach(() => {
  jest.useFakeTimers();
  pending = [];
  activate.mockClear();
  (actions.write as jest.Mock).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCduKeys', () => {
  it('activates the pressed keys in order, against unit 1', async () => {
    await render(tree(live(), 1));
    await press('key_K');
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith('cdu1-keys', 'sim/FMS/key_K');
    await press('key_L');
    expect(activate).toHaveBeenCalledTimes(1);
    await resolveNext('ok');
    expect(activate).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenCalledWith('cdu1-keys', 'sim/FMS/key_L');
  });

  it('activates against unit 2 with the sim/FMS2 commands', async () => {
    await render(tree(live(), 2));
    await press('key_A');
    expect(activate).toHaveBeenCalledWith('cdu2-keys', 'sim/FMS2/key_A');
  });

  it('shows the failed key and how many behind it were dropped', async () => {
    await render(tree(live(), 1));
    await press('key_K');
    await press('key_L');
    await press('key_A');
    await resolveNext('failed');
    expect(messageText()).toBe("X-Plane didn't take the K key. The 2 keys after it weren't sent.");
  });

  it('clears the failure message after MESSAGE_MS', async () => {
    await render(tree(live(), 1));
    await press('key_K');
    await resolveNext('failed');
    expect(messageText()).not.toBe('');
    await act(async () => {
      jest.advanceTimersByTime(MESSAGE_MS);
    });
    expect(messageText()).toBe('');
  });

  it('clears the failure message immediately on the next ok answer', async () => {
    await render(tree(live(), 1));
    await press('key_K');
    await resolveNext('failed');
    expect(messageText()).not.toBe('');
    await press('key_A');
    await resolveNext('ok');
    expect(messageText()).toBe('');
  });

  it('lights the SLOW lamp on an answer slower than SLOW_KEY_MS, dark again SLOW_SHOWN_MS later', async () => {
    await render(tree(live(), 1));
    await press('key_K');
    expect(slowText()).toBe('not-slow');
    await act(async () => {
      jest.advanceTimersByTime(SLOW_KEY_MS + 50);
    });
    await resolveNext('ok');
    expect(slowText()).toBe('slow');
    await act(async () => {
      jest.advanceTimersByTime(SLOW_SHOWN_MS);
    });
    expect(slowText()).toBe('not-slow');
  });

  it('does not light SLOW for an answer within SLOW_KEY_MS', async () => {
    await render(tree(live(), 1));
    await press('key_K');
    await resolveNext('ok');
    expect(slowText()).toBe('not-slow');
  });

  it('shows QUEUE_FULL_MESSAGE on the 25th press while the first is unanswered', async () => {
    await render(tree(live(), 1));
    await press('key_A', CDU_QUEUE_LIMIT);
    expect(messageText()).toBe('');
    await press('key_B');
    expect(messageText()).toBe(QUEUE_FULL_MESSAGE);
  });

  it('empties the queue when controls become disabled: the in-flight answer sends nothing more and shows no message', async () => {
    const view = await render(tree(live(), 1));
    await press('key_K');
    await press('key_L');
    expect(activate).toHaveBeenCalledTimes(1);
    await view.rerender(tree(notConnected(), 1));
    await resolveNext('ok');
    expect(activate).toHaveBeenCalledTimes(1);
    expect(messageText()).toBe('');
  });

  it('empties the queue when the unit changes', async () => {
    const view = await render(tree(live(), 1));
    await press('key_K');
    await press('key_L');
    expect(activate).toHaveBeenCalledTimes(1);
    await view.rerender(tree(live(), 2));
    await resolveNext('ok');
    expect(activate).toHaveBeenCalledTimes(1);
    expect(messageText()).toBe('');
    await press('key_K');
    expect(activate).toHaveBeenLastCalledWith('cdu2-keys', 'sim/FMS2/key_K');
  });
});
