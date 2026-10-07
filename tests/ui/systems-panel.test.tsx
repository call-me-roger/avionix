import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { ActivationResult } from '@/domain/panels/activation';
import type { HoldPhase } from '@/domain/panels/hold-lease';
import { EVERYWHERE } from '@/domain/panels/panel';
import type { DataRefValue } from '@/domain/simulator/types';
import { EXTERIOR_LIGHTS, SYSTEMS_FEATURES, TRIMS } from '@/domain/systems/controls';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { SYSTEMS_PAGES, SYSTEMS_PANEL } from '@/features/panels/systems/systems';
import { SystemsPreferenceProvider } from '@/features/panels/systems/SystemsPreferenceProvider';
import { SystemsPanel } from '@/features/panels/systems/SystemsPanel';
import { SYSTEMS_STORAGE_KEY } from '@/features/panels/systems/systems-preference';
import { ThemeProvider } from '@/theme/theme-context';

import { SYSTEMS_VALUES, systemsCompatibility, systemsTelemetry } from '../helpers/systems';

jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }));

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);
const identified: SessionSnapshot['compatibility'] = {
  ...systemsCompatibility(base.compatibility),
  identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
  identified: true,
};

const BEACON = EXTERIOR_LIGHTS[0]!;
const PITCH = TRIMS[0]!;

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: systemsTelemetry(SYSTEMS_VALUES, NOW),
    compatibility: identified,
    ...overrides,
  };
}

/** X-Plane accepted `name` at NOW: a read-back watch then has three seconds. */
const accepted = (name: string): SessionSnapshot['operations'] => ({
  [name]: { status: 'ok', failure: null, refusal: null, at: NOW },
});

const hold = jest.fn<Promise<ActivationResult>, [string, string, HoldPhase]>(async () => 'ok');
const activate = jest.fn<Promise<ActivationResult>, [string, string, number?]>(async () => 'ok');
const write = jest.fn<Promise<void>, [string, string, DataRefValue]>(async () => undefined);
const actions: PanelScopeActions = { write, activate, hold };

function tree(
  snap: SessionSnapshot,
  storage: SettingsStorage = createMemorySettingsStorage(),
  now = NOW,
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <SystemsPreferenceProvider storage={storage}>
        <PanelScope snapshot={snap} now={now} actions={actions}>
          <SystemsPanel />
        </PanelScope>
      </SystemsPreferenceProvider>
    </ThemeProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('Systems panel descriptor', () => {
  it('declares id systems, title Systems, the ten features, everywhere', () => {
    expect(SYSTEMS_PANEL.id).toBe('systems');
    expect(SYSTEMS_PANEL.title).toBe('Systems');
    expect(SYSTEMS_PANEL.supports).toEqual(EVERYWHERE);
    expect([...SYSTEMS_PANEL.features].sort()).toEqual([...SYSTEMS_FEATURES].sort());
    expect(SYSTEMS_PANEL.features.length).toBe(10);
  });

  it('declares only features the generic profile has', () => {
    const known = new Set(GENERIC_PROFILE.features.map((feature) => feature.id));
    for (const feature of SYSTEMS_PANEL.features) {
      expect(known.has(feature)).toBe(true);
    }
  });
});

describe('Systems panel on a phone', () => {
  const original = Dimensions.get('window');
  beforeEach(() => {
    Dimensions.set({ window: { width: 390, height: 844, scale: 1, fontScale: 1 } });
  });
  afterEach(async () => {
    await act(async () => {
      Dimensions.set({ window: original });
    });
  });

  it('shows the four page keys as tabs, FLIGHT selected on first use', async () => {
    await render(tree(snapshot()));
    for (const page of SYSTEMS_PAGES) {
      const key = screen.getByTestId(`systems-page-${page.id}`);
      expect(key.props.accessibilityRole).toBe('tab');
      expect(key.props.accessibilityState).toEqual({ selected: page.id === 'flight' });
      expect(within(key).getByText(page.legend)).toBeTruthy();
    }
    expect(screen.getByText('FLAPS')).toBeTruthy();
    expect(screen.queryByText('EXTERIOR LIGHTS')).toBeNull();
  });

  it('shows LIGHTS and hides FLAPS when LIGHTS is pressed, saving the choice under avionix.systems', async () => {
    const storage = createMemorySettingsStorage();
    await render(tree(snapshot(), storage));
    await fireEvent.press(screen.getByTestId('systems-page-lights'));
    expect(screen.getByText('EXTERIOR LIGHTS')).toBeTruthy();
    expect(screen.queryByText('FLAPS')).toBeNull();
    expect(screen.getByTestId('systems-page-lights').props.accessibilityState).toEqual({
      selected: true,
    });
    await waitFor(async () => {
      expect(await storage.getItem(SYSTEMS_STORAGE_KEY)).toBe(JSON.stringify({ page: 'lights' }));
    });
  });

  it('restores the saved page on a fresh render', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(SYSTEMS_STORAGE_KEY, JSON.stringify({ page: 'ice' }));
    await render(tree(snapshot(), storage));
    expect(await screen.findByTestId('switch-pitot')).toBeTruthy();
    expect(screen.getByTestId('systems-page-ice').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.queryByText('FLAPS')).toBeNull();
  });

  it('keeps a read-back failure across a page switch, the panel owning one useReadBack', async () => {
    const { rerender } = await render(tree(snapshot()));
    await fireEvent.press(screen.getByTestId('systems-page-lights'));
    await fireEvent.press(screen.getByLabelText('Beacon, off'));
    await rerender(tree(snapshot({ operations: accepted(BEACON.on) }), undefined, NOW + 3000));
    const message = "The Cessna 172 didn't turn the beacon on. It's still off.";
    expect(screen.getByText(message)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('systems-page-flight'));
    expect(screen.queryByText(message)).toBeNull();

    await fireEvent.press(screen.getByTestId('systems-page-lights'));
    expect(screen.getByText(message)).toBeTruthy();
  });

  it('releases a trim hold when the page changes mid-hold, since the unit unmounts', async () => {
    await render(tree(snapshot()));
    await fireEvent(screen.getByLabelText('Pitch trim nose up'), 'pressIn');
    expect(hold).toHaveBeenCalledWith('trim', PITCH.increase.command, 'press');
    await fireEvent.press(screen.getByTestId('systems-page-ice'));
    expect(hold).toHaveBeenLastCalledWith('trim', PITCH.increase.command, 'release');
  });
});

describe('Systems panel on a wide layout', () => {
  const original = Dimensions.get('window');
  beforeEach(() => {
    Dimensions.set({ window: { width: 820, height: 1180, scale: 1, fontScale: 1 } });
  });
  afterEach(async () => {
    await act(async () => {
      Dimensions.set({ window: original });
    });
  });

  it('draws two columns with no page keys: ENGINE and LIGHTS on the left, FLIGHT and ICE on the right', async () => {
    await render(tree(snapshot()));
    for (const page of SYSTEMS_PAGES) {
      expect(screen.queryByTestId(`systems-page-${page.id}`)).toBeNull();
    }
    const left = screen.getByTestId('systems-wide-left');
    const right = screen.getByTestId('systems-wide-right');
    expect(within(left).getByText('ELECTRICAL')).toBeTruthy();
    expect(within(left).getByText('EXTERIOR LIGHTS')).toBeTruthy();
    expect(within(right).getByText('FLAPS')).toBeTruthy();
    expect(within(right).getByText('ANTI-ICE')).toBeTruthy();
  });
});
