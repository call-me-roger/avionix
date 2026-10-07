import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { ENGINES_FEATURES } from '@/domain/engines/catalogue';
import * as enginePage from '@/domain/engines/engine-page';
import { EVERYWHERE } from '@/domain/panels/panel';
import { ENGINES_PAGES, ENGINES_PANEL } from '@/features/panels/engines/engines';
import { ENGINES_STORAGE_KEY } from '@/features/panels/engines/engines-preference';
import { EnginesPanel } from '@/features/panels/engines/EnginesPanel';
import { EnginesPreferenceProvider } from '@/features/panels/engines/EnginesPreferenceProvider';
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

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: enginesTelemetry(withEngines(C172_VALUES, 2, [1, 1]), NOW),
    compatibility: {
      ...enginesCompatibility(base.compatibility),
      identity: { ...base.compatibility.identity, description: 'Baron', icaoType: 'BE58' },
      identified: true,
    },
    ...overrides,
  };
}

const write = jest.fn(async () => undefined);
const activate = jest.fn(async () => 'ok' as const);
const hold = jest.fn(async () => 'ok' as const);
const actions: PanelScopeActions = { write, activate, hold };

function tree(snap: SessionSnapshot, storage: SettingsStorage = createMemorySettingsStorage()) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <EnginesPreferenceProvider storage={storage}>
          <PanelScope snapshot={snap} now={NOW} actions={actions}>
            <EnginesPanel />
          </PanelScope>
        </EnginesPreferenceProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}

function setWindow(width: number, height: number) {
  Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 } });
}

const original = Dimensions.get('window');
beforeEach(() => {
  jest.clearAllMocks();
  setWindow(390, 844);
});
afterAll(() => Dimensions.set({ window: original }));

describe('Engines panel descriptor (spec §4.11)', () => {
  it('declares id engines, title Engines, the four features, everywhere', () => {
    expect(ENGINES_PANEL.id).toBe('engines');
    expect(ENGINES_PANEL.title).toBe('Engines');
    expect(ENGINES_PANEL.supports).toEqual(EVERYWHERE);
    expect(ENGINES_PANEL.features).toEqual(ENGINES_FEATURES);
  });
});

describe('Engines pages on a phone (spec §4.10)', () => {
  it('starts on ENGINES with three page keys', async () => {
    await render(tree(snapshot()));
    expect(ENGINES_PAGES.map((page) => page.legend)).toEqual(['ENGINES', 'FUEL', 'ELEC']);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByTestId('engines-section')).toBeTruthy();
    expect(screen.queryByTestId('fuel-section')).toBeNull();
  });

  it('switches page and remembers it', async () => {
    const storage = createMemorySettingsStorage();
    await render(tree(snapshot(), storage));
    await fireEvent.press(screen.getByTestId('engines-page-fuel'));
    expect(screen.getByTestId('fuel-section')).toBeTruthy();
    await waitFor(async () =>
      expect(await storage.getItem(ENGINES_STORAGE_KEY)).toBe('{"page":"fuel"}'),
    );
    await fireEvent.press(screen.getByTestId('engines-page-elec'));
    expect(screen.getByTestId('electrical-section')).toBeTruthy();
  });

  it('opens on the stored page', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(ENGINES_STORAGE_KEY, '{"page":"elec"}');
    await render(tree(snapshot(), storage));
    expect(await screen.findByTestId('electrical-section')).toBeTruthy();
  });
});

describe('Engines on a wide window (spec §4.10)', () => {
  it('derives the ENGINES model once per snapshot for all three sections', async () => {
    setWindow(1024, 768);
    const derive = jest.spyOn(enginePage, 'enginesPage');
    try {
      const view = await render(tree(snapshot()));
      derive.mockClear();
      await view.rerender(tree(snapshot()));
      expect(derive).toHaveBeenCalledTimes(1);
    } finally {
      derive.mockRestore();
    }
  });

  it('shows all three sections and no page keys', async () => {
    setWindow(1024, 768);
    await render(tree(snapshot()));
    expect(screen.getByTestId('engines-wide')).toBeTruthy();
    expect(screen.getByTestId('engines-section')).toBeTruthy();
    expect(screen.getByTestId('fuel-section')).toBeTruthy();
    expect(screen.getByTestId('electrical-section')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('Engines before the probe has checked anything', () => {
  it('says nothing is missing or unidentified on any section', async () => {
    setWindow(1024, 768);
    await render(
      tree(
        snapshot({
          telemetry: {},
          compatibility: {
            ...base.compatibility,
            bindings: {},
            identity: { ...base.compatibility.identity, description: 'Baron', icaoType: 'BE58' },
            identified: true,
          },
        }),
      ),
    );
    expect(screen.getByTestId('engines-section')).toBeTruthy();
    expect(screen.getByTestId('fuel-section')).toBeTruthy();
    expect(screen.getByTestId('electrical-section')).toBeTruthy();
    expect(screen.queryByText(/couldn't be identified/)).toBeNull();
    expect(screen.queryByText(/Fuel tanks aren't available/)).toBeNull();
    expect(screen.queryByText(/Not available on/)).toBeNull();
    expect(screen.queryByText(/doesn't say which unit/)).toBeNull();
    expect(screen.queryByText(/type isn't supported/)).toBeNull();
  });
});

describe('Engines with no flight loaded (R5)', () => {
  it('draws no values', async () => {
    await render(
      tree(snapshot({ health: { ...base.health, activity: 'noFlight', lastHeartbeatAt: NOW } })),
    );
    expect(screen.queryByTestId('engines-section')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('Engines is read-only (R9)', () => {
  it('writes, activates and holds nothing, whatever is pressed on any page', async () => {
    setWindow(390, 844);
    await render(tree(snapshot()));
    for (const page of ENGINES_PAGES) {
      await fireEvent.press(screen.getByTestId(`engines-page-${page.id}`));
      for (const role of ['button', 'switch', 'tab'] as const) {
        for (const target of screen.queryAllByRole(role)) {
          await fireEvent.press(target);
        }
      }
    }
    expect(write).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
  });
});
