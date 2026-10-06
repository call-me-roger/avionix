import { act, render, screen, within } from '@testing-library/react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import type { BindingResults } from '@/domain/aircraft/availability';
import { deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_PROFILE, cduScreenFeatureId } from '@/domain/aircraft/profiles/generic';
import {
  CDU_LINE_COUNT,
  type CduUnit,
  cduExecLight,
  cduStyleLine,
  cduTextLine,
} from '@/domain/cdu/keys';
import { __cduRowRenders, CduScreen } from '@/features/panels/cdu/CduScreen';
import { cduGeometry } from '@/features/panels/cdu/cdu-geometry';
import { useCduScreen } from '@/features/panels/cdu/useCduScreen';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { ThemeProvider } from '@/theme/theme-context';
import { darkTheme } from '@/theme/tokens';
import { style, text } from '../helpers/cdu';

jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));

const reducedMotion = useReducedMotion as jest.Mock;

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const cdu = darkTheme.cdu;

const actions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

/** Every binding a unit's `cdu{n}-screen` feature declares, all 'ok': the generic profile's own shape. */
function screenBindingsOk(unit: CduUnit): BindingResults {
  const results: BindingResults = {};
  const feature = GENERIC_PROFILE.features.find(
    (candidate) => candidate.id === cduScreenFeatureId(unit),
  );
  for (const binding of feature?.bindings ?? []) {
    results[binding.name] = { name: binding.name, kind: binding.kind, status: 'ok' };
  }
  return results;
}

function compatibilityFor(
  overrides: {
    bindings?: BindingResults;
    identity?: AircraftIdentity;
  } = {},
) {
  const bindings = { ...screenBindingsOk(1), ...screenBindingsOk(2), ...overrides.bindings };
  return {
    ...base.compatibility,
    bindings,
    features: deriveAvailability(GENERIC_PROFILE, bindings),
    identity: overrides.identity ?? base.compatibility.identity,
  };
}

interface TelemetryOptions {
  unit: CduUnit;
  /** Line index to text; a line left out of both `lines` and `skipText` is blank. */
  lines?: Record<number, string>;
  skipText?: number[];
  styles?: Record<number, number[]>;
  execLight?: number;
}

function cduTelemetry(options: TelemetryOptions): SessionSnapshot['telemetry'] {
  const { unit, lines = {}, skipText = [], styles = {}, execLight } = options;
  const telemetry: SessionSnapshot['telemetry'] = {};
  for (let line = 0; line < CDU_LINE_COUNT; line += 1) {
    if (!skipText.includes(line)) {
      telemetry[cduTextLine(unit, line)] = { value: text(lines[line] ?? ''), receivedAt: NOW };
    }
    const bytes = styles[line];
    if (bytes !== undefined) {
      telemetry[cduStyleLine(unit, line)] = { value: style(bytes), receivedAt: NOW };
    }
  }
  if (execLight !== undefined) {
    telemetry[cduExecLight(unit)] = { value: execLight, receivedAt: NOW };
  }
  return telemetry;
}

function snapshotFor(
  options: TelemetryOptions & {
    identity?: AircraftIdentity;
    bindings?: BindingResults;
    activity?: SessionSnapshot['health']['activity'];
  },
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
    compatibility: compatibilityFor({ bindings: options.bindings, identity: options.identity }),
    telemetry: cduTelemetry(options),
  };
}

function Probe({ unit }: { unit: CduUnit }) {
  const values = useCduScreen(unit);
  const geometry = useMemo(() => cduGeometry(312), []);
  return (
    <>
      <Text testID="cdu-state">{values.state}</Text>
      <Text testID="cdu-exec-lit">{values.execLit ? 'lit' : 'dark'}</Text>
      <Text testID="cdu-aircraft-name">{values.aircraftName}</Text>
      <Text testID="cdu-stale">{values.stale ? 'stale' : 'fresh'}</Text>
      <CduScreen rows={values.rows} geometry={geometry} stale={values.stale} />
    </>
  );
}

