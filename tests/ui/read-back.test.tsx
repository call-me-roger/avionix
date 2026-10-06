import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { READ_BACK_MS } from '@/domain/panels/read-back';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => undefined),
};

function snapshot(
  active: number,
  overrides: Partial<SessionSnapshot> = {},
  heartbeatAt = NOW,
): SessionSnapshot {
  const live = liveWith({ [D.com1Active]: active }, overrides);
  return { ...live, health: { ...live.health, lastHeartbeatAt: heartbeatAt } };
}

function Harness() {
  const readBack = useReadBack();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="watch"
        onPress={() =>
          readBack.watch({
            key: 'com1',
            name: D.com1Active,
            operation: C.com1Flip,
            expected: 118_005,
            failure: () => 'X-Plane did not swap COM1.',
          })
        }
      />
      <Text>{readBack.messageFor('com1') ?? 'no message'}</Text>
    </>
  );
}

function liveWith(
  values: Record<string, number | number[] | string>,
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, { value, receivedAt: NOW }]),
    ),
    ...overrides,
  };
}

function probeTree(Component: () => React.JSX.Element, s: SessionSnapshot, now = NOW) {
  return (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelFrame title="Radios" snapshot={s} now={now} actions={actions}>
        <Component />
      </PanelFrame>
    </ThemeProvider>
  );
}

const ok = (at: number) => ({
  [C.com1Flip]: { status: 'ok' as const, failure: null, refusal: null, at },
});

describe('useReadBack', () => {
  it('says nothing when X-Plane adopts the value', async () => {
    const view = await render(probeTree(Harness, snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    await view.rerender(probeTree(Harness, snapshot(118_005, { operations: ok(NOW) }), NOW + 500));
    await view.rerender(
      probeTree(Harness, snapshot(118_005, { operations: ok(NOW) }), NOW + READ_BACK_MS + 1000),
    );
    expect(screen.getByText('no message')).toBeTruthy();
  });

  it('says so when the value has not changed after the window', async () => {
    const view = await render(probeTree(Harness, snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    await view.rerender(probeTree(Harness, snapshot(121_500, { operations: ok(NOW) }), NOW + 1000));
    expect(screen.getByText('no message')).toBeTruthy();
    await view.rerender(
      probeTree(Harness, snapshot(121_500, { operations: ok(NOW) }), NOW + READ_BACK_MS),
    );
    expect(screen.getByText('X-Plane did not swap COM1.')).toBeTruthy();
  });

  it('never gives a late sentence once adopted, even if the pilot then changes it in X-Plane', async () => {
    const view = await render(probeTree(Harness, snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    await view.rerender(probeTree(Harness, snapshot(118_005, { operations: ok(NOW) }), NOW + 500));
    await view.rerender(
      probeTree(Harness, snapshot(122_800, { operations: ok(NOW) }), NOW + READ_BACK_MS + 1000),
    );
    expect(screen.getByText('no message')).toBeTruthy();
  });

  it('gives no verdict when the link drops during the window', async () => {
    const view = await render(probeTree(Harness, snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    const dropped = snapshot(121_500, { operations: ok(NOW), state: 'reconnecting' });
    await view.rerender(probeTree(Harness, dropped, NOW + READ_BACK_MS + 1000));
    await view.rerender(
      probeTree(Harness, snapshot(121_500, { operations: ok(NOW) }, NOW + 9000), NOW + 9000),
    );
    expect(screen.getByText('no message')).toBeTruthy();
  });

  it('clears the old sentence when the same key is watched again', async () => {
    const view = await render(probeTree(Harness, snapshot(121_500), NOW));
    await fireEvent.press(screen.getByLabelText('watch'));
    await view.rerender(
      probeTree(Harness, snapshot(121_500, { operations: ok(NOW) }), NOW + READ_BACK_MS),
    );
    expect(screen.getByText('X-Plane did not swap COM1.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('watch'));
    expect(screen.getByText('no message')).toBeTruthy();
  });
});

function PendingProbe() {
  const readBack = useReadBack();
  return (
    <>
      <Text testID="pending">{String(readBack.pendingExpected('alt'))}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="watch"
        onPress={() =>
          readBack.watch({
            key: 'alt',
            name: D.altitude,
            operation: D.altitude,
            expected: 5100,
            failure: () => 'not taken',
          })
        }
      />
    </>
  );
}

it('reports the value a waiting watch expects, and null once settled', async () => {
  const view = await render(probeTree(PendingProbe, liveWith({ [D.altitude]: 5000 })));
  expect(screen.getByTestId('pending').props.children).toBe('null');
  await fireEvent.press(screen.getByLabelText('watch'));
  expect(screen.getByTestId('pending').props.children).toBe('5100');
  const ok = { [D.altitude]: { status: 'ok' as const, failure: null, refusal: null, at: NOW } };
  await view.rerender(
    probeTree(PendingProbe, liveWith({ [D.altitude]: 5100 }, { operations: ok }), NOW + 100),
  );
  expect(screen.getByTestId('pending').props.children).toBe('null');
});
