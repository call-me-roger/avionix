import { render, screen } from '@testing-library/react-native';
import React from 'react';

import {
  type OperationOutcome,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { ActivationResult } from '@/domain/panels/activation';
import type { HoldPhase } from '@/domain/panels/hold-lease';
import type { DataRefValue } from '@/domain/simulator/types';
import { EXTERIOR_LIGHTS, FLAPS, GEAR } from '@/domain/systems/controls';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { type ReadBack, useReadBack } from '@/features/panels/primitives/useReadBack';
import {
  EngineSection,
  FlightSection,
  IceSection,
  LightsSection,
} from '@/features/panels/systems/sections';
import { ThemeProvider } from '@/theme/theme-context';

import { SYSTEMS_VALUES, systemsCompatibility, systemsTelemetry } from '../helpers/systems';

jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }));

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const identified: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
  identified: true,
};

type Status = 'ok' | 'missing' | 'readOnly';

interface SnapshotOptions {
  values?: Record<string, DataRefValue | undefined>;
  bindings?: Partial<Record<string, Status>>;
  operations?: Record<string, OperationOutcome>;
  stale?: boolean;
}

function snapshot({
  values = {},
  bindings = {},
  operations = {},
  stale = false,
}: SnapshotOptions = {}): SessionSnapshot {
  const merged: Record<string, DataRefValue> = {};
  for (const [name, value] of Object.entries({ ...SYSTEMS_VALUES, ...values })) {
    if (value !== undefined) {
      merged[name] = value;
    }
  }
  return {
    ...base,
    state: stale ? 'reconnecting' : 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: systemsTelemetry(merged, NOW),
    compatibility: systemsCompatibility(identified, bindings),
    operations,
  };
}

const hold = jest.fn<Promise<ActivationResult>, [string, string, HoldPhase]>(async () => 'ok');
const activate = jest.fn<Promise<ActivationResult>, [string, string, number?]>(async () => 'ok');
const write = jest.fn<Promise<void>, [string, string, DataRefValue]>(async () => undefined);
const actions: PanelScopeActions = { write, activate, hold };

type Section = (props: { readBack: ReadBack }) => React.JSX.Element;

function Harness({ section: Component }: { section: Section }) {
  const readBack = useReadBack();
  return <Component readBack={readBack} />;
}

function tree(section: Section, snap: SessionSnapshot, now = NOW) {
  return (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelScope snapshot={snap} now={now} actions={actions}>
        <Harness section={section} />
      </PanelScope>
    </ThemeProvider>
  );
}

const NOT_AVAILABLE = /not available|isn't available/i;

/** Every systems binding result removed: the state right after connect. */
function unchecked(names?: readonly string[]): SessionSnapshot {
  const snap = snapshot();
  const bindings = { ...snap.compatibility.bindings };
  for (const name of names ?? Object.keys(bindings)) {
    delete bindings[name];
  }
  return { ...snap, compatibility: { ...snap.compatibility, bindings } };
}

describe.each([
  ['ENGINE', EngineSection],
  ['LIGHTS', LightsSection],
  ['FLIGHT', FlightSection],
  ['ICE', IceSection],
])('the %s page while names are being checked', (_page, section) => {
  it('prints no "not available" sentence', async () => {
    await render(tree(section, unchecked()));
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it('still prints them once the names are known to be missing', async () => {
    const snap = snapshot();
    const missing = Object.fromEntries(
      Object.keys(snap.compatibility.bindings).map((name) => [name, 'missing' as const]),
    );
    await render(tree(section, snapshot({ bindings: missing })));
    expect(screen.queryAllByText(NOT_AVAILABLE).length).toBeGreaterThan(0);
  });
});

describe('a unit with one command unchecked', () => {
  it('draws its keys and does not list the unchecked command', async () => {
    await render(tree(FlightSection, unchecked([FLAPS.down, GEAR.up])));
    expect(screen.getByLabelText('Flaps up one notch')).toBeTruthy();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it('lists a command once it is known to be missing', async () => {
    await render(tree(FlightSection, snapshot({ bindings: { [FLAPS.down]: 'missing' } })));
    expect(screen.getByText('Not available on the Cessna 172: FLAPS DOWN.')).toBeTruthy();
  });
});

it('lists a light whose state is missing while another light is unchecked', async () => {
  const snap = snapshot({ bindings: { [EXTERIOR_LIGHTS[0]!.state]: 'missing' } });
  const bindings = { ...snap.compatibility.bindings };
  delete bindings[EXTERIOR_LIGHTS[1]!.state];
  await render(
    tree(LightsSection, { ...snap, compatibility: { ...snap.compatibility, bindings } }),
  );
  expect(screen.getByText('Not available on the Cessna 172: BCN.')).toBeTruthy();
});
