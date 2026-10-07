import { act, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { deriveAvailability } from '@/domain/aircraft/availability';
import {
  FEATURE_FLIGHT_INSTRUMENTS,
  FEATURE_HEADING_CONTROL,
  FEATURE_NAV1,
  FEATURE_NAV2,
  FEATURE_NAV_AIDS,
  FEATURE_NAV_COURSE,
  FEATURE_NAV_DEVIATION,
  FEATURE_NAV_GLIDESLOPE,
  FEATURE_NAV_SOURCE,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE } from '@/domain/panels/panel';
import { NAVIGATION_PANEL, NavigationPanel } from '@/features/panels/navigation/NavigationPanel';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

type Status = 'ok' | 'missing' | 'readOnly';

function telemetry(values: Record<string, number | string>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

/** NAV1 on course 270, heading steady, a valid TO on the deviation. */
const VALUES: Record<string, number> = {
  [D.heading]: 270,
  [D.headingBug]: 270,
  [D.hsiSource]: 0,
  [D.hsiCourse]: 270,
  [D.hsiHdef]: 0.8,
  [D.hsiFromTo]: 1,
  [D.hsiHorizontal]: 1,
  [D.hsiVdef]: 0,
  [D.hsiVertical]: 0,
  [D.hsiGsFlag]: 0,
};

/** Every binding the panel reads, 'ok' unless overridden, through the real deriver. */
function bindingResults(overrides: Partial<Record<string, Status>> = {}) {
  const names: Record<string, 'dataref' | 'command'> = {
    [D.hsiSource]: 'dataref',
    [D.hsiCourse]: 'dataref',
    [C.hsiDirect]: 'command',
    [D.hsiHdef]: 'dataref',
    [D.hsiFromTo]: 'dataref',
    [D.hsiHorizontal]: 'dataref',
    [D.hsiVdef]: 'dataref',
    [D.hsiVertical]: 'dataref',
    [D.hsiGsFlag]: 'dataref',
  };
  const results: Record<string, { name: string; kind: 'dataref' | 'command'; status: Status }> = {};
  for (const [name, kind] of Object.entries(names)) {
    results[name] = { name, kind, status: overrides[name] ?? 'ok' };
  }
  return results;
}

function compatibilityFor(overrides: Partial<Record<string, Status>> = {}) {
  const bindings = bindingResults(overrides);
  return {
    ...base.compatibility,
    bindings,
    features: deriveAvailability(GENERIC_PROFILE, bindings),
  };
}

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: telemetry(VALUES),
    compatibility: compatibilityFor(),
    ...overrides,
  };
}

const actions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => 'ok' as const),
};

function tree(snapshot: SessionSnapshot, storage: SettingsStorage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PanelScope snapshot={snapshot} now={NOW} actions={actions}>
          <NavigationPanel />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
}

describe('Navigation panel descriptor', () => {
  it('declares the five new features, the navaid identifiers, heading and flight instruments', () => {
    expect(NAVIGATION_PANEL.id).toBe('navigation');
    expect(NAVIGATION_PANEL.title).toBe('Navigation');
    expect(NAVIGATION_PANEL.supports).toEqual(EVERYWHERE);
    expect([...NAVIGATION_PANEL.features].sort()).toEqual(
      [
        FEATURE_NAV_DEVIATION,
        FEATURE_NAV_GLIDESLOPE,
        FEATURE_NAV_SOURCE,
        FEATURE_NAV_COURSE,
        FEATURE_NAV_AIDS,
        FEATURE_NAV1,
        FEATURE_NAV2,
        FEATURE_FLIGHT_INSTRUMENTS,
        FEATURE_HEADING_CONTROL,
      ].sort(),
    );
  });

  it('declares only features the generic profile has', () => {
    const known = new Set(GENERIC_PROFILE.features.map((feature) => feature.id));
    for (const feature of NAVIGATION_PANEL.features) {
      expect(known.has(feature)).toBe(true);
    }
  });
});

describe('Navigation panel', () => {
  it('composes the HSI and the NAV control unit', async () => {
    await render(tree(live()));
    expect(screen.getByTestId('instrument-hsi')).toBeTruthy();
    expect(screen.getByTestId('nav-controls')).toBeTruthy();
  });

  it('stacks the HSI above the NAV unit on a phone, the HSI capped by the window height', async () => {
    const original = Dimensions.get('window');
    // contentWidth 568 (600 − 2×16, under the 720 wide threshold); height cap round(500×0.6) =
    // 300, so the height rule bites first.
    Dimensions.set({ window: { width: 600, height: 500, scale: 1, fontScale: 1 } });
    try {
      await render(tree(live()));
      const columns = StyleSheet.flatten(screen.getByTestId('nav-columns').props.style);
      expect(columns.flexDirection).toBe('column');
      const hsi = StyleSheet.flatten(screen.getByTestId('instrument-hsi').props.style);
      expect(hsi.width).toBe(300);
      expect(hsi.height).toBe(300);
    } finally {
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
  });

  it('places the HSI and the NAV unit side by side on a wide layout, each half the content width', async () => {
    const original = Dimensions.get('window');
    // contentWidth 992 (1024 − 32), gap 8: half is 492, well under the height cap of 1200.
    Dimensions.set({ window: { width: 1024, height: 2000, scale: 1, fontScale: 1 } });
    try {
      await render(tree(live()));
      const columns = StyleSheet.flatten(screen.getByTestId('nav-columns').props.style);
      expect(columns.flexDirection).toBe('row');
      const left = screen.getByTestId('nav-wide-left');
      const right = screen.getByTestId('nav-wide-right');
      expect(within(left).getByTestId('instrument-hsi')).toBeTruthy();
      expect(within(right).getByTestId('nav-controls')).toBeTruthy();
      const hsi = StyleSheet.flatten(within(left).getByTestId('instrument-hsi').props.style);
      expect(hsi.width).toBe(492);
    } finally {
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
  });
});
