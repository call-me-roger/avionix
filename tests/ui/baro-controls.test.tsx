import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  FEATURE_ALTIMETER_SETTING,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { HPA_PER_INHG } from '@/domain/instruments/baro';
import { BaroControls } from '@/features/panels/instruments/BaroControls';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

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
    telemetry: telemetry({ [D.barometer]: 29.92 }),
    compatibility: {
      ...base.compatibility,
      features: base.compatibility.features.map((feature) => ({
        ...feature,
        status: 'available' as const,
      })),
    },
    ...overrides,
  };
}

const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

function tree(snapshot: SessionSnapshot, storage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PanelFrame title="Instruments" snapshot={snapshot} now={NOW} actions={actions}>
          <BaroControls />
        </PanelFrame>
      </UnitsProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  (actions.write as jest.Mock).mockClear();
});

describe('altimeter setting controls', () => {
  it('shows the read-back setting', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Altimeter setting: 29.92 inHg STD')).toBeTruthy();
  });

  it('steps by a hundredth of an inch from the read-back value', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Increase altimeter setting'));
    expect(actions.write).toHaveBeenLastCalledWith('altimeter-setting', D.barometer, 29.93);
    await fireEvent.press(screen.getByLabelText('Decrease altimeter setting'));
    expect(actions.write).toHaveBeenLastCalledWith('altimeter-setting', D.barometer, 29.91);
  });

  it('sets standard pressure in one press', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        telemetry: { ...snapshot.telemetry, ...telemetry({ [D.barometer]: 30.12 }) },
      }),
    );
    await fireEvent.press(screen.getByLabelText('Set standard pressure'));
    expect(actions.write).toHaveBeenLastCalledWith('altimeter-setting', D.barometer, 29.92);
  });

  it('works in hectopascals, writing inches', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem('avionix.units', JSON.stringify({ pressure: 'hPa' }));
    await render(tree(live(), storage));
    expect(await screen.findByLabelText('Altimeter setting: 1013 hPa STD')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Increase altimeter setting'));
    const writeMock = actions.write as jest.Mock;
    const sent = (writeMock.mock.calls.at(-1) as unknown[])[2] as number;
    expect(Math.round(sent * HPA_PER_INHG)).toBe(1014);
    await fireEvent.changeText(screen.getByLabelText('Altimeter setting'), '1009');
    await fireEvent.press(screen.getByLabelText('Set Altimeter setting'));
    expect((writeMock.mock.calls.at(-1) as unknown[])[2]).toBeCloseTo(1009 / HPA_PER_INHG, 6);
  });

  it('refuses a typed value out of range, in the pilot’s words', async () => {
    await render(tree(live()));
    await fireEvent.changeText(screen.getByLabelText('Altimeter setting'), '35');
    expect(screen.getByText('Enter a number from 28 to 31.5.')).toBeTruthy();
  });

  it('disables every control while a write is pending, so presses cannot stack', async () => {
    const snapshot = live();
    await render(
      tree({
        ...snapshot,
        operations: { [D.barometer]: { status: 'pending', failure: null, refusal: null, at: NOW } },
      }),
    );
    for (const name of [
      'Increase altimeter setting',
      'Decrease altimeter setting',
      'Set standard pressure',
    ]) {
      expect(screen.getByLabelText(name)).toBeDisabled();
    }
  });

  it('disables only the altimeter controls, with one sentence, when the DataRef is read-only', async () => {
    const snapshot = live({ telemetry: telemetry({ [D.barometer]: 29.92 }) });
    await render(
      tree({
        ...snapshot,
        compatibility: {
          ...snapshot.compatibility,
          features: snapshot.compatibility.features.map((feature) =>
            feature.id === FEATURE_ALTIMETER_SETTING
              ? {
                  ...feature,
                  status: 'unavailable' as const,
                  missing: [
                    {
                      name: D.barometer,
                      kind: 'dataref' as const,
                      purpose: 'Altimeter setting, written when you change it',
                      status: 'readOnly' as const,
                    },
                  ],
                }
              : feature,
          ),
          bindings: {
            ...snapshot.compatibility.bindings,
            [D.barometer]: { name: D.barometer, kind: 'dataref', status: 'readOnly' },
          },
        },
      }),
    );
    for (const name of [
      'Increase altimeter setting',
      'Decrease altimeter setting',
      'Set standard pressure',
      'Set Altimeter setting',
    ]) {
      expect(screen.getByLabelText(name)).toBeDisabled();
    }
    expect(
      screen.getAllByText(
        'Altimeter setting is not available on this aircraft: Altimeter setting, written when you change it.',
      ),
    ).toHaveLength(1);
    expect(screen.getByLabelText('Altimeter setting: 29.92 inHg STD')).toBeTruthy();
  });

  it('disables the steps with no reading yet', async () => {
    const snapshot = live();
    const { [D.barometer]: _dropped, ...rest } = snapshot.telemetry;
    await render(tree({ ...snapshot, telemetry: rest }));
    expect(screen.getByLabelText('Increase altimeter setting')).toBeDisabled();
    expect(screen.getByLabelText('Altimeter setting: no value')).toBeTruthy();
  });

  it('never steps the wrong way from a setting outside the window', async () => {
    // 27.50 is below the 28.00 stop: "−" would clamp up to 28.00, so it writes nothing.
    await render(tree(live({ telemetry: telemetry({ [D.barometer]: 27.5 }) })));
    await fireEvent.press(screen.getByLabelText('Decrease altimeter setting'));
    expect(actions.write).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Increase altimeter setting'));
    expect(actions.write).toHaveBeenLastCalledWith('altimeter-setting', D.barometer, 28);
  });
});
