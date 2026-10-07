import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { processColor } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { UNITS_STORAGE_KEY } from '@/application/unit-preferences';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { NOT_LIVE_OPACITY } from '@/features/panels/instruments/InstrumentFace';
import { instrumentRenders } from '@/features/panels/instruments/svg-parts';
import { Hsi, PX_PER_DOT } from '@/features/panels/navigation/Hsi';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { AVIONICS_FAMILIES } from '@/theme/fonts';
import { ThemeProvider } from '@/theme/theme-context';
import { darkTheme } from '@/theme/tokens';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const C = 120;
const ink = darkTheme.instrument;

/** base64 of "IKSO" and "ITMA", NUL-padded as X-Plane sends a `data` DataRef. */
const IKSO = 'SUtTTwAAAAA=';
const ITMA = 'SVRNQQAAAAA=';

/** A tuned ILS on NAV1, on the localizer 1.2 dots right of the needle, no glideslope yet. */
const VALUES: Record<string, number | string> = {
  [D.heading]: 270,
  [D.headingBug]: 270,
  [D.hsiSource]: 0,
  [D.hsiCourse]: 270,
  [D.hsiHdef]: 1.2,
  [D.hsiVdef]: 0,
  [D.hsiFromTo]: 1,
  [D.hsiHorizontal]: 1,
  [D.hsiVertical]: 0,
  [D.hsiGsFlag]: 0,
  [D.hsiHasDme]: 1,
  [D.hsiDmeDistance]: 12.4,
  [D.hsiDmeSpeed]: 110,
  [D.hsiDmeTime]: 7,
  [D.nav1Id]: IKSO,
  [D.nav2Id]: ITMA,
  [D.nav1Bearing]: 280,
  [D.nav2Bearing]: 95,
  [D.nav1Signal]: 0,
  [D.nav2Signal]: 0,
  [D.outerMarker]: 0,
  [D.middleMarker]: 0,
  [D.innerMarker]: 0,
};

function telemetry(values: Record<string, number | string>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

function live(
  values: Record<string, number | string> = {},
  overrides: Partial<SessionSnapshot> = {},
) {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: telemetry({ ...VALUES, ...values }),
    ...overrides,
  } as SessionSnapshot;
}

function withMissing(snapshot: SessionSnapshot, ...names: string[]): SessionSnapshot {
  const bindings = { ...snapshot.compatibility.bindings };
  for (const name of names) {
    bindings[name] = { name, kind: 'dataref', status: 'missing' };
  }
  return { ...snapshot, compatibility: { ...snapshot.compatibility, bindings } };
}

const actions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