/**
 * I1: deliberately does NOT memoise `geometry` — a fresh, value-equal object every render, which
 * is exactly what Task 6's inline `cduGeometry(glassWidth)` call will hand `CduScreen`. Row
 * memoisation (R4) must hold regardless.
 */
function ProbeFreshGeometry({ unit }: { unit: CduUnit }) {
  const values = useCduScreen(unit);
  const geometry = cduGeometry(312);
  return <CduScreen rows={values.rows} geometry={geometry} stale={values.stale} />;
}

// Shared by default so a `rerender` with a fresh `tree()` call keeps the same ThemeProvider
// `storage` prop: a new memory storage each call would change `setPreference`'s identity and, with
// it, the whole theme context value, defeating every row's React.memo (R4) for an unrelated reason.
const defaultStorage = createMemorySettingsStorage();

function tree(snapshot: SessionSnapshot, unit: CduUnit = 1, storage = defaultStorage) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="dark">
      <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
        <Probe unit={unit} />
      </PanelScope>
    </ThemeProvider>
  );
}

function treeFreshGeometry(snapshot: SessionSnapshot, unit: CduUnit = 1, storage = defaultStorage) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="dark">
      <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
        <ProbeFreshGeometry unit={unit} />
      </PanelScope>
    </ThemeProvider>
  );
}

function stateText(): string {
  return screen.getByTestId('cdu-state').props.children;
}

function execText(): string {
  return screen.getByTestId('cdu-exec-lit').props.children;
}

function aircraftNameText(): string {
  return screen.getByTestId('cdu-aircraft-name').props.children;
}

function staleText(): string {
  return screen.getByTestId('cdu-stale').props.children;
}

