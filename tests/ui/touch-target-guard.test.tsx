import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { ConnectorDiscovery } from '@/application/connector-discovery';
import { PANEL_LAYOUT_STORAGE_KEY, SETUP_ROUTE } from '@/application/panel-layout';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { DeviceLayout } from '@/domain/panels/device-layout';
import { PANEL_IDS, type RegisteredPanel } from '@/features/panels/registry';
import { AppShell } from '@/features/shell/AppShell';
import { silentLogger } from '@/infrastructure/logging/logger';
import { holdScreenAwake, releaseScreenAwake } from '@/platform/keep-awake';
import { ThemeProvider } from '@/theme/theme-context';

import { createFakeServiceBrowser } from '../support/fake-service-browser';

let mockLayout: DeviceLayout = { deviceClass: 'phone', orientation: 'portrait' };
// AppShell reads the safe-area insets; this mock supplies zero insets without a provider.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/hooks/useDeviceLayout', () => ({ useDeviceLayout: () => mockLayout }));
jest.mock('@/platform/keep-awake', () => ({
  KEEP_AWAKE_TAG: 'avionix-panel',
  holdScreenAwake: jest.fn(async () => undefined),
  releaseScreenAwake: jest.fn(async () => undefined),
}));

const NOW = Date.now();
const base = initialSnapshot(GENERIC_PROFILE, 5);

function liveSnapshot(): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    compatibility: {
      ...base.compatibility,
      features: base.compatibility.features.map((feature) => ({
        ...feature,
        status: 'available' as const,
      })),
    },
  };
}

function makeServices(snapshot: Partial<SessionSnapshot> = {}, storage?: SettingsStorage) {
  const store = new Store<SessionSnapshot>({ ...base, ...snapshot });
  const session = {
    store,
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    pair: jest.fn(async () => undefined),
    write: jest.fn(async () => undefined),
    activate: jest.fn(async () => undefined),
    setDemand: jest.fn(),
    recheckCompatibility: jest.fn(async () => undefined),
  };
  const services: AppServices = {
    session,
    discovery: new ConnectorDiscovery({
      browser: createFakeServiceBrowser(),
      logger: silentLogger,
    }),
    settingsStorage: storage ?? createMemorySettingsStorage(),
    healthMonitor: { start: jest.fn(), stop: jest.fn(), refresh: jest.fn() },
  };
  return { services, session, store };
}

function tree(services: AppServices, panels?: readonly RegisteredPanel[]) {
  return (
    <ServicesProvider services={services}>
      <ThemeProvider storage={services.settingsStorage} systemSchemeOverride="light">
        <AppShell panels={panels} />
      </ThemeProvider>
    </ServicesProvider>
  );
}

async function seeded(last: string, hidden: string[] = []): Promise<SettingsStorage> {
  const storage = createMemorySettingsStorage();
  await storage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ hidden, last }));
  return storage;
}

beforeEach(() => {
  mockLayout = { deviceClass: 'phone', orientation: 'portrait' };
  (holdScreenAwake as jest.Mock).mockClear();
  (releaseScreenAwake as jest.Mock).mockClear();
});

const LAYOUTS: DeviceLayout[] = [
  { deviceClass: 'phone', orientation: 'portrait' },
  { deviceClass: 'phone', orientation: 'landscape' },
  { deviceClass: 'tablet', orientation: 'portrait' },
  { deviceClass: 'tablet', orientation: 'landscape' },
];

/**
 * Setup's form buttons (Connect, Pair, Retry, Share) are platform Buttons outside F-04's rule
 * (spec, Touch rules), so on Setup only the framework's own roles are checked.
 */
const PANEL_ROLES = ['button', 'switch', 'radio', 'tab'] as const;
const SETUP_ROLES = ['switch', 'radio', 'tab'] as const;

describe.each(LAYOUTS)('touch targets on a $deviceClass in $orientation', (layout) => {
  it.each([...PANEL_IDS, SETUP_ROUTE])('every control on %s is at least 48 dp', async (route) => {
    mockLayout = layout;
    const { services } = makeServices(liveSnapshot(), await seeded(route));
    await render(tree(services));
    await screen.findByTestId(route === SETUP_ROUTE ? 'setup-screen' : `panel-${route}`);
    const roles = route === SETUP_ROUTE ? SETUP_ROLES : PANEL_ROLES;
    const targets = roles.flatMap((role) => screen.queryAllByRole(role));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const style = StyleSheet.flatten(target.props.style) ?? {};
      const label = String(target.props.accessibilityLabel ?? target.props.testID ?? 'unlabelled');
      expect({ label, minHeight: Number(style.minHeight ?? style.height ?? 0) >= 48 }).toEqual({
        label,
        minHeight: true,
      });
      expect({ label, minWidth: Number(style.minWidth ?? style.width ?? 0) >= 48 }).toEqual({
        label,
        minWidth: true,
      });
    }
    expect(screen.getByTestId('link-status-bar')).toBeTruthy();
  });
});