function tree(
  snapshot: SessionSnapshot,
  storage: SettingsStorage = createMemorySettingsStorage(),
  fontsLoaded = false,
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="dark" fontsLoaded={fontsLoaded}>
      <UnitsProvider storage={storage}>
        <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
          <Hsi size={240} />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const HSI_ID = 'instrument-hsi';
const label = (): string => String(screen.getByTestId(HSI_ID).props.accessibilityLabel);

/** The text an SVG `Text` draws: react-native-svg hands it to its one span as `content`. */
function svgText(testID: string): unknown {
  const node = screen.getByTestId(testID);
  return (node.children[0] as { props: { content?: unknown } }).props.content;
}

/** react-native-svg hands a colour to the native view as `{ type, payload }`. */
function paint(testID: string, prop: 'fill' | 'stroke'): unknown {
  return (screen.getByTestId(testID).props[prop] as { payload?: unknown }).payload;
}

/** One vertex of a drawn polygon, read back from the path react-native-svg hands the native view. */
function vertex(testID: string, index: number): { x: number; y: number } {
  const d = String(screen.getByTestId(testID).props.d);
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

/** The rotation a group is drawn at, degrees clockwise, from the matrix react-native-svg builds. */
function rotationOf(testID: string): number {
  const [a, b] = screen.getByTestId(testID).props.matrix as number[];
  return (Math.atan2(b ?? 0, a ?? 1) * 180) / Math.PI;
}

/** The opacity of the nearest SVG group above a drawn element: the face's not-live fade. */
function groupOpacity(testID: string): unknown {
  let node = screen.getByTestId(testID).parent;
  while (node !== null) {
    if (node.props.opacity !== undefined) {
      return node.props.opacity;
    }
    node = node.parent;
  }
  return undefined;
}

describe('HSI on a valid NAV1 course', () => {
  it('draws the CDI right of the course line by its dots, in NAV green', async () => {
    await render(tree(live()));
    const cdi = screen.getByTestId('hsi-cdi');
    expect(Number(cdi.props.x1)).toBeCloseTo(C + 1.2 * PX_PER_DOT);
    expect(Number(cdi.props.x2)).toBeCloseTo(C + 1.2 * PX_PER_DOT);
    expect(paint('hsi-cdi', 'stroke')).toBe(processColor(ink.navNeedle));
    expect(paint('hsi-course-pointer', 'fill')).toBe(processColor(ink.navNeedle));
    expect(screen.queryByTestId('hsi-nav-flag')).toBeNull();
  });

  it('prints the source, ident, course, DME and TO in the corners', async () => {
    await render(tree(live()));
    expect(svgText('hsi-source')).toBe('NAV1');
    expect(paint('hsi-source', 'fill')).toBe(processColor(ink.navNeedle));
    expect(svgText('hsi-ident')).toBe('IKSO');
    expect(svgText('hsi-course')).toBe('CRS 270°');
    expect(paint('hsi-course', 'fill')).toBe(processColor(ink.navNeedle));
    expect(svgText('hsi-dme')).toBe('12.4 nm');
    expect(svgText('hsi-dme-time')).toBe('7 MIN');
    expect(svgText('hsi-to-from')).toBe('TO');
    expect(screen.getByTestId('hsi-to-from-arrow')).toBeTruthy();
    expect(screen.queryByTestId('hsi-gs-scale')).toBeNull();
  });

  it('says it all in one sentence', async () => {
    await render(tree(live()));
    expect(label()).toContain(
      'NAV1, IKSO, course 270, 1.2 dots right, TO, DME 12.4 nautical miles',
    );
    expect(label()).toMatch(/^HSI, heading 270, /);
    expect(label()).toContain('heading bug 270');
  });

  it('points the TO arrow at the course head and the FROM arrow at its tail', async () => {
    const view = await render(tree(live()));
    expect(vertex('hsi-to-from-arrow', 0).y).toBeLessThan(C);
    await view.rerender(tree(live({ [D.hsiFromTo]: 2 })));
    expect(svgText('hsi-to-from')).toBe('FROM');
    expect(vertex('hsi-to-from-arrow', 0).y).toBeGreaterThan(C);
    expect(label()).toContain('1.2 dots right, FROM');
  });

  it('turns the course group by the course relative to the heading', async () => {
    await render(tree(live({ [D.heading]: 350, [D.hsiCourse]: 10 })));
    expect(rotationOf('hsi-course-group')).toBeCloseTo(20);
    expect(svgText('hsi-course')).toBe('CRS 010°');
    expect(label()).toContain('course 010');
  });

  it('speaks left deviation, a centred needle and a pegged one', async () => {
    const view = await render(tree(live({ [D.hsiHdef]: -0.84 })));
    expect(Number(screen.getByTestId('hsi-cdi').props.x1)).toBeCloseTo(C - 0.84 * PX_PER_DOT);
    expect(label()).toContain('0.8 dots left');
    await view.rerender(tree(live({ [D.hsiHdef]: 0.02 })));
    expect(label()).toContain('course 270, centred, TO');
    await view.rerender(tree(live({ [D.hsiHdef]: 4 })));
    expect(Number(screen.getByTestId('hsi-cdi').props.x1)).toBeCloseTo(C + 2.5 * PX_PER_DOT);
    expect(label()).toContain('full scale right');
  });

  it('turns the card by the heading, the short way', async () => {
    const view = await render(tree(live({ [D.heading]: 270 })));
    expect(rotationOf('hsi-card')).toBeCloseTo(90);
    await view.rerender(tree(live({ [D.heading]: 10 })));
    expect(rotationOf('hsi-card')).toBeCloseTo(-10);
  });

  it('draws the heading bug in cyan only while it resolves', async () => {
    const view = await render(tree(live({ [D.headingBug]: 300 })));
    expect(paint('hsi-heading-bug', 'fill')).toBe(processColor(ink.selected));
    expect(rotationOf('hsi-heading-bug')).toBeCloseTo(30);
    expect(label()).toContain('heading bug 300');
    await view.rerender(tree(withMissing(live(), D.headingBug)));
    expect(screen.queryByTestId('hsi-heading-bug')).toBeNull();
    expect(label()).not.toContain('heading bug');
  });

  it('speaks DME in kilometres when the distance unit is km', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(UNITS_STORAGE_KEY, JSON.stringify({ distance: 'km' }));
    await render(tree(live(), storage));
    await screen.findByLabelText(/DME 23\.0 kilometres/);
    expect(svgText('hsi-dme')).toBe('23.0 km');
  });

  it('shows no DME without a DME signal', async () => {
    await render(tree(live({ [D.hsiHasDme]: 0 })));
    expect(screen.queryByTestId('hsi-dme')).toBeNull();
    expect(screen.queryByTestId('hsi-dme-time')).toBeNull();
    expect(screen.queryByTestId('hsi-dme-speed')).toBeNull();
    expect(label()).not.toContain('DME');
    expect(label()).not.toContain('groundspeed');
  });

  it('shows the DME groundspeed under the distance, the time beside it, and says it', async () => {
    await render(tree(live()));
    expect(svgText('hsi-dme-speed')).toBe('110 KT');
    const dme = screen.getByTestId('hsi-dme');
    const speed = screen.getByTestId('hsi-dme-speed');
    const time = screen.getByTestId('hsi-dme-time');
    // react-native-svg hands a text's position to the native view as one-element arrays.
    const at = (node: typeof dme, axis: 'x' | 'y') => Number((node.props[axis] as number[])[0]);
    expect(at(speed, 'x')).toBe(at(dme, 'x'));
    expect(at(speed, 'y')).toBeGreaterThan(at(dme, 'y'));
    expect(at(time, 'y')).toBe(at(speed, 'y'));
    expect(at(time, 'x')).toBeGreaterThan(at(speed, 'x'));
    expect(label()).toContain('DME 12.4 nautical miles, groundspeed 110 knots');
  });

  it('keeps the time under the distance without a groundspeed', async () => {
    const snapshot = live();
    const { [D.hsiDmeSpeed]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }));
    expect(screen.queryByTestId('hsi-dme-speed')).toBeNull();
    const at = (testID: string) => Number((screen.getByTestId(testID).props.x as number[])[0]);
    expect(at('hsi-dme-time')).toBe(at('hsi-dme'));
    expect(label()).not.toContain('groundspeed');
  });

  it('sets the corner texts in B612 Mono and B612 once the fonts load', async () => {
    await render(tree(live(), createMemorySettingsStorage(), true));
    const family = (testID: string) => screen.getByTestId(testID).props.font?.fontFamily;
    expect(family('hsi-source')).toBe(AVIONICS_FAMILIES.avionicsBold);
    expect(family('hsi-ident')).toBe(AVIONICS_FAMILIES.avionicsBold);
    expect(family('hsi-course')).toBe(AVIONICS_FAMILIES.monoBold);
    expect(family('hsi-dme')).toBe(AVIONICS_FAMILIES.monoBold);
    expect(family('hsi-to-from')).toBe(AVIONICS_FAMILIES.avionicsBold);
  });

  it('sets no font family before the fonts load', async () => {
    await render(tree(live()));
    expect(screen.getByTestId('hsi-source').props.font?.fontFamily).toBeUndefined();
  });
});

