import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import { type BindingResults, deriveAvailability } from '@/domain/aircraft/availability';
import {
  FEATURE_CDU1_KEYS,
  FEATURE_CDU1_SCREEN,
  FEATURE_CDU2_KEYS,
  FEATURE_CDU2_SCREEN,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { SLOW_KEY_MS } from '@/domain/cdu/key-queue';
import { CDU_LINE_COUNT, cduTextLine } from '@/domain/cdu/keys';
import type { ActivationResult } from '@/domain/panels/activation';
import { EVERYWHERE } from '@/domain/panels/panel';
import { CDU_STORAGE_KEY } from '@/features/panels/cdu/cdu-preference';
import { CDU_PANEL, CduPanel } from '@/features/panels/cdu/CduPanel';
import { CduPreferenceProvider } from '@/features/panels/cdu/CduPreferenceProvider';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { ThemeProvider } from '@/theme/theme-context';

import { text, toyScreenTelemetry } from '../helpers/cdu';

const NOW = 1_000_000;
/** The light bar is hidden from accessibility (the key's label speaks it). */
const HIDDEN = { includeHiddenElements: true };
const base = initialSnapshot(GENERIC_PROFILE, 5);

type Status = 'ok' | 'missing';

/** Every binding the four CDU features declare, 'ok' unless overridden, through the real deriver. */
function cduBindings(overrides: Record<string, Status> = {}): BindingResults {
  const results: BindingResults = {};
  for (const id of [
    FEATURE_CDU1_SCREEN,
    FEATURE_CDU1_KEYS,
    FEATURE_CDU2_SCREEN,
    FEATURE_CDU2_KEYS,
  ]) {
    const feature = GENERIC_PROFILE.features.find((candidate) => candidate.id === id);
    for (const binding of feature?.bindings ?? []) {
      results[binding.name] = {
        name: binding.name,
        kind: binding.kind,
        status: overrides[binding.name] ?? 'ok',
      };
    }
  }
  return results;
}

function compatibilityFor(overrides: Record<string, Status> = {}, identity?: AircraftIdentity) {
  const bindings = cduBindings(overrides);
  return {
    ...base.compatibility,
    bindings,
    features: deriveAvailability(GENERIC_PROFILE, bindings),
    identity: identity ?? base.compatibility.identity,
  };
}

function live(
  options: {
    overrides?: Record<string, Status>;
    identity?: AircraftIdentity;
    telemetry?: SessionSnapshot['telemetry'];
    activity?: SessionSnapshot['health']['activity'];
  } = {},
): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: {
      ...base.health,
      activity: options.activity ?? 'running',
      live: true,
      lastHeartbeatAt: NOW,
    },
    compatibility: compatibilityFor(options.overrides, options.identity),
    telemetry: options.telemetry ?? {
      ...toyScreenTelemetry(1, NOW),
      ...toyScreenTelemetry(2, NOW),
    },
  };
}

