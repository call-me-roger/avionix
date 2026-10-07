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
import {
  MESSAGE_MS,
  SLOW_SHOWN_MS,
  queueTagMatches,
  useCduKeys,
} from '@/features/panels/cdu/useCduKeys';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

/** The only keys the probe below needs to exercise the hook, plus one id the catalogue lacks. */
const PROBE_KEYS = ['key_K', 'key_L', 'key_A', 'key_B', 'not_a_cdu_key'];

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

const actions: PanelScopeActions = {
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

/**
 * `queueTagMatches` is the belt-and-suspenders half of the routing-gap fix (review finding 1):
 * `useLayoutEffect` closes the gap for every source that changes `unit` or `link.controlsEnabled`
 * on React's synchronous lane today, but `press` also refuses a queue whose tag disagrees with the
 * render it was called from, so a queue built on a later pass (e.g. a future async preference load)
 * is dropped rather than misrouted. React's `act()` in this test environment deliberately flushes
 * commit, layout effects and passive effects together before any `await` resolves, so the gap itself
 * cannot be reproduced through `render`/`rerender` here; this pins the pure comparison `press` relies
 * on instead.
 */
describe('queueTagMatches', () => {
  it('matches a queue built for the same unit and controlsEnabled', () => {
    expect(
      queueTagMatches({ unit: 1, controlsEnabled: true }, { unit: 1, controlsEnabled: true }),
    ).toBe(true);
  });

  it('rejects a queue built for a different unit', () => {
    expect(
      queueTagMatches({ unit: 1, controlsEnabled: true }, { unit: 2, controlsEnabled: true }),
    ).toBe(false);
  });

  it('rejects a queue built while controls were enabled, now that they are not', () => {
    expect(
      queueTagMatches({ unit: 1, controlsEnabled: true }, { unit: 1, controlsEnabled: false }),
    ).toBe(false);
  });

  it('rejects when no queue has been built yet', () => {
    expect(queueTagMatches(null, { unit: 1, controlsEnabled: true })).toBe(false);
  });
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

  it('keeps QUEUE_FULL_MESSAGE while the keys pressed before it are answered, and clears it on the answer to a key pressed after it', async () => {
    await render(tree(live(), 1));
    await press('key_A', CDU_QUEUE_LIMIT);
    await press('key_B');
    expect(messageText()).toBe(QUEUE_FULL_MESSAGE);
    for (let i = 0; i < CDU_QUEUE_LIMIT; i += 1) {
      await resolveNext('ok');
    }
    expect(activate).toHaveBeenCalledTimes(CDU_QUEUE_LIMIT);
    expect(messageText()).toBe(QUEUE_FULL_MESSAGE);
    await press('key_K');
    await resolveNext('ok');
    expect(messageText()).toBe('');
  });

  it('replaces QUEUE_FULL_MESSAGE with a failure among the keys pressed before it', async () => {
    await render(tree(live(), 1));
    await press('key_A', CDU_QUEUE_LIMIT);
    await press('key_B');
    expect(messageText()).toBe(QUEUE_FULL_MESSAGE);
    await resolveNext('failed');
    expect(messageText()).toBe(
      `X-Plane didn't take the A key. The ${CDU_QUEUE_LIMIT - 1} keys after it weren't sent.`,
    );
  });

  it('calls a key outside the catalogue "that key" in its failure message, never by its id (R12)', async () => {
    await render(tree(live(), 1));
    await press('not_a_cdu_key');
    await resolveNext('failed');
    expect(messageText()).toBe("X-Plane didn't take that key.");
  });

  it('empties the queue when controls become disabled: the in-flight answer sends nothing more, shows no message, and nothing is sent once the link returns', async () => {
    const view = await render(tree(live(), 1));
    await press('key_K');
    await press('key_L');
    expect(activate).toHaveBeenCalledTimes(1);
    await view.rerender(tree(notConnected(), 1));
    await resolveNext('failed');
    expect(activate).toHaveBeenCalledTimes(1);
    expect(messageText()).toBe('');
    // Nothing is sent on reconnect (C5): the dropped key_L must not surface once the link is live again.
    await view.rerender(tree(live(), 1));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('empties the queue when the unit changes', async () => {
    const view = await render(tree(live(), 1));
    await press('key_K');
    await press('key_L');
    expect(activate).toHaveBeenCalledTimes(1);
    await view.rerender(tree(live(), 2));
    await resolveNext('failed');
    expect(activate).toHaveBeenCalledTimes(1);
    expect(messageText()).toBe('');
    await press('key_K');
    expect(activate).toHaveBeenLastCalledWith('cdu2-keys', 'sim/FMS2/key_K');
  });

  it('builds no queue while controls are disabled: a press does nothing', async () => {
    await render(tree(notConnected(), 1));
    await press('key_K');
    expect(activate).not.toHaveBeenCalled();
  });

  it('restarts the message timer when the same message is shown again', async () => {
    await render(tree(live(), 1));
    await press('key_A', CDU_QUEUE_LIMIT);
    await press('key_B');
    expect(messageText()).toBe(QUEUE_FULL_MESSAGE);
    await act(async () => {
      jest.advanceTimersByTime(MESSAGE_MS - 1);
    });
    expect(messageText()).toBe(QUEUE_FULL_MESSAGE);
    // A second, identical refusal must not inherit the first's almost-expired timer.
    await press('key_B');
    expect(messageText()).toBe(QUEUE_FULL_MESSAGE);
    await act(async () => {
      jest.advanceTimersByTime(MESSAGE_MS - 1);
    });
    expect(messageText()).toBe(QUEUE_FULL_MESSAGE);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(messageText()).toBe('');
  });

  it('lights SLOW for a slow answer that then fails', async () => {
    await render(tree(live(), 1));
    await press('key_K');
    expect(slowText()).toBe('not-slow');
    await act(async () => {
      jest.advanceTimersByTime(SLOW_KEY_MS + 50);
    });
    await resolveNext('failed');
    expect(slowText()).toBe('slow');
  });
});