describe('HSI NAV flag', () => {
  it('hides the CDI and TO/FROM and shows NAV when X-Plane flags the course', async () => {
    await render(tree(live({ [D.hsiFromTo]: 0, [D.hsiHorizontal]: 1 })));
    expect(screen.queryByTestId('hsi-cdi')).toBeNull();
    expect(svgText('hsi-nav-flag')).toBe('NAV');
    expect(paint('hsi-nav-flag-box', 'fill')).toBe(processColor(ink.flag));
    expect(screen.queryByTestId('hsi-to-from')).toBeNull();
    expect(screen.queryByTestId('hsi-to-from-arrow')).toBeNull();
    expect(label()).toContain('no NAV signal');
    expect(label()).not.toContain('dots');
    expect(label()).not.toContain('TO');
  });

  it('flags the course without a horizontal signal, even with TO set', async () => {
    await render(tree(live({ [D.hsiFromTo]: 1, [D.hsiHorizontal]: 0 })));
    expect(screen.queryByTestId('hsi-cdi')).toBeNull();
    expect(svgText('hsi-nav-flag')).toBe('NAV');
    expect(screen.queryByTestId('hsi-to-from')).toBeNull();
  });

  it('flags NAV, never a centred needle, until the course deviation arrives', async () => {
    const snapshot = live();
    const { [D.hsiHdef]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }));
    expect(screen.getByTestId('hsi-card')).toBeTruthy();
    expect(screen.queryByTestId('hsi-cdi')).toBeNull();
    expect(svgText('hsi-nav-flag')).toBe('NAV');
    expect(label()).toContain('no NAV signal');
  });

  it('hides the navaid ident while the course is flagged, so it never reads as received', async () => {
    await render(tree(live({ [D.hsiFromTo]: 0 })));
    expect(screen.queryByTestId('hsi-ident')).toBeNull();
    expect(label()).not.toContain('IKSO');
    expect(svgText('hsi-source')).toBe('NAV1');
  });
});

