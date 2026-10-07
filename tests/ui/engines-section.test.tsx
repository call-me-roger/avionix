import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { ENGINE_CONFIG, GAUGES } from '@/domain/engines/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';
import { EnginesPreferenceProvider } from '@/features/panels/engines/EnginesPreferenceProvider';
import { EnginesSection } from '@/features/panels/engines/EnginesSection';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

import {
  C172_VALUES,
  enginesCompatibility,
  enginesTelemetry,
  withEngines,
} from '../helpers/engines';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const WARNING = '#ff4a3d';
const DIM = '#8b949e';

function snapshot(
  values: Record<string, DataRefValue> = C172_VALUES,
  missing: readonly string[] = [],
  identity: { description: string; icaoType: string } = {
    description: 'Cessna 172',
    icaoType: 'C172',
  },
  heartbeatAt = NOW,
): SessionSnapshot {
  const compatibility = enginesCompatibility(
    base.compatibility,
    Object.fromEntries(missing.map((name) => [name, 'missing' as const])),
  );
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: heartbeatAt },
    telemetry: enginesTelemetry(values, NOW),
    compatibility: {
      ...compatibility,
      identity: { ...base.compatibility.identity, ...identity },
      identified: true,
    },
  };
}

const actions: PanelScopeActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

function tree(snap: SessionSnapshot, storage: SettingsStorage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <EnginesPreferenceProvider storage={storage}>
          <PanelScope snapshot={snap} now={NOW} actions={actions}>
            <EnginesSection />
          </PanelScope>
        </EnginesPreferenceProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const cellText = (id: string, engine = 1): unknown =>
  within(screen.getByTestId(`engine-cell-${id}-${engine}`)).getAllByText(/./)[0]?.props.children;

describe('the ENGINES page (spec §4.2–§4.6)', () => {
  it('draws a C172: an RPM dial and the piston rows with their units', async () => {
    await render(tree(snapshot()));
    expect(screen.getByLabelText('Engine 1 RPM 2,350')).toBeTruthy();
    for (const label of ['MAP IN', 'FF KG/H', 'EGT °C', 'CHT °C', 'OIL P PSI', 'OIL T °C']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(cellText('egt')).toBe('716');
    expect(screen.getByLabelText('Engine 1 EGT 716 degrees Celsius')).toBeTruthy();
    expect(screen.queryByTestId('engine-row-epr')).toBeNull();
  });

  it('draws a turboprop twin: two TRQ dials and an NG row', async () => {
    await render(tree(snapshot(withEngines(C172_VALUES, 2, [9, 9]))));
    expect(within(screen.getByTestId('engine-dials')).getAllByText('TRQ')).toHaveLength(2);
    expect(screen.getByText('NG %')).toBeTruthy();
    expect(screen.getByTestId('engine-cell-itt-2')).toBeTruthy();
  });

  it('says engines 5 and up are not shown, and names an unsupported type', async () => {
    await render(tree(snapshot(withEngines(C172_VALUES, 6, [7, 7, 7, 6, 7, 7]))));
    expect(screen.getByText("Engines 5 and up aren't shown.")).toBeTruthy();
    expect(screen.getByText("Engine 4's type isn't supported.")).toBeTruthy();
  });

  it('names the gauges the aircraft does not publish, and draws the rest (R6)', async () => {
    await render(tree(snapshot(C172_VALUES, [GAUGES.cht.name])));
    expect(screen.getByText('Not available on the Cessna 172: CHT.')).toBeTruthy();
    expect(screen.queryByTestId('engine-row-cht')).toBeNull();
    expect(screen.getByTestId('engine-row-egt')).toBeTruthy();
  });

  it('says the engines could not be identified without the count, and nothing else', async () => {
    await render(tree(snapshot(C172_VALUES, [ENGINE_CONFIG.count])));
    expect(screen.getByText("The engines on the Cessna 172 couldn't be identified.")).toBeTruthy();
    expect(screen.queryByTestId('engine-dials')).toBeNull();
    expect(screen.queryByLabelText('Lean assist')).toBeNull();
  });

  it('says a glider has no engines (Review Focus 1)', async () => {
    await render(tree(snapshot({ ...C172_VALUES, [ENGINE_CONFIG.count]: 0 })));
    expect(screen.getByText('The Cessna 172 has no engines.')).toBeTruthy();
    expect(screen.queryByLabelText('Lean assist')).toBeNull();
  });

  it('says when the aircraft does not publish a temperature unit', async () => {
    await render(tree(snapshot(C172_VALUES, [ENGINE_CONFIG.egtIsCelsius])));
    expect(
      screen.getByText("The Cessna 172 doesn't say which unit its EGT uses; shown as reported."),
    ).toBeTruthy();
    expect(screen.getByText('EGT °')).toBeTruthy();
  });

  it('colours a value in a red band, and dims every value when not current', async () => {
    const hot = { ...C172_VALUES, [GAUGES.cht.name]: [250, ...new Array<number>(15).fill(0)] };
    const view = await render(tree(snapshot(hot)));
    const chtText = within(screen.getByTestId('engine-cell-cht-1')).getByText('250');
    expect(StyleSheet.flatten(chtText.props.style).color).toBe(WARNING);
    await view.rerender(tree(snapshot(hot, [], undefined, NOW - 10_000)));
    const dimmed = within(screen.getByTestId('engine-cell-cht-1')).getByText('250');
    expect(StyleSheet.flatten(dimmed.props.style).color).toBe(DIM);
  });

  it('speaks an unused cell on a mixed twin', async () => {
    await render(tree(snapshot(withEngines(C172_VALUES, 2, [1, 5]))));
    expect(screen.getByLabelText('manifold pressure, not used on engine 2')).toBeTruthy();
  });
});

describe('lean assist (spec §4.6)', () => {
  it('marks the peak and shows ΔPEAK while on, and clears it when off', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(tree(snapshot(), storage));
    const key = screen.getByLabelText('Lean assist');
    expect(key.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(key);
    expect(screen.getByLabelText('Lean assist').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByText('ΔPEAK °C')).toBeTruthy();
    expect(screen.getByLabelText('Engine 1 at peak EGT')).toBeTruthy();
    expect(
      within(screen.getByTestId('engine-cell-egt-1')).getByTestId('gauge-peak', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();

    // 20 °F below the 1,320 °F peak is 11 °C below it.
    const leaner = { ...C172_VALUES, [GAUGES.egt.name]: [1300, ...new Array<number>(15).fill(0)] };
    await view.rerender(tree(snapshot(leaner), storage));
    expect(screen.getByLabelText('Engine 1 11 degrees below peak EGT')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Lean assist'));
    expect(screen.queryByTestId('engine-row-lean')).toBeNull();
  });

  it('does not show one aircraft’s peak against another’s EGT (Review Focus 4)', async () => {
    const storage = createMemorySettingsStorage();
    const view = await render(tree(snapshot(), storage));
    await fireEvent.press(screen.getByLabelText('Lean assist'));
    const other = { ...C172_VALUES, [GAUGES.egt.name]: [1300, ...new Array<number>(15).fill(0)] };
    await view.rerender(
      tree(snapshot(other, [], { description: 'Piper Archer', icaoType: 'P28A' }), storage),
    );
    expect(screen.getByLabelText('Engine 1 at peak EGT')).toBeTruthy();
    expect(screen.queryByLabelText(/below peak EGT/)).toBeNull();
  });
});
