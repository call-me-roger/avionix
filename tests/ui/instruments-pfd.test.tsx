import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { PfdView } from '@/features/panels/instruments/pfd/PfdView';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

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

// The Mach and altimeter-setting boxes are hidden from screen readers (the airspeed and altitude
// labels read them aloud), so the queries that find them must include hidden elements.
const HIDDEN = { includeHiddenElements: true };

const actions = { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };

function tree(snapshot: SessionSnapshot, storage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="dark">
      <UnitsProvider storage={storage}>
        <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
          <PfdView width={360} />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
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

  it('flags every instrument NOT LIVE when the link drops, keeping values', async () => {
    await render(tree(live({ state: 'reconnecting' })));
    expect(screen.getAllByText('NOT LIVE')).toHaveLength(6);
    expect(screen.getByLabelText('Heading 270 degrees, not live')).toBeTruthy();
  });

  it('marks only the missing instrument unavailable', async () => {
    await render(tree(withMissing(live(), D.verticalSpeed)));
    expect(screen.getByLabelText('Vertical speed: not available on this aircraft')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed 112 knots')).toBeTruthy();
  });
});
