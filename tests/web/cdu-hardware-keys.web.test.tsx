import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { deriveAvailability } from '@/domain/aircraft/availability';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  FEATURE_CDU1_KEYS,
  FEATURE_CDU1_SCREEN,
  FEATURE_CDU2_KEYS,
  FEATURE_CDU2_SCREEN,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { cduTextLine } from '@/domain/cdu/keys';
import type { ActivationResult } from '@/domain/panels/activation';
import { CduPanel } from '@/features/panels/cdu/CduPanel';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { ThemeProvider } from '@/theme/theme-context';

import { text, toyScreenTelemetry } from '../helpers/cdu';

declare global {
  // React reads this flag to enable act() in non-RTL environments.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

/** CDU 1 fully live: both units' screens arrived, the link is up, every key would be pressable. */
function liveSnapshot(): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: { ...toyScreenTelemetry(1, NOW), ...toyScreenTelemetry(2, NOW) },
  };
}

/** CDU 1 connected but every line of its screen has been blank since identification: No FMS. */
function noFmsSnapshot(): SessionSnapshot {
  const telemetry: SessionSnapshot['telemetry'] = {};
  for (let line = 0; line < 16; line += 1) {
    telemetry[cduTextLine(1, line)] = { value: text(''), receivedAt: NOW };
  }
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry,
  };
}

/** CDU 1 connected but not every line has arrived yet: waiting for the screen. */
function waitingSnapshot(): SessionSnapshot {
  const telemetry: SessionSnapshot['telemetry'] = {
    [cduTextLine(1, 0)]: { value: text('        TOY FMS'), receivedAt: NOW },
  };
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry,
  };
}

/** Both CDU screens unavailable on this aircraft: the panel shows unit 1's "doesn't publish" text. */
function unavailableSnapshot(): SessionSnapshot {
  const bindings: SessionSnapshot['compatibility']['bindings'] = {};
  for (const id of [
    FEATURE_CDU1_SCREEN,
    FEATURE_CDU1_KEYS,
    FEATURE_CDU2_SCREEN,
    FEATURE_CDU2_KEYS,
  ]) {
    const feature = GENERIC_PROFILE.features.find((candidate) => candidate.id === id);
    for (const binding of feature?.bindings ?? []) {
      const missing = binding.name === cduTextLine(1, 0) || binding.name === cduTextLine(2, 0);
      bindings[binding.name] = {
        name: binding.name,
        kind: binding.kind,
        status: missing ? 'missing' : 'ok',
      };
    }
  }
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    compatibility: {
      ...base.compatibility,
      bindings,
      features: deriveAvailability(GENERIC_PROFILE, bindings),
    },
  };
}

const activate = jest.fn(async (): Promise<ActivationResult> => 'ok');
const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate,
};

const THEME_STORAGE = createMemorySettingsStorage();