describe('HSI glideslope', () => {
  it('draws the diamond below centre for a negative deflection and says so', async () => {
    await render(tree(live({ [D.hsiVertical]: 1, [D.hsiGsFlag]: 0, [D.hsiVdef]: -0.5 })));
    expect(screen.getByTestId('hsi-gs-scale')).toBeTruthy();
    expect(screen.getByTestId('hsi-gs-diamond')).toBeTruthy();
    expect(paint('hsi-gs-diamond', 'fill')).toBe(processColor(ink.navNeedle));
    // The diamond's top vertex sits 0.5 dots below centre, less its half height of 7.
    expect(vertex('hsi-gs-diamond', 0).y).toBeCloseTo(C + 0.5 * PX_PER_DOT - 7);
    expect(label()).toContain('TO, glideslope 0.5 dots down, DME');
    expect(screen.queryByTestId('hsi-gs-flag')).toBeNull();
  });

  it('draws a positive deflection above centre', async () => {
    await render(tree(live({ [D.hsiVertical]: 1, [D.hsiVdef]: 1.5 })));
    expect(vertex('hsi-gs-diamond', 0).y).toBeCloseTo(C - 1.5 * PX_PER_DOT - 7);
    expect(label()).toContain('glideslope 1.5 dots up');
  });

  it('shows a GS flag and no diamond when the glideslope is flagged', async () => {
    await render(tree(live({ [D.hsiVertical]: 1, [D.hsiGsFlag]: 1, [D.hsiVdef]: -0.5 })));
    expect(screen.getByTestId('hsi-gs-scale')).toBeTruthy();
    expect(svgText('hsi-gs-flag')).toBe('GS');
    expect(paint('hsi-gs-flag-box', 'fill')).toBe(processColor(ink.flag));
    expect(screen.queryByTestId('hsi-gs-diamond')).toBeNull();
    expect(label()).toContain('glideslope flagged');
  });

  it('flags a glideslope X-Plane reports without a deflection value', async () => {
    const snapshot = live({ [D.hsiVertical]: 1, [D.hsiGsFlag]: 0 });
    const { [D.hsiVdef]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }));
    expect(screen.queryByTestId('hsi-gs-diamond')).toBeNull();
    expect(svgText('hsi-gs-flag')).toBe('GS');
  });

  it('never draws a diamond before the GS flag itself is received', async () => {
    const snapshot = live({ [D.hsiVertical]: 1, [D.hsiVdef]: -0.5 });
    const { [D.hsiGsFlag]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }));
    expect(screen.queryByTestId('hsi-gs-diamond')).toBeNull();
    expect(screen.queryByTestId('hsi-gs-scale')).toBeNull();
  });

  it.each([D.hsiVdef, D.hsiVertical, D.hsiGsFlag])(
    'flags GS N/A at the scale, with no scale or diamond, when %s is missing on the aircraft',
    async (name) => {
      await render(
        tree(withMissing(live({ [D.hsiVertical]: 1, [D.hsiGsFlag]: 0, [D.hsiVdef]: -0.5 }), name)),
      );
      expect(screen.queryByTestId('hsi-gs-scale')).toBeNull();
      expect(screen.queryByTestId('hsi-gs-diamond')).toBeNull();
      expect(svgText('hsi-gs-flag')).toBe('GS N/A');
      expect(paint('hsi-gs-flag-box', 'fill')).toBe(processColor(ink.flag));
      expect(label()).toContain('glideslope not available on this aircraft');
      expect(screen.getByTestId('hsi-cdi')).toBeTruthy();
    },
  );

  it('keeps the GS N/A flag at the scale, wholly inside the face', async () => {
    await render(tree(withMissing(live(), D.hsiVertical)));
    const box = screen.getByTestId('hsi-gs-flag-box');
    const x = Number(box.props.x);
    const width = Number(box.props.width);
    expect(x + width).toBeLessThanOrEqual(240);
    // Centred on the scale's centre line, where the diamond would ride.
    expect(Number(box.props.y) + Number(box.props.height) / 2).toBeCloseTo(C);
  });

  it('calls a GPS vertical path a glidepath and flags it GP', async () => {
    const view = await render(
      tree(live({ [D.hsiSource]: 2, [D.hsiVertical]: 1, [D.hsiVdef]: -0.5 })),
    );
    expect(label()).toContain('glidepath 0.5 dots down');
    expect(label()).not.toContain('glideslope');
    await view.rerender(tree(live({ [D.hsiSource]: 2, [D.hsiVertical]: 1, [D.hsiGsFlag]: 1 })));
    expect(svgText('hsi-gs-flag')).toBe('GP');
    expect(label()).toContain('glidepath flagged');
    await view.rerender(tree(withMissing(live({ [D.hsiSource]: 2 }), D.hsiVertical)));
    expect(label()).toContain('glidepath not available on this aircraft');
    expect(svgText('hsi-gs-flag')).toBe('GP N/A');
  });

  it('draws no scale at all when no glideslope is expected', async () => {
    await render(tree(live({ [D.hsiVertical]: 0, [D.hsiGsFlag]: 0 })));
    expect(screen.queryByTestId('hsi-gs-scale')).toBeNull();
    expect(screen.queryByTestId('hsi-gs-flag')).toBeNull();
    expect(label()).not.toContain('glideslope');
  });
});

