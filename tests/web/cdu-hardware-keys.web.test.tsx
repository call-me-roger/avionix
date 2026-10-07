import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { ActivationResult } from '@/domain/panels/activation';
import { CduPanel } from '@/features/panels/cdu/CduPanel';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { ThemeProvider } from '@/theme/theme-context';

import { toyScreenTelemetry } from '../helpers/cdu';

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

  async function mount(): Promise<void> {
    await act(async () => {
      root.render(
        <ThemeProvider storage={THEME_STORAGE} systemSchemeOverride="light">
          <PanelScope snapshot={liveSnapshot()} now={NOW} actions={actions}>
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

  it('removes the listener on unmount: a later keydown sends nothing', async () => {
    await mount();
    await unmount();
    await keydown({ key: 'k' });
    expect(activate).not.toHaveBeenCalled();
  });
});
