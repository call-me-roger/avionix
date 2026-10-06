import { render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, processColor } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { NOT_LIVE_OPACITY } from '@/features/panels/instruments/InstrumentFace';
import { PfdView } from '@/features/panels/instruments/pfd/PfdView';
import { instrumentRenders } from '@/features/panels/instruments/svg-parts';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { AVIONICS_FAMILIES } from '@/theme/fonts';
import { ThemeProvider } from '@/theme/theme-context';
import { darkTheme } from '@/theme/tokens';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

const VALUES: Record<string, number | number[]> = {
  [D.airspeed]: 112.4,
  [D.mach]: 0.18,
  [D.altitude]: 4524,
  [D.verticalSpeed]: 503,
  [D.heading]: 270.2,
  [D.pitch]: 3.2,
  [D.roll]: 15.4,
  [D.turnRate]: 24,
  [D.slip]: 2.2,
  [D.radioAltitude]: 3000,
  [D.engineType]: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [D.vso]: 40,
  [D.vs]: 48,
  [D.vfe]: 85,
  [D.vno]: 129,
  [D.vne]: 163,
  [D.barometer]: 29.92,
};

function telemetry(values: Record<string, number | number[] | string>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: telemetry(VALUES),
    ...overrides,
  };
}

function withMissing(snapshot: SessionSnapshot, ...names: string[]): SessionSnapshot {
  const bindings = { ...snapshot.compatibility.bindings };
  for (const name of names) {
    bindings[name] = { name, kind: 'dataref', status: 'missing' };
  }
  return { ...snapshot, compatibility: { ...snapshot.compatibility, bindings } };
}

// The Mach, altimeter-setting and radio-altitude boxes are hidden from screen readers (the airspeed
// and altitude labels read them aloud), so the queries that find them must include hidden elements.
const HIDDEN = { includeHiddenElements: true };

const actions = { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };

