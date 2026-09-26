import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { ConnectorDiscovery } from '@/application/connector-discovery';
import { PANEL_LAYOUT_STORAGE_KEY } from '@/application/panel-layout';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import type { DeviceLayout } from '@/domain/panels/device-layout';
import { EVERYWHERE } from '@/domain/panels/panel';
import { PANELS, type RegisteredPanel } from '@/features/panels/registry';
import { AppShell } from '@/features/shell/AppShell';
import { silentLogger } from '@/infrastructure/logging/logger';
import { holdScreenAwake, releaseScreenAwake } from '@/platform/keep-awake';
import { ThemeProvider } from '@/theme/theme-context';

import { createFakeServiceBrowser } from '../support/fake-service-browser';

let mockLayout: DeviceLayout = { deviceClass: 'phone', orientation: 'portrait' };
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

describe('AppShell', () => {
  it('opens on Setup the first time, with every panel one touch away', async () => {
    const { services } = makeServices();
    await render(tree(services));
    expect(await screen.findByTestId('setup-screen')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Basic data' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Heading' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Setup' })).toBeSelected();
  });

  it('switches to a panel and remembers it', async () => {
    const storage = createMemorySettingsStorage();
    const { services } = makeServices({}, storage);
    await render(tree(services));
    await fireEvent.press(await screen.findByRole('tab', { name: 'Heading' }));
    expect(screen.getByTestId('panel-heading')).toBeTruthy();
    expect(screen.queryByTestId('setup-screen')).toBeNull();
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? 'null')).toEqual({
        hidden: [],
        last: 'heading',
      }),
    );
  });

  it('restores the last panel on launch', async () => {
    const { services } = makeServices({}, await seeded('basic-data'));
    await render(tree(services));
    expect(await screen.findByTestId('panel-basic-data')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Basic data' })).toBeSelected();
  });

  it('asks the session for exactly what the visible panel reads', async () => {
    const { services, session } = makeServices();
    await render(tree(services));
    await waitFor(() => expect(session.setDemand).toHaveBeenLastCalledWith([]));
    await fireEvent.press(screen.getByRole('tab', { name: 'Basic data' }));
    expect(session.setDemand).toHaveBeenLastCalledWith([
      FEATURE_FLIGHT_TELEMETRY,
      FEATURE_HEADING_CONTROL,
    ]);
    await fireEvent.press(screen.getByRole('tab', { name: 'Heading' }));
    expect(session.setDemand).toHaveBeenLastCalledWith([FEATURE_HEADING_CONTROL]);
  });

  it('opens Setup with diagnostics from the status bar on a panel', async () => {
    const { services } = makeServices({}, await seeded('heading'));
    await render(tree(services));
    await screen.findByTestId('panel-heading');
    await fireEvent.press(screen.getByTestId('link-status-bar'));
    expect(screen.getByTestId('setup-screen')).toBeTruthy();
    expect(screen.getByText('Diagnostics')).toBeTruthy();
  });

  it('removes a hidden panel from the switcher, and keeps at least one', async () => {
    const { services } = makeServices();
    await render(tree(services));
    await fireEvent.press(
      await screen.findByRole('switch', { name: 'Show Basic data in the switcher' }),
    );
    expect(screen.queryByRole('tab', { name: 'Basic data' })).toBeNull();
    const lastOne = screen.getByRole('switch', { name: 'Show Heading in the switcher' });
    expect(lastOne).toBeDisabled();
    expect(screen.getByText('At least one panel stays in the switcher.')).toBeTruthy();
  });

  it('rotation keeps a half-typed entry', async () => {
    const { services } = makeServices(liveSnapshot(), await seeded('heading'));
    const { rerender } = await render(tree(services));
    await fireEvent.changeText(await screen.findByLabelText('New heading'), '12');
    mockLayout = { deviceClass: 'phone', orientation: 'landscape' };
    await rerender(tree(services));
    expect(screen.getByDisplayValue('12')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Heading' })).toBeSelected();
  });

  it('leaves out a panel the device class does not support, and says so in Setup', async () => {
    const tabletOnly: RegisteredPanel = {
      descriptor: {
        id: 'wide',
        title: 'Wide',
        features: [],
        supports: { phone: [], tablet: ['landscape'] },
      },
      Component: () => null,
    };
    const panels = [...PANELS, tabletOnly];
    const { services } = makeServices();
    await render(tree(services, panels));
    await screen.findByTestId('setup-screen');
    expect(screen.queryByRole('tab', { name: 'Wide' })).toBeNull();
    expect(screen.getByText('Tablet only')).toBeTruthy();
  });

  it('asks for a rotation instead of showing a panel in an orientation it does not declare', async () => {
    const landscapeOnly: RegisteredPanel = {
      descriptor: {
        id: 'wide',
        title: 'Wide',
        features: [FEATURE_HEADING_CONTROL],
        supports: { phone: ['landscape'], tablet: EVERYWHERE.tablet },
      },
      Component: () => null,
    };
    const { services, session } = makeServices({}, await seeded('wide'));
    await render(tree(services, [...PANELS, landscapeOnly]));
    expect(
      await screen.findByText('Rotate the device to landscape to use this panel.'),
    ).toBeTruthy();
    expect(session.setDemand).toHaveBeenLastCalledWith([]);
  });

  it('holds the screen awake on a panel while connected, and lets go on Setup', async () => {
    const { services } = makeServices(liveSnapshot(), await seeded('heading'));
    await render(tree(services));
    await screen.findByTestId('panel-heading');
    expect(holdScreenAwake).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('tab', { name: 'Setup' }));
    expect(releaseScreenAwake).toHaveBeenCalled();
  });

  it('lets go of the screen when the link ends', async () => {
    const { services, store } = makeServices(liveSnapshot(), await seeded('heading'));
    await render(tree(services));
    await screen.findByTestId('panel-heading');
    await act(async () => {
      store.setState((prev) => ({ ...prev, state: 'disconnected' }));
    });
    expect(releaseScreenAwake).toHaveBeenCalled();
  });

  it('gives every switcher item and the status bar a full-size touch target', async () => {
    const { services } = makeServices();
    await render(tree(services));
    await screen.findByTestId('setup-screen');
    const targets = [...screen.getAllByRole('tab'), screen.getByTestId('link-status-bar')];
    for (const target of targets) {
      const style = StyleSheet.flatten(target.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });
});