beforeEach(() => {
  jest.useFakeTimers();
  reducedMotion.mockReturnValue(false);
  __cduRowRenders.count = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCduScreen / CduScreen', () => {
  it('is waiting while not every text line has a value yet', async () => {
    await render(tree(snapshotFor({ unit: 1, skipText: [10, 11, 12, 13, 14, 15] })));
    expect(stateText()).toBe('waiting');
  });

  it('is live once all 16 lines have a value, drawing 14 rows', async () => {
    await render(tree(snapshotFor({ unit: 1, lines: { 0: '        TOY FMS' } })));
    expect(stateText()).toBe('live');
    const row0 = screen.getByTestId('cdu-row-0');
    expect(row0.props.accessibilityLabel).toBe('TOY FMS');
    expect(screen.getByTestId('cdu-row-13')).toBeTruthy();
    expect(screen.queryByTestId('cdu-row-14')).toBeNull();
    expect(
      screen.getByTestId('cdu-row-1', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
  });

  it('speaks the scratchpad row by name', async () => {
    await render(tree(snapshotFor({ unit: 1, lines: { 13: 'KLAX' } })));
    expect(screen.getByTestId('cdu-row-13').props.accessibilityLabel).toBe('Scratchpad, KLAX');

    await render(tree(snapshotFor({ unit: 1 })));
    expect(screen.getByTestId('cdu-row-13').props.accessibilityLabel).toBe('Scratchpad empty');
  });

  it('draws each cell in the colour, size, reverse and underline its style byte says', async () => {
    await render(
      tree(
        snapshotFor({
          unit: 1,
          lines: { 2: '☐☐☐☐☐' },
          styles: { 2: [0x86, 0xc4, 0x07, 0x97, 0x80] },
        }),
      ),
    );
    const geometry = cduGeometry(312);

    const amberCell = screen.getByTestId('cdu-cell-2-0');
    const amberText = within(amberCell).getByText('☐');
    expect(StyleSheet.flatten(amberText.props.style).color).toBe(cdu.amber);

    const reverseCell = screen.getByTestId('cdu-cell-2-1');
    const reverseText = within(reverseCell).getByText('☐');
    expect(StyleSheet.flatten(reverseCell.props.style).backgroundColor).toBe(cdu.green);
    expect(StyleSheet.flatten(reverseText.props.style).color).toBe(cdu.glass);

    const smallCell = screen.getByTestId('cdu-cell-2-2');
    const smallText = within(smallCell).getByText('☐');
    expect(StyleSheet.flatten(smallText.props.style).fontSize).toBe(geometry.smallFontSize);

    // I2 / spec §4.3 "on the same baseline": the small glyph is shifted down by the geometry's own
    // smallBaselineShift so it lands on the large glyph's baseline once both are centred in the
    // cell; the large glyph itself carries no such shift.
    expect(StyleSheet.flatten(amberText.props.style).transform).toBeUndefined();
    expect(StyleSheet.flatten(smallText.props.style).transform).toEqual([
      { translateY: geometry.smallBaselineShift },
    ]);

    expect(screen.getByTestId('cdu-underline-2-3')).toBeTruthy();

    const blackCell = screen.getByTestId('cdu-cell-2-4');
    const blackText = within(blackCell).getByText('☐');
    expect(StyleSheet.flatten(blackText.props.style).color).toBe(cdu.white);
  });

  it('draws large white when the style line is missing from telemetry', async () => {
    await render(tree(snapshotFor({ unit: 1, lines: { 5: 'X' } })));
    const cell = screen.getByTestId('cdu-cell-5-0');
    const glyph = within(cell).getByText('X');
    const geometry = cduGeometry(312);
    expect(StyleSheet.flatten(glyph.props.style).fontSize).toBe(geometry.fontSize);
    expect(StyleSheet.flatten(glyph.props.style).color).toBe(cdu.white);
  });

  it('flashes a cell on the 1 Hz clock, without re-rendering any row on the tick (M2)', async () => {
    await render(tree(snapshotFor({ unit: 1, lines: { 6: 'F' }, styles: { 6: [0xa7] } })));
    const glyph = () => within(screen.getByTestId('cdu-cell-6-0')).getByText('F');
    expect(StyleSheet.flatten(glyph().props.style).opacity).toBe(1);
    const beforeTick = __cduRowRenders.count;
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(StyleSheet.flatten(glyph().props.style).opacity).toBe(0);
    // M2: only the flashing glyph (`FlashGlyph`, the context consumer) updates on a tick; every
    // `CduRow`, flashing cell's row included, stays memoised and is never invoked again.
    expect(__cduRowRenders.count).toBe(beforeTick);
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(StyleSheet.flatten(glyph().props.style).opacity).toBe(1);
    expect(__cduRowRenders.count).toBe(beforeTick);
  });

  it('runs no timer with nothing on screen to flash', async () => {
    // jest.getTimerCount() cannot be the assertion here: this RN test environment schedules a few
    // timers of its own (confirmed by a bare `render(<View />)` under fake timers), unrelated to
    // CduScreen. Spying on setInterval instead pins exactly the contract that matters: no blink
    // clock is ever started when nothing on screen flashes.
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    await render(tree(snapshotFor({ unit: 1, lines: { 6: 'F' } })));
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('runs no timer when a flash bit sits under a space (M1)', async () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    // Line 7 is left blank (all spaces); only its style carries a flash bit, on a space.
    await render(tree(snapshotFor({ unit: 1, styles: { 7: [0xa0] } })));
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('stops the blink clock once the last flashing cell leaves the screen (M2)', async () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const view = await render(
      tree(snapshotFor({ unit: 1, lines: { 6: 'F' }, styles: { 6: [0xa7] } })),
    );
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    // Same text, style no longer flashing (large white instead of large white + flash).
    await view.rerender(tree(snapshotFor({ unit: 1, lines: { 6: 'F' }, styles: { 6: [0x87] } })));
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('keeps a flashing cell steady under Reduce Motion', async () => {
    reducedMotion.mockReturnValue(true);
    await render(tree(snapshotFor({ unit: 1, lines: { 6: 'F' }, styles: { 6: [0xa7] } })));
    const glyph = within(screen.getByTestId('cdu-cell-6-0')).getByText('F');
    expect(StyleSheet.flatten(glyph.props.style).opacity).toBe(1);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(
      StyleSheet.flatten(within(screen.getByTestId('cdu-cell-6-0')).getByText('F').props.style)
        .opacity,
    ).toBe(1);
  });

  it('adds rows 14-15 once either shows a character, and keeps them for the session', async () => {
    const view = await render(tree(snapshotFor({ unit: 1, lines: { 14: 'EXTRA' } })));
    expect(screen.getByTestId('cdu-row-15', { includeHiddenElements: true })).toBeTruthy();
    await view.rerender(tree(snapshotFor({ unit: 1 })));
    expect(screen.getByTestId('cdu-row-15', { includeHiddenElements: true })).toBeTruthy();
  });

  it('re-renders only the row whose text or style changed (R4)', async () => {
    const lines = { 0: 'A', 1: 'B', 13: 'ONE' };
    const view = await render(tree(snapshotFor({ unit: 1, lines })));
    // The theme settles (ThemeProvider's `ready` flips after mount) shortly after the initial
    // render, re-rendering every row once more: counted here, not as part of the R4 delta below.
    const afterFirst = __cduRowRenders.count;
    await view.rerender(tree(snapshotFor({ unit: 1, lines: { ...lines, 13: 'TWO' } })));
    expect(__cduRowRenders.count - afterFirst).toBe(1);
  });

  it('holds R4 even when the caller rebuilds a value-equal geometry object every render (I1)', async () => {
    const lines = { 0: 'A', 1: 'B', 13: 'ONE' };
    const view = await render(treeFreshGeometry(snapshotFor({ unit: 1, lines })));
    const afterFirst = __cduRowRenders.count;
    await view.rerender(
      treeFreshGeometry(snapshotFor({ unit: 1, lines: { ...lines, 13: 'TWO' } })),
    );
    expect(__cduRowRenders.count - afterFirst).toBe(1);
  });

  it('shows noFms when every line has been blank since identification, naming the aircraft', async () => {
    await render(
      tree(
        snapshotFor({
          unit: 1,
          identity: {
            icaoType: 'B738',
            description: 'Boeing 737-800',
            tailNumber: null,
            addOnVersion: null,
          },
        }),
      ),
    );
    expect(stateText()).toBe('noFms');
    expect(aircraftNameText()).toBe('Boeing 737-800');
  });

  it('falls back to the ICAO type, then "This aircraft", when naming an aircraft with no FMS output', async () => {
    await render(
      tree(
        snapshotFor({
          unit: 1,
          identity: { icaoType: 'B738', description: null, tailNumber: null, addOnVersion: null },
        }),
      ),
    );
    expect(aircraftNameText()).toBe('B738');

    await render(
      tree(
        snapshotFor({
          unit: 1,
          identity: { icaoType: null, description: null, tailNumber: null, addOnVersion: null },
        }),
      ),
    );
    expect(aircraftNameText()).toBe('This aircraft');
  });

  it('stays live once the screen goes blank again (a powered-down CDU)', async () => {
    const view = await render(tree(snapshotFor({ unit: 1, lines: { 0: 'ACTIVE' } })));
    expect(stateText()).toBe('live');
    await view.rerender(tree(snapshotFor({ unit: 1 })));
    expect(stateText()).toBe('live');
  });

  it('treats a new aircraft as no FMS even after the previous one was live', async () => {
    const identityA: AircraftIdentity = {
      icaoType: 'B738',
      description: 'Boeing 737-800',
      tailNumber: null,
      addOnVersion: null,
    };
    const identityB: AircraftIdentity = {
      icaoType: 'A20N',
      description: 'Airbus A320neo',
      tailNumber: null,
      addOnVersion: null,
    };
    const view = await render(
      tree(snapshotFor({ unit: 1, identity: identityA, lines: { 0: 'ACTIVE' } })),
    );
    expect(stateText()).toBe('live');
    await view.rerender(tree(snapshotFor({ unit: 1, identity: identityB })));
    expect(stateText()).toBe('noFms');
  });

  it('keeps unit 1\'s own "live" and rows-14-15 memory across a round trip through unit 2 (ruling)', async () => {
    const identity: AircraftIdentity = {
      icaoType: 'B738',
      description: 'Boeing 737-800',
      tailNumber: null,
      addOnVersion: null,
    };
    const view = await render(
      tree(snapshotFor({ unit: 1, identity, lines: { 0: 'ACTIVE', 14: 'EXTRA' } }), 1),
    );
    expect(stateText()).toBe('live');
    expect(screen.getByTestId('cdu-row-15', { includeHiddenElements: true })).toBeTruthy();

    // Switch to CDU 2: a different, never-seen unit on the same aircraft starts at noFms.
    await view.rerender(tree(snapshotFor({ unit: 2, identity }), 2));
    expect(stateText()).toBe('noFms');

    // Switch back to CDU 1, now blank: the brief's key (unit + identity) would reset unit 1 here;
    // the ruling keeps its memory per unit, so it stays live with rows 14-15 still drawn.
    await view.rerender(tree(snapshotFor({ unit: 1, identity }), 1));
    expect(stateText()).toBe('live');
    expect(screen.getByTestId('cdu-row-15', { includeHiddenElements: true })).toBeTruthy();
  });

  it('is unavailable when the screen feature is unavailable on this aircraft', async () => {
    const bindings: BindingResults = {
      [cduTextLine(1, 0)]: { name: cduTextLine(1, 0), kind: 'dataref', status: 'missing' },
    };
    await render(tree(snapshotFor({ unit: 1, bindings })));
    expect(stateText()).toBe('unavailable');
  });

  it('is not unavailable merely because optional style bindings are missing (partial, M3)', async () => {
    const bindings: BindingResults = {
      [cduStyleLine(1, 0)]: { name: cduStyleLine(1, 0), kind: 'dataref', status: 'missing' },
    };
    const feature = compatibilityFor({ bindings }).features.find(
      (candidate) => candidate.id === cduScreenFeatureId(1),
    );
    expect(feature?.status).toBe('partial');
    await render(tree(snapshotFor({ unit: 1, bindings, lines: { 0: 'ACTIVE' } })));
    expect(stateText()).toBe('live');
  });

  it('is stale, and dims the screen, when values are not current', async () => {
    await render(tree(snapshotFor({ unit: 1, activity: 'stalled' })));
    expect(staleText()).toBe('stale');
    const root = screen.getByTestId('cdu-screen');
    expect(StyleSheet.flatten(root.props.style).opacity).toBe(0.5);
  });

  it("lights EXEC from each unit's own light, ignoring the other unit's (M4)", async () => {
    await render(tree(snapshotFor({ unit: 1, execLight: 1 }), 1));
    expect(execText()).toBe('lit');

    // Unit 1's light is set; reading unit 2 must ignore the pilot's light.
    await render(tree(snapshotFor({ unit: 1, execLight: 1 }), 2));
    expect(execText()).toBe('dark');

    await render(tree(snapshotFor({ unit: 2, execLight: 1 }), 2));
    expect(execText()).toBe('lit');

    // Unit 2's light is set; reading unit 1 must ignore the copilot's light.
    await render(tree(snapshotFor({ unit: 2, execLight: 1 }), 1));
    expect(execText()).toBe('dark');

    await render(tree(snapshotFor({ unit: 1 }), 1));
    expect(execText()).toBe('dark');
  });

  it('reads unit 2 from its own fms_cdu2_* lines only', async () => {
    const snapshot: SessionSnapshot = {
      ...snapshotFor({ unit: 2, lines: { 0: 'UNIT TWO' } }),
    };
    snapshot.telemetry[cduTextLine(1, 0)] = { value: text('UNIT ONE'), receivedAt: NOW };
    await render(tree(snapshot, 2));
    expect(screen.getByTestId('cdu-row-0').props.accessibilityLabel).toBe('UNIT TWO');
  });
});