function tree(
  snapshot: SessionSnapshot,
  storage = createMemorySettingsStorage(),
  fontsLoaded = false,
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="dark" fontsLoaded={fontsLoaded}>
      <UnitsProvider storage={storage}>
        <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
          <PfdView width={360} />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const FACES = [
  'instrument-airspeed',
  'instrument-attitude',
  'instrument-altitude',
  'instrument-vertical-speed',
  'instrument-heading',
  'instrument-turn',
];

function resetRenders() {
  for (const key of Object.keys(instrumentRenders)) {
    instrumentRenders[key] = 0;
  }
}

describe('PFD', () => {
  it('names every instrument exactly as the six-pack does', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();
    expect(
      screen.getByLabelText('Attitude: pitch 3 degrees up, bank 15 degrees right'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Altitude 4,520 feet, altimeter 29.92 inches, standard'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Turn: rate 1.2 standard rate right, ball 2 degrees right'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Heading 270 degrees')).toBeTruthy();
    expect(screen.getByLabelText('Vertical speed climbing 500 feet per minute')).toBeTruthy();
  });

  it('shows the altimeter setting below the altitude tape in the chosen unit', async () => {
    await render(tree(live()));
    expect(screen.getByText('29.92 inHg STD', HIDDEN)).toBeTruthy();
  });

  it('shows Mach from 0.40 only', async () => {
    const snapshot = live();
    await render(tree(snapshot));
    expect(screen.queryByText(/^M /, HIDDEN)).toBeNull();
    await render(
      tree({
        ...snapshot,
        telemetry: {
          ...snapshot.telemetry,
          ...telemetry({ [D.mach]: 0.782, [D.airspeed]: 280 }),
        },
      }),
    );
    expect(screen.getByText('M .782', HIDDEN)).toBeTruthy();
    expect(screen.getByLabelText('Airspeed 280 knots, Mach 0.78')).toBeTruthy();
  });

  it('adds radio altitude to the label at or below 2,500 ft', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        telemetry: {
          ...snapshot.telemetry,
          ...telemetry({ [D.radioAltitude]: 812.6, [D.altitude]: 820 }),
        },
      }),
    );
    expect(
      screen.getByLabelText(
        'Altitude 820 feet, altimeter 29.92 inches, standard, radio altitude 813 feet',
      ),
    ).toBeTruthy();
  });

  it('shows radio altitude on the attitude even with no attitude to draw', async () => {
    const snapshot = live();
    const { [D.pitch]: _dropped, ...rest } = snapshot.telemetry;
    await render(
      tree({ ...snapshot, telemetry: { ...rest, ...telemetry({ [D.radioAltitude]: 812.6 }) } }),
    );
    expect(screen.getByLabelText('Attitude: no value')).toBeTruthy();
    expect(screen.getByText('813', HIDDEN)).toBeTruthy();
  });

  it('re-renders only the altitude tape when only the altitude changes', async () => {
    const storage = createMemorySettingsStorage();
    const first = live();
    const view = await render(tree(first, storage));
    resetRenders();
    await view.rerender(
      tree(
        { ...first, telemetry: { ...first.telemetry, ...telemetry({ [D.altitude]: 4600 }) } },
        storage,
      ),
    );
    expect(instrumentRenders['instrument-altitude']).toBe(1);
    for (const face of FACES.filter((face) => face !== 'instrument-altitude')) {
      expect(instrumentRenders[face] ?? 0).toBe(0);
    }
  });

  it('re-renders no instrument when radio altitude changes above 2,500 ft', async () => {
    const storage = createMemorySettingsStorage();
    const first = live();
    const view = await render(tree(first, storage));
    resetRenders();
    await view.rerender(
      tree(
        { ...first, telemetry: { ...first.telemetry, ...telemetry({ [D.radioAltitude]: 3100 }) } },
        storage,
      ),
    );
    for (const face of FACES) {
      expect(instrumentRenders[face] ?? 0).toBe(0);
    }
  });

  it('flags every instrument not live when the link drops, keeping values', async () => {
    await render(tree(live({ state: 'reconnecting' })));
    for (const label of [
      'Airspeed 112 knots',
      'Attitude: pitch 3 degrees up, bank 15 degrees right',
      'Altitude 4,520 feet, altimeter 29.92 inches, standard',
      'Turn: rate 1.2 standard rate right, ball 2 degrees right',
      'Heading 270 degrees',
      'Vertical speed climbing 500 feet per minute',
    ]) {
      expect(screen.getByLabelText(`${label}, not live`)).toBeTruthy();
    }
  });

  it('writes the NOT LIVE flag only on the attitude, the one face wide and tall enough for it', async () => {
    // At 360 wide the tapes are 60 and 40 across and the heading and turn strips 40 and 20 tall:
    // all compact, so the red X alone marks them.
    await render(tree(live({ state: 'reconnecting' })));
    expect(screen.getAllByText('NOT LIVE')).toHaveLength(1);
    expect(within(screen.getByTestId('instrument-attitude')).getByText('NOT LIVE')).toBeTruthy();
  });

  it('fades the Mach, altimeter-setting and radio-altitude boxes with the link', async () => {
    const snapshot = live({ state: 'reconnecting' });
    await render(
      tree({
        ...snapshot,
        telemetry: { ...snapshot.telemetry, ...telemetry({ [D.radioAltitude]: 812.6 }) },
      }),
    );
    expect(screen.getByTestId('pfd-mach', HIDDEN)).toHaveStyle({ opacity: NOT_LIVE_OPACITY });
    expect(screen.getByTestId('pfd-baro', HIDDEN)).toHaveStyle({ opacity: NOT_LIVE_OPACITY });
    expect(screen.getByTestId('pfd-radio-altitude', HIDDEN)).toHaveStyle({
      opacity: NOT_LIVE_OPACITY,
    });
  });

  it('shows no Mach while the airspeed itself is unavailable', async () => {
    const snapshot = live();
    await render(
      tree(
        withMissing(
          { ...snapshot, telemetry: { ...snapshot.telemetry, ...telemetry({ [D.mach]: 0.782 }) } },
          D.airspeed,
        ),
      ),
    );
    expect(screen.queryByText(/^M /, HIDDEN)).toBeNull();
  });

  it('marks only the missing instrument unavailable', async () => {
    await render(tree(withMissing(live(), D.verticalSpeed)));
    expect(screen.getByLabelText('Vertical speed: not available on this aircraft')).toBeTruthy();
    expect(within(screen.getByTestId('instrument-vertical-speed')).getByText('N/A')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();
  });
});