describe('HSI bearing pointers', () => {
  it('shows BRG1 alone when only NAV1 has a signal', async () => {
    await render(tree(live({ [D.nav1Signal]: 1, [D.nav2Signal]: 0 })));
    // NAV1 bears 280 from a heading of 270: 10 degrees right of the lubber line.
    expect(rotationOf('hsi-brg1')).toBeCloseTo(10);
    expect(screen.queryByTestId('hsi-brg2')).toBeNull();
  });

  it('shows both pointers with both signals, BRG2 drawn double', async () => {
    await render(tree(live({ [D.nav1Signal]: 1, [D.nav2Signal]: 1 })));
    expect(screen.getByTestId('hsi-brg1')).toBeTruthy();
    expect(rotationOf('hsi-brg2')).toBeCloseTo(-175);
    expect(screen.getAllByTestId(/^hsi-brg1-line/)).toHaveLength(1);
    expect(screen.getAllByTestId(/^hsi-brg2-line/)).toHaveLength(2);
  });

  it('never draws a NAV2 bearing without its signal', async () => {
    await render(tree(live({ [D.nav1Signal]: 0, [D.nav2Signal]: 0, [D.nav2Bearing]: 0 })));
    expect(screen.queryByTestId('hsi-brg1')).toBeNull();
    expect(screen.queryByTestId('hsi-brg2')).toBeNull();
  });
});