describe('the CDU panel reads a physical keyboard on the web build', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    activate.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    container.remove();
  });

  async function mount(snapshot: SessionSnapshot = liveSnapshot()): Promise<void> {
    await act(async () => {
      root.render(
        <ThemeProvider storage={THEME_STORAGE} systemSchemeOverride="light">
          <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
            <CduPanel />
          </PanelScope>
        </ThemeProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  async function unmount(): Promise<void> {
    await act(async () => {
      root.unmount();
    });
  }

  /** Dispatches a `keydown` on `window` (or another target) and settles the queue's microtasks. */
  async function keydown(
    init: KeyboardEventInit,
    target: EventTarget = window,
  ): Promise<KeyboardEvent> {
    let event: KeyboardEvent | undefined;
    await act(async () => {
      event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      await Promise.resolve();
      await Promise.resolve();
    });
    return event as KeyboardEvent;
  }

  it('sends sim/FMS/key_K for the K key', async () => {
    await mount();
    await keydown({ key: 'k' });
    expect(activate).toHaveBeenCalledWith('cdu1-keys', 'sim/FMS/key_K');
    await unmount();
  });

  it('sends sim/FMS/next for PageDown', async () => {
    await mount();
    await keydown({ key: 'PageDown' });
    expect(activate).toHaveBeenCalledWith('cdu1-keys', 'sim/FMS/next');
    await unmount();
  });

  it('sends nothing for Enter', async () => {
    await mount();
    await keydown({ key: 'Enter' });
    expect(activate).not.toHaveBeenCalled();
    await unmount();
  });

  it('sends nothing for a letter held with the meta key', async () => {
    await mount();
    await keydown({ key: 'k', metaKey: true });
    expect(activate).not.toHaveBeenCalled();
    await unmount();
  });

  it('sends nothing while an input has focus', async () => {
    await mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    await keydown({ key: 'k' });
    expect(activate).not.toHaveBeenCalled();
    input.remove();
    await unmount();
  });

  it('calls preventDefault for a consumed key', async () => {
    await mount();
    const event = await keydown({ key: 'k' });
    expect(event.defaultPrevented).toBe(true);
    await unmount();
  });

  it('does not call preventDefault for an unconsumed key', async () => {
    await mount();
    const event = await keydown({ key: 'Enter' });
    expect(event.defaultPrevented).toBe(false);
    await unmount();
  });

  it('sends one key for a held key: its auto-repeats are swallowed (C2)', async () => {
    await mount();
    await keydown({ key: 'k' });
    for (let i = 0; i < 3; i += 1) {
      const repeat = await keydown({ key: 'k', repeat: true });
      // Still consumed: a held mapped key must not reach the browser's own binding either.
      expect(repeat.defaultPrevented).toBe(true);
    }
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith('cdu1-keys', 'sim/FMS/key_K');
    await unmount();
  });

  it('stops a consumed key reaching the page, so a focused on-screen key cannot also take it', async () => {
    await mount();
    const onPage = jest.fn();
    document.body.addEventListener('keydown', onPage);
    // The DOM clears an event's stop-propagation flag once dispatch ends, so watch the call itself.
    const stopPropagation = jest.spyOn(Event.prototype, 'stopPropagation');
    const event = await keydown({ key: ' ' }, document.body);
    expect(activate).toHaveBeenCalledWith('cdu1-keys', 'sim/FMS/key_space');
    expect(stopPropagation.mock.contexts).toContain(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onPage).not.toHaveBeenCalled();
    stopPropagation.mockRestore();
    document.body.removeEventListener('keydown', onPage);
    await unmount();
  });

  it('lets an unconsumed key (Enter) propagate untouched', async () => {
    await mount();
    const onPage = jest.fn();
    document.body.addEventListener('keydown', onPage);
    const stopPropagation = jest.spyOn(Event.prototype, 'stopPropagation');
    const event = await keydown({ key: 'Enter' }, document.body);
    expect(stopPropagation.mock.contexts).not.toContain(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onPage).toHaveBeenCalledTimes(1);
    stopPropagation.mockRestore();
    document.body.removeEventListener('keydown', onPage);
    await unmount();
  });

  it('removes the listener on unmount: a later keydown sends nothing', async () => {
    await mount();
    await unmount();
    await keydown({ key: 'k' });
    expect(activate).not.toHaveBeenCalled();
  });

  it('sends nothing while the screen shows No FMS', async () => {
    await mount(noFmsSnapshot());
    await keydown({ key: 'k' });
    expect(activate).not.toHaveBeenCalled();
    await unmount();
  });

  it('sends nothing while the screen is unavailable on this aircraft', async () => {
    await mount(unavailableSnapshot());
    await keydown({ key: 'k' });
    expect(activate).not.toHaveBeenCalled();
    await unmount();
  });

  it('sends nothing while waiting for the screen to arrive', async () => {
    await mount(waitingSnapshot());
    await keydown({ key: 'k' });
    expect(activate).not.toHaveBeenCalled();
    await unmount();
  });
});