// The autopilot as the mock aircraft reports it: AP on, HDG engaged, ALT armed, nothing holding the
// speed or the vertical speed yet.
const AP: Record<string, number> = {
  [D.autopilotServos]: 1,
  [D.flightDirectorBars]: 1,
  [D.autothrottle]: 0,
  [D.headingStatus]: 2,
  [D.navStatus]: 0,
  [D.approachStatus]: 0,
  [D.altitudeStatus]: 1,
  [D.verticalSpeedStatus]: 0,
  [D.speedStatus]: 0,
  [D.headingBug]: 270,
  [D.altitudeDial]: 8000,
  [D.verticalSpeedDial]: -500,
  [D.airspeedDial]: 120,
  [D.airspeedIsMach]: 0,
};

const AP_NAMES = [
  D.autopilotServos,
  D.flightDirectorBars,
  D.autothrottle,
  D.headingBug,
  D.altitudeDial,
  D.verticalSpeedDial,
  D.airspeedDial,
  D.airspeedIsMach,
  D.headingStatus,
  D.navStatus,
  D.approachStatus,
  D.altitudeStatus,
  D.verticalSpeedStatus,
  D.speedStatus,
];

function withAp(overrides: Record<string, number> = {}, snapshot = live()): SessionSnapshot {
  return {
    ...snapshot,
    telemetry: { ...snapshot.telemetry, ...telemetry({ ...AP, ...overrides }) },
  };
}

const ALTITUDE = 'Altitude 4,520 feet, altimeter 29.92 inches, standard';
const NO_FLIGHT = {
  health: { ...base.health, activity: 'noFlight' as const, live: false, lastHeartbeatAt: NOW },
};
const SELECTED = processColor(darkTheme.instrument.selected);

/** react-native-svg hands a fill to the native view as `{ type, payload }`. */
function fillOf(testID: string): unknown {
  return (screen.getByTestId(testID, HIDDEN).props.fill as { payload?: unknown }).payload;
}

/** The text an SVG `Text` draws: react-native-svg hands it to its one span as `content`. */
function svgText(testID: string): unknown {
  const node = screen.getByTestId(testID, HIDDEN);
  return (node.children[0] as { props: { content?: unknown } }).props.content;
}

/**
 * One vertex of a drawn polygon, read back from the path react-native-svg hands to the native
 * view. A tape bug's notch is its fifth vertex (index 4), the VSI triangle's tip its second.
 */
