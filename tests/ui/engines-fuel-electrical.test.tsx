import { render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { UNITS_STORAGE_KEY } from '@/application/unit-preferences';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { ENGINE_CONFIG, FUEL } from '@/domain/engines/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';
import { DEFAULT_UNITS } from '@/domain/units/units';
import { ElectricalSection } from '@/features/panels/engines/ElectricalSection';
import { FuelSection } from '@/features/panels/engines/FuelSection';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

import { C172_VALUES, enginesCompatibility, enginesTelemetry } from '../helpers/engines';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const DIM = '#8b949e';

// GaugeBar hides itself from accessibility (see tests/ui/engines-gauges.test.tsx), so finding its
// parts requires including hidden elements — the repo's convention, not a brief deviation.
const HIDDEN = { includeHiddenElements: true };

function snapshot(
  values: Record<string, DataRefValue> = C172_VALUES,
  missing: readonly string[] = [],
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
      identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
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
        <PanelScope snapshot={snap} now={NOW} actions={actions}>
          <FuelSection />
          <ElectricalSection />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const rowTexts = (testID: string): unknown[] =>
  within(screen.getByTestId(testID))
    .getAllByText(/./)
    .map((text) => text.props.children);

describe('the FUEL page (spec §4.7)', () => {
  it('lists the used tanks by side, then the totalizer', async () => {
    await render(tree(snapshot()));
    expect(screen.getByText('FUEL KG')).toBeTruthy();
    expect(rowTexts('fuel-tank-0')).toEqual(['LEFT', '42']);
    expect(rowTexts('fuel-tank-1')).toEqual(['RIGHT', '42']);
    expect(screen.queryByTestId('fuel-tank-2')).toBeNull();
    expect(
      within(screen.getByTestId('fuel-tank-0')).getByTestId('gauge-pointer', HIDDEN),
    ).toBeTruthy();
    expect(screen.getByLabelText('Left tank, 42 kilograms')).toBeTruthy();
    expect(rowTexts('fuel-total')).toEqual(['TOTAL', '84']);
    expect(rowTexts('fuel-flow')).toEqual(['FLOW KG/H', '37.8']);
    expect(rowTexts('fuel-used')).toEqual(['USED', '12']);
    expect(rowTexts('fuel-endurance')).toEqual(['ENDURANCE', '2:13']);
    expect(screen.getByLabelText('Endurance 2 hours 13 minutes')).toBeTruthy();
  });

  it('switches to pounds with the pilot unit', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(UNITS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_UNITS, fuel: 'lb' }));
    await render(tree(snapshot(), storage));
    expect(await screen.findByText('FUEL LB')).toBeTruthy();
    expect(rowTexts('fuel-total')).toEqual(['TOTAL', '185']);
    expect(rowTexts('fuel-flow')).toEqual(['FLOW LB/H', '83.3']);
  });

  it('says when tanks are not available, and names totalizer rows that are not', async () => {
    await render(tree(snapshot(C172_VALUES, [FUEL.perTank, FUEL.used])));
    expect(screen.getByText("Fuel tanks aren't available on the Cessna 172.")).toBeTruthy();
    expect(screen.getByText('Not available on the Cessna 172: USED.')).toBeTruthy();
    expect(screen.queryByTestId('fuel-used')).toBeNull();
  });

  it('mutes the numbers when the values are not current', async () => {
    await render(tree({ ...snapshot(), state: 'reconnecting' }));
    const total = within(screen.getByTestId('fuel-total')).getByText('84');
    expect(StyleSheet.flatten(total.props.style).color).toBe(DIM);
  });
});

describe('the ELEC page (spec §4.8)', () => {
  it('lists the bus, the battery and one generator per engine', async () => {
    await render(tree(snapshot()));
    expect(rowTexts('elec-bus-1')).toEqual(['BUS 1', '28.1 V', '12 A']);
    expect(rowTexts('elec-batt-1')).toEqual(['BATT 1', '24.3 V', '−4 A']);
    expect(rowTexts('elec-gen-1')).toEqual(['GEN 1', '30 A']);
    expect(screen.getByLabelText('Battery 1, 24.3 volts, minus 4 amps')).toBeTruthy();
  });

  it('keeps GEN amps under the amps column with a hidden placeholder for volts', async () => {
    await render(tree(snapshot()));
    const placeholder = within(screen.getByTestId('elec-gen-1')).getByTestId(
      'elec-gen-1-no-volts',
      HIDDEN,
    );
    const value = within(screen.getByTestId('elec-bus-1')).getByText('28.1 V');
    expect(StyleSheet.flatten(placeholder.props.style).minWidth).toBe(
      StyleSheet.flatten(value.props.style).minWidth,
    );
    expect(placeholder.props.accessibilityElementsHidden).toBe(true);
    expect(placeholder.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('elec-bus-1-no-volts', HIDDEN)).toBeNull();
  });

  it('has no generator on a glider (Review Focus 1)', async () => {
    await render(tree(snapshot({ ...C172_VALUES, [ENGINE_CONFIG.count]: 0 })));
    expect(screen.queryByTestId('elec-gen-1')).toBeNull();
    expect(screen.getByTestId('elec-bus-1')).toBeTruthy();
    expect(rowTexts('fuel-flow')).toEqual(['FLOW KG/H', '—']);
  });
});