describe('HSI GPS source', () => {
  it('turns the source, course and CDI magenta and shows no ident on GPS', async () => {
    await render(tree(live({ [D.hsiSource]: 2 })));
    expect(svgText('hsi-source')).toBe('GPS');
    expect(paint('hsi-source', 'fill')).toBe(processColor(ink.gpsNeedle));
    expect(paint('hsi-course', 'fill')).toBe(processColor(ink.gpsNeedle));
    expect(paint('hsi-cdi', 'stroke')).toBe(processColor(ink.gpsNeedle));
    expect(screen.queryByTestId('hsi-ident')).toBeNull();
    expect(label()).toMatch(/GPS, course 270/);
  });

  it('reads GPS2 in magenta too', async () => {
    await render(tree(live({ [D.hsiSource]: 3 })));
    expect(svgText('hsi-source')).toBe('GPS2');
    expect(paint('hsi-source', 'fill')).toBe(processColor(ink.gpsNeedle));
    expect(screen.queryByTestId('hsi-ident')).toBeNull();
  });

  it('shows the NAV2 ident on NAV2', async () => {
    await render(tree(live({ [D.hsiSource]: 1 })));
    expect(svgText('hsi-source')).toBe('NAV2');
    expect(svgText('hsi-ident')).toBe('ITMA');
  });

  it('claims no source colour for a source it does not know', async () => {
    await render(tree(live({ [D.hsiSource]: 7 })));
    expect(svgText('hsi-source')).toBe('SRC ?');
    expect(paint('hsi-source', 'fill')).toBe(processColor(ink.marking));
    expect(screen.queryByTestId('hsi-ident')).toBeNull();
    expect(paint('hsi-cdi', 'stroke')).toBe(processColor(ink.marking));
    expect(label()).toContain('source not available, course 270');
  });

  it('says the source is not available when its DataRef is missing on the aircraft', async () => {
    await render(tree(withMissing(live(), D.hsiSource)));
    expect(svgText('hsi-source')).toBe('SRC ?');
    expect(paint('hsi-source', 'fill')).toBe(processColor(ink.marking));
    expect(paint('hsi-cdi', 'stroke')).toBe(processColor(ink.marking));
    expect(label()).toContain('source not available');
  });
});

describe('HSI marker beacons', () => {
  it.each([
    ['outer', D.outerMarker, 'O', darkTheme.instrument.selected],
    ['middle', D.middleMarker, 'M', darkTheme.avionics.caution],
    ['inner', D.innerMarker, 'I', darkTheme.avionics.legend],
  ])('lights the %s marker with its letter and colour', async (name, ref, letter, colour) => {
    await render(tree(live({ [ref]: 1 })));
    expect(svgText('hsi-marker')).toBe(letter);
    expect(paint('hsi-marker', 'fill')).toBe(processColor(ink.face));
    expect(paint('hsi-marker-box', 'fill')).toBe(processColor(colour));
    expect(label()).toContain(`${name} marker`);
  });

  it('shows no marker box while none is lit', async () => {
    await render(tree(live()));
    expect(screen.queryByTestId('hsi-marker')).toBeNull();
    expect(screen.queryByTestId('hsi-marker-box')).toBeNull();
  });
});