function vertex(testID: string, index: number): { x: number; y: number } {
  const d = String(screen.getByTestId(testID, HIDDEN).props.d);
  const points = [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
  const point = points[index];
  if (point === undefined) {
    throw new Error(`no vertex ${index} in ${d}`);
  }
  return point;
}

const notchOf = (testID: string) => vertex(testID, 4);

describe('PFD autopilot targets', () => {
  it('shows the FMA across the PFD while any autopilot DataRef resolves', async () => {
    await render(tree(withAp()));
    expect(screen.getByTestId('autopilot-fma')).toBeTruthy();
    expect(screen.getByLabelText(/^Autopilot modes: HDG/)).toBeTruthy();
  });

  it('shows no FMA when every autopilot DataRef is missing', async () => {
    await render(tree(withMissing(live(), ...AP_NAMES)));
    expect(screen.queryByTestId('autopilot-fma')).toBeNull();
    expect(screen.getByLabelText(ALTITUDE)).toBeTruthy();
  });

  it('fades the compact FMA with the link, as it does the boxes', async () => {
    const view = await render(tree(withAp()));
    expect(screen.getByTestId('pfd-fma')).toHaveStyle({ opacity: 1 });
    await view.rerender(tree({ ...withAp(), state: 'reconnecting' }));
    expect(screen.getByTestId('pfd-fma')).toHaveStyle({ opacity: NOT_LIVE_OPACITY });
  });

  it('keeps the FMA on one line at the PFD compact size', async () => {
    await render(tree(withAp({ [D.verticalSpeedStatus]: 2, [D.verticalSpeedDial]: -1500 })));
    const fma = screen.getByTestId('autopilot-fma');
    const vs = within(fma).getByText('VS −1500FPM');
    expect(vs.props.numberOfLines).toBe(1);
    expect(vs.props.adjustsFontSizeToFit).toBe(true);
    for (const text of within(fma).queryAllByText(/./)) {
      expect(text.props.numberOfLines).toBe(1);
    }
  });

  it('boxes and bugs the selected altitude, and says it', async () => {
    await render(tree(withAp()));
    expect(screen.getByLabelText(`${ALTITUDE}, selected 8,000 feet`)).toBeTruthy();
    expect(svgText('pfd-altitude-selected')).toBe('8,000');
    expect(fillOf('pfd-altitude-selected')).toBe(SELECTED);
    expect(fillOf('pfd-altitude-bug')).toBe(SELECTED);
    // 3,476 ft above: off the ±333 ft scale, parked at the tape's top edge under the box.
    expect(notchOf('pfd-altitude-bug')).toEqual({ x: 3, y: 20 });
  });

  it('puts an on-scale altitude bug at its distance from the readout', async () => {
    await render(tree(withAp({ [D.altitudeDial]: 4_324 })));
    // 200 ft below the 4,524 ft flown, at 0.3 a foot: 60 under the centre line.
    expect(notchOf('pfd-altitude-bug')).toEqual({ x: 3, y: 180 });
  });

  it('parks an off-scale altitude bug half-visible: under the box above, off the edge below', async () => {
    const view = await render(tree(withAp({ [D.altitudeDial]: 3_000 })));
    // 1,524 ft below: half off the tape's bottom edge, never where an on-scale target could be.
    expect(notchOf('pfd-altitude-bug')).toEqual({ x: 3, y: 240 });
    await view.rerender(tree(withAp({ [D.altitudeDial]: 12_000 })));
    expect(notchOf('pfd-altitude-bug')).toEqual({ x: 3, y: 20 });
  });

  it('parks an off-scale speed bug half-visible: under the box above, off the edge below', async () => {
    const view = await render(tree(withAp({ [D.speedStatus]: 2, [D.airspeedDial]: 40 })));
    // 72 kt below at 3 a knot: half off the tape's bottom edge.
    expect(notchOf('pfd-speed-bug')).toEqual({ x: 57, y: 240 });
    await view.rerender(tree(withAp({ [D.speedStatus]: 2, [D.airspeedDial]: 200 })));
    expect(notchOf('pfd-speed-bug')).toEqual({ x: 57, y: 20 });
  });

  it('shows the heading bug box and the bug, and says it', async () => {
    await render(tree(withAp({ [D.headingBug]: 280 })));
    expect(
      within(screen.getByTestId('pfd-heading-bug', HIDDEN)).getByText('HDG 280°', HIDDEN),
    ).toBeTruthy();
    expect(screen.getByLabelText('Heading 270 degrees, heading bug 280')).toBeTruthy();
    // 9.8° right of the lubber line at 100/30 a degree.
    expect(notchOf('pfd-heading-tape-bug').x).toBeCloseTo(100 + 9.8 * (100 / 30));
    expect(fillOf('pfd-heading-tape-bug')).toBe(SELECTED);
  });

  it('parks the heading bug at the tape edge beyond ±30°, the short way across north', async () => {
    await render(tree(withAp({ [D.headingBug]: 10 })));
    // 99.8° right the short way: parked at the right edge.
    expect(notchOf('pfd-heading-tape-bug').x).toBe(200);
    expect(screen.getByLabelText('Heading 270 degrees, heading bug 010')).toBeTruthy();
  });

  it('shows the selected airspeed only while FLC or the autothrottle holds it', async () => {
    const view = await render(tree(withAp()));
    expect(screen.queryByTestId('pfd-speed-selected')).toBeNull();
    expect(screen.queryByTestId('pfd-speed-bug')).toBeNull();
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();

    await view.rerender(tree(withAp({ [D.speedStatus]: 1 })));
    expect(screen.queryByTestId('pfd-speed-selected')).toBeNull();

    await view.rerender(tree(withAp({ [D.speedStatus]: 2 })));
    expect(svgText('pfd-speed-selected')).toBe('120');
    expect(fillOf('pfd-speed-bug')).toBe(SELECTED);
    // 120 kt selected, 112.4 flown, at 3 a knot: 22.8 above the centre line, on the right edge.
    expect(notchOf('pfd-speed-bug').x).toBe(57);
    expect(notchOf('pfd-speed-bug').y).toBeCloseTo(120 - 7.6 * 3);
    expect(screen.getByLabelText('Airspeed 112 knots, selected 120 knots')).toBeTruthy();

    await view.rerender(tree(withAp({ [D.autothrottle]: 1 })));
    expect(svgText('pfd-speed-selected')).toBe('120');
  });

  it('shows a Mach target as a box only', async () => {
    await render(
      tree(withAp({ [D.speedStatus]: 2, [D.airspeedIsMach]: 1, [D.airspeedDial]: 0.78 })),
    );
    expect(svgText('pfd-speed-selected')).toBe('M.78');
    expect(screen.queryByTestId('pfd-speed-bug')).toBeNull();
    expect(screen.getByLabelText('Airspeed 112 knots, selected Mach .78')).toBeTruthy();
  });

  it('bugs the selected vertical speed only while VS is engaged', async () => {
    const view = await render(tree(withAp()));
    expect(screen.queryByTestId('pfd-vsi-bug')).toBeNull();
    await view.rerender(tree(withAp({ [D.verticalSpeedStatus]: 2 })));
    // −500 ft/min on the ±2,000 scale of ±96: 24 below the centre line.
    expect(vertex('pfd-vsi-bug', 1).y).toBe(144);
    expect(fillOf('pfd-vsi-bug')).toBe(SELECTED);
  });

  it('hides every target with no flight loaded', async () => {
    await render(tree(withAp({ [D.speedStatus]: 2, [D.verticalSpeedStatus]: 2 }, live(NO_FLIGHT))));
    expect(screen.getByLabelText('Altitude: no value')).toBeTruthy();
    expect(screen.getByLabelText('Heading: no value')).toBeTruthy();
    for (const id of [
      'pfd-heading-bug',
      'pfd-altitude-selected',
      'pfd-altitude-bug',
      'pfd-heading-tape-bug',
      'pfd-speed-selected',
      'pfd-speed-bug',
      'pfd-vsi-bug',
    ]) {
      expect(screen.queryByTestId(id, HIDDEN)).toBeNull();
    }
  });

  it('fades the heading bug box with the link', async () => {
    await render(tree(withAp({}, live({ state: 'reconnecting' }))));
    expect(screen.getByTestId('pfd-heading-bug', HIDDEN)).toHaveStyle({
      opacity: NOT_LIVE_OPACITY,
    });
    expect(screen.getByLabelText(`${ALTITUDE}, selected 8,000 feet, not live`)).toBeTruthy();
  });

  it('re-renders only the altitude tape when only the altitude changes, targets shown', async () => {
    const storage = createMemorySettingsStorage();
    const first = withAp({ [D.speedStatus]: 2, [D.verticalSpeedStatus]: 2 });
    const view = await render(tree(first, storage));
    resetRenders();
    await view.rerender(
      tree(
        { ...first, telemetry: { ...first.telemetry, ...telemetry({ [D.altitude]: 4600 }) } },
        storage,
      ),
    );
    expect(instrumentRenders['instrument-altitude']).toBe(1);
    for (const face of FACES.filter((face) => face !== 'instrument-altitude')) {
      expect(instrumentRenders[face] ?? 0).toBe(0);
    }
  });

  it('draws numbers in B612 Mono and letters in B612 once the fonts load', async () => {
    await render(tree(withAp(), createMemorySettingsStorage(), true));
    expect(screen.getByTestId('pfd-altitude-selected').props.font).toEqual(
      expect.objectContaining({ fontFamily: AVIONICS_FAMILIES.monoBold }),
    );
    expect(screen.getByText('HDG 270°', HIDDEN)).toHaveStyle({
      fontFamily: AVIONICS_FAMILIES.monoBold,
    });
  });

  it('names no font family before the fonts load', async () => {
    await render(tree(withAp()));
    expect(screen.getByTestId('pfd-altitude-selected').props.font).not.toHaveProperty('fontFamily');
  });
});

// An ILS on NAV1 as X-Plane reports it: localizer received, needle 1.2 dots right, TO, and the
// glideslope received with its diamond half a dot down. No marker lit.
const ILS: Record<string, number> = {
  [D.hsiSource]: 0,
  [D.hsiHdef]: 1.2,
  [D.hsiFromTo]: 1,
  [D.hsiHorizontal]: 1,
  [D.hsiVdef]: -0.5,
  [D.hsiVertical]: 1,
  [D.hsiGsFlag]: 0,
  [D.outerMarker]: 0,
  [D.middleMarker]: 0,
  [D.innerMarker]: 0,
};

function withNav(overrides: Record<string, number> = {}, snapshot = live()): SessionSnapshot {
  return {
    ...snapshot,
    telemetry: { ...snapshot.telemetry, ...telemetry({ ...ILS, ...overrides }) },
  };
}

const ATTITUDE = 'Attitude: pitch 3 degrees up, bank 15 degrees right';
const GPS = 2;
const NAV_CUES = [
  'pfd-nav-cues',
  'pfd-loc-scale',
  'pfd-loc-diamond',
  'pfd-nav-source',
  'pfd-gs-scale',
  'pfd-gs-diamond',
  'pfd-gs-flag',
  'pfd-marker',
  'pfd-marker-box',
];

/** The cues are hidden from screen readers (the attitude label says them), so look in hidden too. */
const cue = (testID: string) => screen.queryByTestId(testID, HIDDEN);

function expectNoCues() {
  for (const id of NAV_CUES) {
    expect(cue(id)).toBeNull();
  }
}

/** The nearest opacity above a drawn cue, from a group's prop or a view's style: its fade. */
function opacityAbove(testID: string): unknown {
  let node = screen.getByTestId(testID, HIDDEN).parent;
  while (node !== null) {
    const opacity =
      node.props.opacity ??
      (StyleSheet.flatten(node.props.style) as { opacity?: unknown } | undefined)?.opacity;
    if (opacity !== undefined) {
      return opacity;
    }
    node = node.parent;
  }
  return undefined;
}

describe('PFD navigation cues', () => {
  it('draws no scale, no flag and no marker with no navaid tuned', async () => {
    await render(tree(live()));
    expectNoCues();
    expect(screen.queryByText('NAV', HIDDEN)).toBeNull();
    expect(screen.getByLabelText(ATTITUDE)).toBeTruthy();
  });

  it('hides the lateral scale, never centred and with no flag, while X-Plane flags it', async () => {
    const view = await render(tree(withNav({ [D.hsiHorizontal]: 0 })));
    expect(cue('pfd-loc-scale')).toBeNull();
    expect(cue('pfd-loc-diamond')).toBeNull();
    expect(cue('pfd-nav-source')).toBeNull();
    expect(screen.queryByText('NAV', HIDDEN)).toBeNull();
    expect(screen.getByLabelText(`${ATTITUDE}, glideslope 0.5 dots down`)).toBeTruthy();
    // Neither TO nor FROM: the course means nothing, so the needle is hidden too.
    await view.rerender(tree(withNav({ [D.hsiFromTo]: 0 })));
    expect(cue('pfd-loc-diamond')).toBeNull();
  });

  it('shows nothing, not even N/A, when the aircraft lacks a deviation DataRef', async () => {
    await render(tree(withMissing(withNav(), D.hsiHdef, D.hsiVdef)));
    expectNoCues();
    expect(within(screen.getByTestId('instrument-attitude')).queryByText(/N\/A/)).toBeNull();
    expect(screen.getByLabelText(ATTITUDE)).toBeTruthy();
  });

  it('puts the NAV1 diamond at its dots from the centre in green, with its source word', async () => {
    await render(tree(withNav()));
    expect(cue('pfd-loc-scale')).toBeTruthy();
    // 1.2 dots right at 18 a dot, from the attitude's centre at 100; its first vertex is the top.
    expect(vertex('pfd-loc-diamond', 0).x).toBeCloseTo(100 + 1.2 * 18);
    expect(fillOf('pfd-loc-diamond')).toBe(processColor(darkTheme.instrument.navNeedle));
    expect(svgText('pfd-nav-source')).toBe('NAV1');
    expect(fillOf('pfd-nav-source')).toBe(processColor(darkTheme.instrument.navNeedle));
  });

  it('draws a GPS course in magenta, says GPS and speaks a glidepath', async () => {
    await render(tree(withNav({ [D.hsiSource]: GPS, [D.hsiHdef]: -0.4 })));
    expect(vertex('pfd-loc-diamond', 0).x).toBeCloseTo(100 - 0.4 * 18);
    expect(fillOf('pfd-loc-diamond')).toBe(processColor(darkTheme.instrument.gpsNeedle));
    expect(svgText('pfd-nav-source')).toBe('GPS');
    expect(fillOf('pfd-nav-source')).toBe(processColor(darkTheme.instrument.gpsNeedle));
    expect(
      screen.getByLabelText(`${ATTITUDE}, GPS course 0.4 dots left, glidepath 0.5 dots down`),
    ).toBeTruthy();
  });

  it('names NAV2 when it is the source', async () => {
    await render(tree(withNav({ [D.hsiSource]: 1, [D.hsiVertical]: 0 })));
    expect(svgText('pfd-nav-source')).toBe('NAV2');
    expect(screen.getByLabelText(`${ATTITUDE}, NAV2 course 1.2 dots right`)).toBeTruthy();
  });

  it('draws no source word, and says just "course", for a source it does not know', async () => {
    await render(tree(withNav({ [D.hsiSource]: 7, [D.hsiVertical]: 0 })));
    expect(cue('pfd-loc-diamond')).toBeTruthy();
    expect(cue('pfd-nav-source')).toBeNull();
    expect(screen.getByLabelText(`${ATTITUDE}, course 1.2 dots right`)).toBeTruthy();
  });

  it('stops a full-scale needle at 2.5 dots and says so', async () => {
    await render(tree(withNav({ [D.hsiHdef]: 4, [D.hsiVertical]: 0 })));
    expect(vertex('pfd-loc-diamond', 0).x).toBeCloseTo(100 + 2.5 * 18);
    expect(screen.getByLabelText(`${ATTITUDE}, NAV1 course full scale right`)).toBeTruthy();
  });

  it('says the course and the glideslope only while each is shown', async () => {
    await render(tree(withNav()));
    expect(
      screen.getByLabelText(`${ATTITUDE}, NAV1 course 1.2 dots right, glideslope 0.5 dots down`),
    ).toBeTruthy();
  });

  it('shows the glideslope diamond only while X-Plane says it is valid', async () => {
    await render(tree(withNav()));
    expect(cue('pfd-gs-scale')).toBeTruthy();
    // Half a dot down at 18 a dot, from the centre at 120; its first vertex is the top, 7 above.
    expect(vertex('pfd-gs-diamond', 0).y).toBeCloseTo(120 + 0.5 * 18 - 7);
    expect(cue('pfd-gs-flag')).toBeNull();
  });

  it('shows a red GS flag and no diamond while the glideslope is flagged', async () => {
    await render(tree(withNav({ [D.hsiGsFlag]: 1 })));
    expect(svgText('pfd-gs-flag')).toBe('GS');
    expect(fillOf('pfd-gs-flag')).toBe(processColor(darkTheme.instrument.flagText));
    expect(fillOf('pfd-gs-flag-box')).toBe(processColor(darkTheme.instrument.flag));
    expect(cue('pfd-gs-diamond')).toBeNull();
    expect(cue('pfd-gs-scale')).toBeNull();
    expect(
      screen.getByLabelText(`${ATTITUDE}, NAV1 course 1.2 dots right, glideslope flagged`),
    ).toBeTruthy();
  });

  it('flags a GPS glidepath GP, not GS', async () => {
    await render(tree(withNav({ [D.hsiSource]: GPS, [D.hsiGsFlag]: 1 })));
    expect(svgText('pfd-gs-flag')).toBe('GP');
    expect(
      screen.getByLabelText(`${ATTITUDE}, GPS course 1.2 dots right, glidepath flagged`),
    ).toBeTruthy();
  });

  it('shows no glideslope scale and no flag when none is expected, as on a VOR', async () => {
    await render(tree(withNav({ [D.hsiVertical]: 0 })));
    expect(cue('pfd-gs-scale')).toBeNull();
    expect(cue('pfd-gs-diamond')).toBeNull();
    expect(cue('pfd-gs-flag')).toBeNull();
    expect(screen.getByLabelText(`${ATTITUDE}, NAV1 course 1.2 dots right`)).toBeTruthy();
  });

  it.each([
    ['outer', D.outerMarker, 'O', darkTheme.instrument.selected],
    ['middle', D.middleMarker, 'M', darkTheme.avionics.caution],
    ['inner', D.innerMarker, 'I', darkTheme.avionics.legend],
  ])('shows the %s marker as its letter on its colour', async (word, name, letter, colour) => {
    await render(tree(withNav({ [name]: 1 })));
    expect(svgText('pfd-marker')).toBe(letter);
    expect(fillOf('pfd-marker')).toBe(processColor(darkTheme.instrument.face));
    expect(fillOf('pfd-marker-box')).toBe(processColor(colour));
    expect(
      screen.getByLabelText(
        `${ATTITUDE}, NAV1 course 1.2 dots right, glideslope 0.5 dots down, ${word} marker`,
      ),
    ).toBeTruthy();
  });

  it('keeps every cue when the attitude itself is missing: a missing feature drops only its cue', async () => {
    await render(tree(withMissing(withNav({ [D.outerMarker]: 1 }), D.pitch)));
    expect(cue('pfd-loc-diamond')).toBeTruthy();
    expect(cue('pfd-gs-diamond')).toBeTruthy();
    expect(cue('pfd-marker')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Attitude: not available on this aircraft, NAV1 course 1.2 dots right, glideslope 0.5 dots down, outer marker',
      ),
    ).toBeTruthy();
  });

  it('says the cues are not live with the link stale, whatever the attitude state', async () => {
    const stale = live({ state: 'reconnecting' });
    const cues = 'NAV1 course 1.2 dots right, glideslope 0.5 dots down, outer marker, not live';
    // Unavailable: the aircraft lacks pitch.
    const view = await render(tree(withMissing(withNav({ [D.outerMarker]: 1 }, stale), D.pitch)));
    expect(screen.getByLabelText(`Attitude: not available on this aircraft, ${cues}`)).toBeTruthy();
    // No value: pitch has not arrived.
    const noPitch = withNav({ [D.outerMarker]: 1 }, stale);
    const { [D.pitch]: _dropped, ...rest } = noPitch.telemetry;
    await view.rerender(tree({ ...noPitch, telemetry: rest }));
    expect(screen.getByLabelText(`Attitude: no value, ${cues}`)).toBeTruthy();
    // Live link: neither state claims staleness.
    await view.rerender(tree(withMissing(withNav({ [D.outerMarker]: 1 }), D.pitch)));
    expect(
      screen.getByLabelText(
        'Attitude: not available on this aircraft, NAV1 course 1.2 dots right, glideslope 0.5 dots down, outer marker',
      ),
    ).toBeTruthy();
  });

  it('adds no "not live" to an attitude with no value and no cues', async () => {
    await render(tree(withMissing(live({ state: 'reconnecting' }), D.pitch)));
    expect(screen.getByLabelText('Attitude: not available on this aircraft')).toBeTruthy();
  });

  it('fades every cue with the link, as the boxes are', async () => {
    const view = await render(tree(withNav({ [D.outerMarker]: 1 })));
    expect(opacityAbove('pfd-loc-diamond')).toBe(1);
    await view.rerender(tree(withNav({ [D.outerMarker]: 1 }, live({ state: 'reconnecting' }))));
    for (const id of [
      'pfd-loc-scale',
      'pfd-loc-diamond',
      'pfd-nav-source',
      'pfd-gs-diamond',
      'pfd-marker',
    ]) {
      expect(opacityAbove(id)).toBe(NOT_LIVE_OPACITY);
    }
    expect(
      screen.getByLabelText(
        `${ATTITUDE}, NAV1 course 1.2 dots right, glideslope 0.5 dots down, outer marker, not live`,
      ),
    ).toBeTruthy();
    await view.rerender(tree(withNav({ [D.hsiGsFlag]: 1 }, live({ state: 'reconnecting' }))));
    expect(opacityAbove('pfd-gs-flag')).toBe(NOT_LIVE_OPACITY);
  });

  it('draws no cue with no flight loaded', async () => {
    await render(tree(withNav({ [D.outerMarker]: 1, [D.hsiGsFlag]: 1 }, live(NO_FLIGHT))));
    expectNoCues();
  });

  it('re-renders only the altitude tape when only the altitude changes, cues shown', async () => {
    const storage = createMemorySettingsStorage();
    const first = withNav({ [D.outerMarker]: 1 });
    const view = await render(tree(first, storage));
    resetRenders();
    await view.rerender(
      tree(
        { ...first, telemetry: { ...first.telemetry, ...telemetry({ [D.altitude]: 4600 }) } },
        storage,
      ),
    );
    expect(instrumentRenders['instrument-altitude']).toBe(1);
    for (const face of FACES.filter((face) => face !== 'instrument-altitude')) {
      expect(instrumentRenders[face] ?? 0).toBe(0);
    }
  });
});