function deferredActivation() {
  let resolve!: (result: ActivationResult) => void;
  const promise = new Promise<ActivationResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let pending: ReturnType<typeof deferredActivation>[] = [];

const activate = jest.fn((_featureId: string, _command: string) => {
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

/** One theme storage for every tree, so a `rerender` never hands ThemeProvider a new one. */
const THEME_STORAGE = createMemorySettingsStorage();

function tree(snapshot: SessionSnapshot, storage: SettingsStorage | null = null) {
  const panel = (
    <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
      <CduPanel />
    </PanelScope>
  );
  return (
    <ThemeProvider storage={THEME_STORAGE} systemSchemeOverride="light">
      {storage === null ? (
        panel
      ) : (
        <CduPreferenceProvider storage={storage}>{panel}</CduPreferenceProvider>
      )}
    </ThemeProvider>
  );
}

function sentCommands(): string[] {
  return activate.mock.calls.map((call) => call[1]);
}

function isDisabled(label: string): boolean {
  return screen.getByLabelText(label).props.accessibilityState?.disabled === true;
}

/** The nearest ancestor (or the element itself) whose flattened style sets `key`. */
type Element = ReturnType<typeof screen.getByLabelText>;

function styledAncestor(element: Element, key: string): Record<string, unknown> {
  let current: Element | null = element;
  while (current !== null) {
    const style = StyleSheet.flatten(current.props.style) as Record<string, unknown> | undefined;
    if (style !== undefined && style !== null && key in style) {
      return style;
    }
    current = current.parent;
  }
  throw new Error(`no ancestor sets ${key}`);
}

async function withWindow(width: number, height: number, run: () => Promise<void>) {
  const original = Dimensions.get('window');
  Dimensions.set({ window: { width, height, scale: 1, fontScale: 1 } });
  try {
    await run();
  } finally {
    await act(async () => {
      Dimensions.set({ window: original });
    });
  }
}

beforeEach(() => {
  pending = [];
  activate.mockClear();
});

describe('CDU panel descriptor', () => {
  it('declares the four CDU features and fits everywhere', () => {
    expect(CDU_PANEL.id).toBe('cdu');
    expect(CDU_PANEL.title).toBe('CDU');
    expect(CDU_PANEL.supports).toEqual(EVERYWHERE);
    expect([...CDU_PANEL.features].sort()).toEqual(
      [FEATURE_CDU1_SCREEN, FEATURE_CDU1_KEYS, FEATURE_CDU2_SCREEN, FEATURE_CDU2_KEYS].sort(),
    );
  });
});

describe('CDU panel keys', () => {
  it('sends K, L, A, X in press order, one at a time', async () => {
    await render(tree(live()));
    for (const letter of ['K', 'L', 'A', 'X']) {
      await fireEvent.press(screen.getByLabelText(letter));
    }
    expect(sentCommands()).toEqual(['sim/FMS/key_K']);
    await resolveNext('ok');
    expect(sentCommands()).toEqual(['sim/FMS/key_K', 'sim/FMS/key_L']);
    await resolveNext('ok');
    expect(sentCommands()).toEqual(['sim/FMS/key_K', 'sim/FMS/key_L', 'sim/FMS/key_A']);
    await resolveNext('ok');
    expect(sentCommands()).toEqual([
      'sim/FMS/key_K',
      'sim/FMS/key_L',
      'sim/FMS/key_A',
      'sim/FMS/key_X',
    ]);
    expect(activate).toHaveBeenCalledWith('cdu1-keys', 'sim/FMS/key_K');
  });

  it('sends L twice while the first press is still unanswered (Review Focus 1)', async () => {
    const { rerender } = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('L'));
    // The session marks the first press pending on its target, as it does for every activation;
    // a repeatable key must stay pressable regardless.
    const inFlight: SessionSnapshot = {
      ...live(),
      operations: {
        'sim/FMS/key_L': { status: 'pending', failure: null, refusal: null, at: NOW },
      },
    };
    await rerender(tree(inFlight));
    expect(isDisabled('L')).toBe(false);
    await fireEvent.press(screen.getByLabelText('L'));
    await resolveNext('ok');
    expect(sentCommands()).toEqual(['sim/FMS/key_L', 'sim/FMS/key_L']);
  });

  it('places LSK 1L on rows 1 and 2 and sends ls_1l', async () => {
    await render(tree(live()));
    const lsk = screen.getByLabelText('Line select left 1');
    // The row height is the glass's own; rows start under the glass's 1 dp top border.
    const style = styledAncestor(lsk, 'top');
    const rowHeight = Number(
      StyleSheet.flatten(screen.getByTestId('cdu-row-0').props.style).height,
    );
    expect(rowHeight).toBeGreaterThanOrEqual(24);
    expect(style.top).toBe(1 + rowHeight);
    expect(style.height).toBe(2 * rowHeight);
    const lsk6 = styledAncestor(screen.getByLabelText('Line select right 6'), 'top');
    expect(lsk6.top).toBe(1 + 11 * rowHeight);
    await fireEvent.press(lsk);
    expect(sentCommands()).toEqual(['sim/FMS/ls_1l']);
  });

  it('lights EXEC with the EXEC light and speaks it', async () => {
    const lit = live({
      telemetry: { ...toyScreenTelemetry(1, NOW, { execLight: 1 }) },
    });
    const { rerender } = await render(tree(lit));
    const exec = screen.getByLabelText('EXEC, light on');
    expect(within(exec).getByTestId('light-bar-lit', HIDDEN)).toBeTruthy();
    // The same instance, the light going out.
    await rerender(tree(live()));
    const dark = screen.getByLabelText('EXEC');
    expect(within(dark).getByTestId('light-bar-off', HIDDEN)).toBeTruthy();
    expect(screen.queryByLabelText('EXEC, light on')).toBeNull();
  });

  it('disables a key whose command is missing and counts it once', async () => {
    await render(tree(live({ overrides: { 'sim/FMS/key_Q': 'missing' } })));
    expect(screen.queryByLabelText('Q')).toBeNull();
    expect(isDisabled('Q, not available on this aircraft')).toBe(true);
    expect(screen.getByTestId('cdu-missing')).toHaveTextContent(
      "1 key isn't available on this aircraft.",
    );
    expect(isDisabled('W')).toBe(false);
    await fireEvent.press(screen.getByLabelText('W'));
    expect(sentCommands()).toEqual(['sim/FMS/key_W']);
  });

  it('shows no missing-key line when every command is there', async () => {
    await render(tree(live()));
    expect(screen.queryByTestId('cdu-missing')).toBeNull();
  });

  it('disables every key and shows NOT LIVE while values are not current', async () => {
    await render(tree(live({ activity: 'stalled' })));
    expect(screen.getByText('NOT LIVE')).toBeTruthy();
    for (const label of ['K', 'EXEC', 'Line select left 1', 'Line select right 6', 'Clear']) {
      expect(isDisabled(label)).toBe(true);
    }
    await fireEvent.press(screen.getByLabelText('K'));
    expect(activate).not.toHaveBeenCalled();
  });

  it('lights SLOW on the bezel after a slow answer', async () => {
    jest.useFakeTimers();
    try {
      await render(tree(live()));
      expect(screen.queryByLabelText('Link slow')).toBeNull();
      await fireEvent.press(screen.getByLabelText('K'));
      await act(async () => {
        jest.advanceTimersByTime(SLOW_KEY_MS + 100);
      });
      await resolveNext('ok');
      expect(screen.getByLabelText('Link slow')).toHaveTextContent('SLOW');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows no NOT LIVE tag while values are current', async () => {
    await render(tree(live()));
    expect(screen.queryByText('NOT LIVE')).toBeNull();
  });

  it('shows a failed key in the message line, never as a per-key notice', async () => {
    await render(tree(live()));
    // No message, no line: it takes no height until there is something to say.
    expect(screen.queryByTestId('cdu-message')).toBeNull();
    await fireEvent.press(screen.getByLabelText('K'));
    await fireEvent.press(screen.getByLabelText('L'));
    await resolveNext('failed');
    expect(screen.getByTestId('cdu-message')).toHaveTextContent(
      "X-Plane didn't take the K key. The key after it wasn't sent.",
    );
    expect(screen.getAllByText(/X-Plane didn't take/)).toHaveLength(1);
    expect(screen.queryByText(/Not sent:/)).toBeNull();
  });
});

describe('CDU 1 / CDU 2', () => {
  it('switches to CDU 2: its keys, its screen, and the saved preference', async () => {
    const storage = createMemorySettingsStorage();
    await render(tree(live(), storage));
    expect(screen.getByLabelText('CDU 1').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByLabelText('TOY FMS')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('CDU 2'));
    expect(screen.getByLabelText('CDU 2').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByLabelText('TOY FMS 2')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('K'));
    expect(activate).toHaveBeenCalledWith('cdu2-keys', 'sim/FMS2/key_K');
    await waitFor(async () =>
      expect(await storage.getItem(CDU_STORAGE_KEY)).toBe(JSON.stringify({ unit: 2 })),
    );
  });

  it('starts on CDU 2 when that is the stored choice', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(CDU_STORAGE_KEY, JSON.stringify({ unit: 2 }));
    await render(tree(live(), storage));
    await waitFor(() =>
      expect(screen.getByLabelText('CDU 2').props.accessibilityState?.selected).toBe(true),
    );
    expect(screen.getByLabelText('TOY FMS 2')).toBeTruthy();
  });

  it('shows CDU 1 without overwriting a stored CDU 2 that this X-Plane does not publish', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(CDU_STORAGE_KEY, JSON.stringify({ unit: 2 }));
    const snapshot = live({ overrides: { [cduTextLine(2, 0)]: 'missing' } });
    const { rerender } = await render(tree(snapshot, storage));
    // Let the stored choice arrive; the shown unit must stay CDU 1 regardless.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const cdu2 = screen.getByLabelText("CDU 2. This X-Plane doesn't publish the CDU 2 screen.");
    expect(cdu2.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText('CDU 1').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByLabelText('TOY FMS')).toBeTruthy();
    expect(await storage.getItem(CDU_STORAGE_KEY)).toBe(JSON.stringify({ unit: 2 }));
    // Proof the stored 2 was loaded and kept, not merely never read: once this X-Plane publishes
    // CDU 2, the panel shows it without anyone pressing a key.
    await rerender(tree(live(), storage));
    await waitFor(() =>
      expect(screen.getByLabelText('CDU 2').props.accessibilityState?.selected).toBe(true),
    );
    expect(screen.getByLabelText('TOY FMS 2')).toBeTruthy();
  });
});

describe('CDU panel states', () => {
  it('names the aircraft when nothing is on the built-in CDU', async () => {
    const blank: SessionSnapshot['telemetry'] = {};
    for (let line = 0; line < CDU_LINE_COUNT; line += 1) {
      blank[cduTextLine(1, line)] = { value: text(''), receivedAt: NOW };
    }
    await render(
      tree(
        live({
          telemetry: blank,
          identity: {
            description: 'Zibo 737-800',
            icaoType: 'B738',
            tailNumber: null,
            addOnVersion: null,
          },
        }),
      ),
    );
    const noFms = screen.getByTestId('cdu-no-fms');
    expect(noFms).toHaveTextContent(
      /Zibo 737-800 isn't showing anything on X-Plane's built-in CDU\./,
    );
    expect(noFms).toHaveTextContent(
      /Add-on FMSs such as Zibo's or ToLiss's aren't supported yet\. If the aircraft is powered down, the CDU appears when it powers up\./,
    );
    expect(screen.queryByLabelText('K')).toBeNull();
    expect(screen.queryByTestId('cdu-screen')).toBeNull();
    expect(screen.getByLabelText('CDU 1')).toBeTruthy();
    expect(screen.getByLabelText('CDU 2')).toBeTruthy();
  });

  it('says this X-Plane does not publish the screen, with no keys', async () => {
    await render(
      tree(live({ overrides: { [cduTextLine(1, 0)]: 'missing', [cduTextLine(2, 0)]: 'missing' } })),
    );
    expect(screen.getByText("This X-Plane doesn't publish the CDU 1 screen.")).toBeTruthy();
    expect(screen.queryByLabelText('K')).toBeNull();
    expect(screen.queryByTestId('cdu-screen')).toBeNull();
  });

  it('waits for the screen with the glass drawn and the keys disabled', async () => {
    const partial: SessionSnapshot['telemetry'] = {};
    partial[cduTextLine(1, 0)] = { value: text('        TOY FMS'), receivedAt: NOW };
    await render(tree(live({ telemetry: partial })));
    expect(screen.getByTestId('cdu-screen')).toBeTruthy();
    expect(screen.getByText('Waiting for the CDU screen…')).toBeTruthy();
    expect(isDisabled('K')).toBe(true);
    expect(isDisabled('Line select left 1')).toBe(true);
    expect(screen.queryByLabelText('TOY FMS')).toBeNull();
  });
});

describe('CDU panel screen memory (spec §4.4)', () => {
  const aircraftA: AircraftIdentity = {
    description: 'Laminar 737-800',
    icaoType: 'B738',
    tailNumber: 'N737XP',
    addOnVersion: null,
  };
  const aircraftB: AircraftIdentity = {
    description: 'Zibo 737-800',
    icaoType: 'B738',
    tailNumber: 'N738ZB',
    addOnVersion: null,
  };

  /** CDU 1 and CDU 2 both connected, every text line blank: a powered-down (or add-on) FMS. */
  function blankTelemetry(): SessionSnapshot['telemetry'] {
    const blank: SessionSnapshot['telemetry'] = {};
    for (const unit of [1, 2] as const) {
      for (let line = 0; line < CDU_LINE_COUNT; line += 1) {
        blank[cduTextLine(unit, line)] = { value: text(''), receivedAt: NOW };
      }
    }
    return blank;
  }

  /** The shell's shape: the provider stays mounted while the panel comes and goes. */
  function shell(snapshot: SessionSnapshot, storage: SettingsStorage, panelShown: boolean) {
    return (
      <ThemeProvider storage={THEME_STORAGE} systemSchemeOverride="light">
        <CduPreferenceProvider storage={storage}>
          {panelShown ? (
            <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
              <CduPanel />
            </PanelScope>
          ) : null}
        </CduPreferenceProvider>
      </ThemeProvider>
    );
  }

  it('stays live after the panel unmounts and comes back to a blank screen on the same aircraft', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(shell(live({ identity: aircraftA }), storage, true));
    expect(screen.getByTestId('cdu-screen')).toBeTruthy();
    await view.rerender(shell(live({ identity: aircraftA }), storage, false));
    expect(screen.queryByTestId('cdu-screen')).toBeNull();
    await view.rerender(
      shell(live({ identity: aircraftA, telemetry: blankTelemetry() }), storage, true),
    );
    expect(screen.queryByTestId('cdu-no-fms')).toBeNull();
    expect(screen.getByTestId('cdu-screen')).toBeTruthy();
    expect(isDisabled('K')).toBe(false);
  });

  it('shows No FMS when the panel comes back to a blank screen on a different aircraft', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(shell(live({ identity: aircraftA }), storage, true));
    expect(screen.getByTestId('cdu-screen')).toBeTruthy();
    await view.rerender(shell(live({ identity: aircraftA }), storage, false));
    await view.rerender(
      shell(live({ identity: aircraftB, telemetry: blankTelemetry() }), storage, true),
    );
    expect(screen.getByTestId('cdu-no-fms')).toHaveTextContent(
      /Zibo 737-800 isn't showing anything on X-Plane's built-in CDU\./,
    );
    expect(screen.queryByLabelText('K')).toBeNull();
  });
});

describe('CDU panel layout', () => {
  it('pins the screen above a scrolling key area on a narrow window', async () => {
    await withWindow(390, 844, async () => {
      await render(tree(live()));
      const scroll = screen.getByTestId('cdu-keys-scroll');
      expect(within(scroll).getByLabelText('K')).toBeTruthy();
      expect(within(scroll).queryByTestId('cdu-screen')).toBeNull();
      expect(screen.getByTestId('cdu-screen')).toBeTruthy();
      expect(screen.queryByTestId('cdu-wide-left')).toBeNull();
      // The frame does not scroll this panel: the key area takes whatever height is left.
      expect(StyleSheet.flatten(scroll.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
      // 358 dp of content cannot hold 8 keys side by side: alpha above numeric.
      expect(screen.getByTestId('cdu-blocks').props.style).toEqual(
        expect.objectContaining({ flexDirection: 'column' }),
      );
    });
  });

  it('lays the unit and the keys out in two columns on a wide window', async () => {
    await withWindow(1024, 768, async () => {
      await render(tree(live()));
      const left = screen.getByTestId('cdu-wide-left');
      const right = screen.getByTestId('cdu-wide-right');
      // Each column scrolls on its own.
      const unitScroll = within(left).getByTestId('cdu-unit-scroll');
      const keysScroll = within(right).getByTestId('cdu-keys-scroll');
      expect(within(unitScroll).getByTestId('cdu-screen')).toBeTruthy();
      expect(within(keysScroll).getByLabelText('K')).toBeTruthy();
      expect(StyleSheet.flatten(unitScroll.props.style)).toEqual(
        expect.objectContaining({ flex: 1 }),
      );
      expect(StyleSheet.flatten(keysScroll.props.style)).toEqual(
        expect.objectContaining({ flex: 1 }),
      );
      expect(screen.getByTestId('cdu-blocks').props.style).toEqual(
        expect.objectContaining({ flexDirection: 'row' }),
      );
    });
  });

  it('is wide on a landscape phone, by the window, though the rail leaves ~600 dp of content', async () => {
    await withWindow(844, 390, async () => {
      await render(tree(live()));
      await fireEvent(screen.getByTestId('cdu-panel'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 600, height: 300 } },
      });
      expect(screen.getByTestId('cdu-wide-left')).toBeTruthy();
      expect(screen.getByTestId('cdu-wide-right')).toBeTruthy();
      // The glass is sized from the measured half column, so its rows sit at the 24 dp floor.
      expect(StyleSheet.flatten(screen.getByTestId('cdu-row-0').props.style).height).toBe(24);
    });
  });

  it('gives every key a compact legend that shrinks to fit instead of breaking a word', async () => {
    await withWindow(390, 844, async () => {
      await render(tree(live()));
      const hold = within(screen.getByLabelText('Hold')).getByText('HOLD');
      expect(hold.props.adjustsFontSizeToFit).toBe(true);
      expect(hold.props.minimumFontScale).toBe(0.7);
      expect(hold.props.numberOfLines).toBe(1);
      const dirIntc = within(screen.getByLabelText('Direct intercept')).getByText('DIR\nINTC');
      expect(dirIntc.props.numberOfLines).toBe(2);
      // Narrow side padding, the 48 dp minimum kept.
      const face = StyleSheet.flatten(screen.getByLabelText('Hold').props.style);
      expect(face.paddingHorizontal).toBe(4);
      expect(face.minHeight).toBe(48);
      expect(face.minWidth).toBe(48);
    });
  });

  it("puts the unit keys on the bezel's label row", async () => {
    await render(tree(live()));
    const label = screen.getByText('CDU');
    const row = label.parent;
    expect(row).not.toBeNull();
    const labelRow = row as NonNullable<typeof row>;
    // A row of its own (not the bezel's column), holding the unit keys beside the label.
    expect(StyleSheet.flatten(labelRow.props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row' }),
    );
    expect(within(labelRow).getByLabelText('CDU 1')).toBeTruthy();
    expect(within(labelRow).getByLabelText('CDU 2')).toBeTruthy();
  });

  async function layout(testID: string, width: number, height: number) {
    await fireEvent(screen.getByTestId(testID), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  }

  it('scrolls bezel and keys together when pinning would leave under two key rows', async () => {
    await withWindow(390, 844, async () => {
      await render(tree(live()));
      // Pinned until both heights are known.
      expect(screen.getByTestId('cdu-keys-scroll')).toBeTruthy();
      expect(screen.queryByTestId('cdu-panel-scroll')).toBeNull();
      // H 450 − B 420 − 8 = 22 dp: less than two 56 dp key rows.
      await layout('cdu-panel', 358, 450);
      await layout('cdu-bezel', 358, 420);
      const scroll = screen.getByTestId('cdu-panel-scroll');
      expect(within(scroll).getByTestId('cdu-screen')).toBeTruthy();
      expect(within(scroll).getByLabelText('K')).toBeTruthy();
      // No nested key scroll inside the single one.
      expect(screen.queryByTestId('cdu-keys-scroll')).toBeNull();
      // The same two elements are measured in the scrolling mode, with the same heights (the root
      // fills the frame, the bezel is the bezel): reporting them again keeps the choice.
      await layout('cdu-panel', 358, 450);
      await layout('cdu-bezel', 358, 420);
      expect(screen.getByTestId('cdu-panel-scroll')).toBeTruthy();
      expect(screen.queryByTestId('cdu-keys-scroll')).toBeNull();
    });
  });

  it('stays pinned when the frame leaves room for the keys', async () => {
    await withWindow(390, 844, async () => {
      await render(tree(live()));
      // H 700 − B 420 − 8 = 272 dp: several key rows.
      await layout('cdu-panel', 358, 700);
      await layout('cdu-bezel', 358, 420);
      expect(screen.queryByTestId('cdu-panel-scroll')).toBeNull();
      const keys = screen.getByTestId('cdu-keys-scroll');
      expect(within(keys).getByLabelText('K')).toBeTruthy();
      expect(within(keys).queryByTestId('cdu-screen')).toBeNull();
      // Reporting the same heights from the pinned structure keeps it pinned.
      await layout('cdu-panel', 358, 700);
      await layout('cdu-bezel', 358, 420);
      expect(screen.getByTestId('cdu-keys-scroll')).toBeTruthy();
      expect(screen.queryByTestId('cdu-panel-scroll')).toBeNull();
    });
  });

  it('scrolls the no-keys states, which the fixed frame does not', async () => {
    const blank: SessionSnapshot['telemetry'] = {};
    for (let line = 0; line < CDU_LINE_COUNT; line += 1) {
      blank[cduTextLine(1, line)] = { value: text(''), receivedAt: NOW };
    }
    await render(tree(live({ telemetry: blank })));
    const scroll = screen.getByTestId('cdu-state-scroll');
    expect(within(scroll).getByTestId('cdu-no-fms')).toBeTruthy();
    expect(StyleSheet.flatten(scroll.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
  });
});

describe('CDU panel announcements', () => {
  it('announces a new message and the missing-keys line outright, not only by live region', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    try {
      await render(tree(live({ overrides: { 'sim/FMS/key_Q': 'missing' } })));
      expect(announce).toHaveBeenCalledWith("1 key isn't available on this aircraft.");
      announce.mockClear();
      await fireEvent.press(screen.getByLabelText('K'));
      await resolveNext('failed');
      const message = "X-Plane didn't take the K key.";
      expect(screen.getByTestId('cdu-message')).toHaveTextContent(message);
      expect(screen.getByTestId('cdu-message').props.accessibilityLiveRegion).toBe('polite');
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(message);
    } finally {
      announce.mockRestore();
    }
  });
});