describe('HSI states', () => {
  it('shows no value and draws nothing with no flight loaded', async () => {
    await render(
      tree(
        live(
          {},
          { health: { ...base.health, activity: 'noFlight', live: false, lastHeartbeatAt: NOW } },
        ),
      ),
    );
    expect(label()).toBe('HSI: no value');
    expect(screen.queryByTestId('hsi-cdi')).toBeNull();
    expect(screen.queryByTestId('hsi-source')).toBeNull();
    expect(screen.queryByTestId('hsi-nav-flag')).toBeNull();
  });

  it('fades the needles under the red X when the link goes stale', async () => {
    await render(tree(live({}, { state: 'reconnecting' })));
    expect(label()).toMatch(/, not live$/);
    expect(screen.getByText('NOT LIVE')).toBeTruthy();
    expect(groupOpacity('hsi-cdi')).toBe(NOT_LIVE_OPACITY);
    expect(groupOpacity('hsi-source')).toBe(NOT_LIVE_OPACITY);
  });

  it('draws at full strength while live', async () => {
    await render(tree(live()));
    expect(groupOpacity('hsi-cdi')).toBe(1);
  });

  it('is not available when the heading is missing on the aircraft', async () => {
    await render(tree(withMissing(live(), D.heading)));
    expect(label()).toBe('HSI: not available on this aircraft');
  });

  it.each([D.hsiHdef, D.hsiFromTo, D.hsiHorizontal])(
    'keeps the card and pointers and flags NAV N/A when %s is missing on the aircraft',
    async (name) => {
      await render(tree(withMissing(live({ [D.nav1Signal]: 1, [D.nav2Signal]: 1 }), name)));
      expect(screen.getByTestId('hsi-card')).toBeTruthy();
      expect(screen.getByTestId('hsi-brg1')).toBeTruthy();
      expect(screen.getByTestId('hsi-brg2')).toBeTruthy();
      expect(screen.getByTestId('hsi-heading-bug')).toBeTruthy();
      expect(screen.getByTestId('hsi-course-pointer')).toBeTruthy();
      expect(svgText('hsi-dme')).toBe('12.4 nm');
      expect(screen.queryByTestId('hsi-cdi')).toBeNull();
      expect(screen.queryByTestId('hsi-to-from')).toBeNull();
      expect(screen.queryByTestId('hsi-ident')).toBeNull();
      expect(svgText('hsi-nav-flag')).toBe('NAV N/A');
      expect(paint('hsi-nav-flag-box', 'fill')).toBe(processColor(ink.flag));
      expect(label()).toMatch(/^HSI, heading 270, /);
      expect(label()).toContain('course deviation not available on this aircraft');
      expect(label()).not.toContain('no NAV signal');
    },
  );

  it('flags CRS and says the course is not available when a received course has no value', async () => {
    await render(tree(withMissing(live(), D.hsiCourse)));
    expect(screen.queryByTestId('hsi-course-group')).toBeNull();
    expect(screen.queryByTestId('hsi-cdi')).toBeNull();
    expect(screen.queryByTestId('hsi-course')).toBeNull();
    expect(svgText('hsi-crs-flag')).toBe('CRS');
    expect(paint('hsi-crs-flag-box', 'fill')).toBe(processColor(ink.flag));
    expect(label()).toContain('NAV1, IKSO, course not available');
    expect(label()).not.toContain('dots');
  });

  it('draws no CRS flag while the course is shown', async () => {
    await render(tree(live()));
    expect(screen.queryByTestId('hsi-crs-flag')).toBeNull();
    expect(label()).not.toContain('course not available');
  });

  it('leaves a missing course to the NAV flag when no course is received either', async () => {
    await render(tree(withMissing(live({ [D.hsiFromTo]: 0 }), D.hsiCourse)));
    expect(screen.queryByTestId('hsi-crs-flag')).toBeNull();
    expect(svgText('hsi-nav-flag')).toBe('NAV');
    expect(label()).not.toContain('course');
  });
});

describe('HSI memoisation', () => {
  function resetRenders() {
    for (const key of Object.keys(instrumentRenders)) {
      instrumentRenders[key] = 0;
    }
  }

  it("does not redraw when only another instrument's value changes", async () => {
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
    expect(instrumentRenders['instrument-hsi'] ?? 0).toBe(0);
    expect(instrumentRenders['hsi-card-marks'] ?? 0).toBe(0);
  });

  it('redraws the face, but not the static card marks, when the heading changes', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(tree(live(), storage));
    resetRenders();
    await view.rerender(tree(live({ [D.heading]: 275 }), storage));
    expect(instrumentRenders['instrument-hsi']).toBe(1);
    expect(instrumentRenders['hsi-card-marks'] ?? 0).toBe(0);
    expect(rotationOf('hsi-card')).toBeCloseTo(85);
    expect(label()).toMatch(/^HSI, heading 275, /);
  });

  it('redraws when a nested value changes, such as the deviation', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(tree(live(), storage));
    resetRenders();
    await view.rerender(tree(live({ [D.hsiHdef]: -0.5 }), storage));
    expect(instrumentRenders['instrument-hsi']).toBe(1);
    expect(Number(screen.getByTestId('hsi-cdi').props.x1)).toBeCloseTo(C - 0.5 * PX_PER_DOT);
  });
});
