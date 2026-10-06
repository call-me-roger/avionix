import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { processColor } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { SixPackView } from '@/features/panels/instruments/six-pack/SixPackView';
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

const actions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

function tree(
  snapshot: SessionSnapshot,
  storage = createMemorySettingsStorage(),
  fontsLoaded = false,
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="dark" fontsLoaded={fontsLoaded}>
      <UnitsProvider storage={storage}>
        <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
          <SixPackView contentWidth={400} windowHeight={900} landscape={false} />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const OTHER_FACES = [
  'instrument-airspeed',
  'instrument-attitude',
  'instrument-turn',
  'instrument-heading',
  'instrument-vertical-speed',
];

describe('six-pack', () => {
  it('names every instrument and its value', async () => {
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

  it('marks only the instrument whose DataRef is missing', async () => {
    await render(tree(withMissing(live(), D.pitch)));
    expect(screen.getByLabelText('Attitude: not available on this aircraft')).toBeTruthy();
    expect(screen.getByText('Not available on this aircraft')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();
    expect(screen.getByLabelText('Heading 270 degrees')).toBeTruthy();
  });

  it('keeps the last values with a NOT LIVE flag on every instrument when the link drops', async () => {
    await render(tree(live({ state: 'reconnecting' })));
    expect(screen.getByLabelText('Airspeed 112 knots, not live')).toBeTruthy();
    expect(
      screen.getByLabelText('Attitude: pitch 3 degrees up, bank 15 degrees right, not live'),
    ).toBeTruthy();
    expect(screen.getAllByText('NOT LIVE')).toHaveLength(6);
  });

  it('shows no values with no flight loaded', async () => {
    await render(
      tree(
        live({
          health: { ...base.health, activity: 'noFlight', live: false, lastHeartbeatAt: NOW },
        }),
      ),
    );
    expect(screen.getByLabelText('Airspeed: no value')).toBeTruthy();
    expect(screen.getByLabelText('Attitude: no value')).toBeTruthy();
    expect(screen.queryAllByText('NOT LIVE')).toHaveLength(0);
  });

  it('treats a non-numeric or non-finite sample as no value', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        telemetry: {
          ...snapshot.telemetry,
          ...telemetry({ [D.airspeed]: Number.NaN, [D.heading]: 'x' }),
        },
      }),
    );
    expect(screen.getByLabelText('Airspeed: no value')).toBeTruthy();
    expect(screen.getByLabelText('Heading: no value')).toBeTruthy();
  });

  it('keeps the turn coordinator for the ball when turn rate is missing', async () => {
    await render(tree(withMissing(live(), D.turnRate)));
    expect(screen.getByLabelText('Turn: ball 2 degrees right')).toBeTruthy();
  });

  it('describes a vertical speed beyond the dial by its true value', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        telemetry: { ...snapshot.telemetry, ...telemetry({ [D.verticalSpeed]: 2500 }) },
      }),
    );
    expect(screen.getByLabelText('Vertical speed climbing 2,500 feet per minute')).toBeTruthy();
  });

  it('re-renders only the altimeter when only the altitude changes', async () => {
    const storage = createMemorySettingsStorage();
    const first = live();
    const view = await render(tree(first, storage));
    for (const key of Object.keys(instrumentRenders)) {
      instrumentRenders[key] = 0;
    }
    await view.rerender(
      tree(
        { ...first, telemetry: { ...first.telemetry, ...telemetry({ [D.altitude]: 4600 }) } },
        storage,
      ),
    );
    expect(
      screen.getByLabelText('Altitude 4,600 feet, altimeter 29.92 inches, standard'),
    ).toBeTruthy();
    expect(instrumentRenders['instrument-altitude']).toBe(1);
    for (const other of OTHER_FACES) {
      expect(instrumentRenders[other] ?? 0).toBe(0);
    }
  });
});

describe('six-pack heading bug', () => {
  const withBug = (bug: number, snapshot = live()): SessionSnapshot => ({
    ...snapshot,
    telemetry: { ...snapshot.telemetry, ...telemetry({ [D.headingBug]: bug }) },
  });

  it('draws an orange bug on the card and says it', async () => {
    await render(tree(withBug(270)));
    expect(screen.getByLabelText('Heading 270 degrees, heading bug 270')).toBeTruthy();
    // react-native-svg hands a fill to the native view as `{ type, payload }`.
    expect(screen.getByTestId('dg-heading-bug').props.fill.payload).toBe(
      processColor(darkTheme.instrument.bug),
    );
  });

  it('pads the bug to three digits and calls north 360', async () => {
    const view = await render(tree(withBug(5)));
    expect(screen.getByLabelText('Heading 270 degrees, heading bug 005')).toBeTruthy();
    await view.rerender(tree(withBug(0)));
    expect(screen.getByLabelText('Heading 270 degrees, heading bug 360')).toBeTruthy();
  });

  it('shows no bug when the heading bug is missing on the aircraft', async () => {
    await render(tree(withMissing(withBug(270), D.headingBug)));
    expect(screen.queryByTestId('dg-heading-bug')).toBeNull();
    expect(screen.getByLabelText('Heading 270 degrees')).toBeTruthy();
  });

  it('shows no bug with no flight loaded', async () => {
    await render(
      tree(
        withBug(
          270,
          live({
            health: { ...base.health, activity: 'noFlight', live: false, lastHeartbeatAt: NOW },
          }),
        ),
      ),
    );
    expect(screen.queryByTestId('dg-heading-bug')).toBeNull();
    expect(screen.getByLabelText('Heading: no value')).toBeTruthy();
  });

  it('keeps the bug, faded with the card, when the link drops', async () => {
    await render(tree(withBug(270, live({ state: 'reconnecting' }))));
    expect(screen.getByTestId('dg-heading-bug')).toBeTruthy();
    expect(screen.getByLabelText('Heading 270 degrees, heading bug 270, not live')).toBeTruthy();
  });

  it('prints the card cardinals in B612 and its numbers in B612 Mono once the fonts load', async () => {
    await render(tree(withBug(270), createMemorySettingsStorage(), true));
    const fonts = screen
      .getAllByTestId(/^dg-card-label-/)
      .map((node) => [
        (node.children[0] as { props: { content?: unknown } }).props.content,
        node.props.font?.fontFamily,
      ]);
    expect(fonts).toContainEqual(['W', AVIONICS_FAMILIES.avionicsBold]);
    expect(fonts).toContainEqual(['N', AVIONICS_FAMILIES.avionicsBold]);
    expect(fonts).toContainEqual(['3', AVIONICS_FAMILIES.monoBold]);
    expect(fonts).toContainEqual(['33', AVIONICS_FAMILIES.monoBold]);
  });
});
