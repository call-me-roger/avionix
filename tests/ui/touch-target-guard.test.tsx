import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';

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

import { toyScreenTelemetry } from '../helpers/cdu';
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
    activate: jest.fn(async () => 'ok' as const),
    holdCommand: jest.fn(async () => 'ok' as const),
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

/**
 * The FMA is pressable (a tap acknowledges an autopilot disconnect) but its role is "text", so the
 * role sweep alone never sees it. Wherever it is drawn, it is a target too.
 */
function panelTargets() {
  return [
    ...PANEL_ROLES.flatMap((role) => screen.queryAllByRole(role)),
    ...screen.queryAllByTestId('autopilot-fma'),
  ];
}

describe.each(LAYOUTS)('touch targets on a $deviceClass in $orientation', (layout) => {
  it.each([...PANEL_IDS, SETUP_ROUTE])('every control on %s is at least 48 dp', async (route) => {
    mockLayout = layout;
    const { services } = makeServices(liveSnapshot(), await seeded(route));
    await render(tree(services));
    await screen.findByTestId(route === SETUP_ROUTE ? 'setup-screen' : `panel-${route}`);
    const targets =
      route === SETUP_ROUTE
        ? SETUP_ROLES.flatMap((role) => screen.queryAllByRole(role))
        : panelTargets();
    expect(targets.length).toBeGreaterThan(0);
    if (route === 'autopilot') {
      expect(screen.getByTestId('autopilot-fma')).toBeTruthy();
    }
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

/**
 * The keypad only exists once an entry is open (M1): the sweep above never presses "Enter COM1
 * standby", so it never sees the keypad's own keys. This case opens one before sweeping.
 */
describe('touch targets on the Radios panel with an entry open', () => {
  it('every control, including the keypad, is at least 48 dp', async () => {
    mockLayout = { deviceClass: 'phone', orientation: 'portrait' };
    const { services } = makeServices(liveSnapshot(), await seeded('radios'));
    await render(tree(services));
    await screen.findByTestId('panel-radios');
    await fireEvent.press(screen.getByLabelText('Enter COM1 standby'));
    const targets = panelTargets();
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
  });
});

describe('touch targets on the Autopilot panel with an entry open', () => {
  it('every control, including the keypad and the steppers, is at least 48 dp', async () => {
    mockLayout = { deviceClass: 'phone', orientation: 'portrait' };
    const { services } = makeServices(liveSnapshot(), await seeded('autopilot'));
    await render(tree(services));
    await screen.findByTestId('panel-autopilot');
    await fireEvent.press(screen.getByLabelText('Enter vertical speed'));
    const targets = panelTargets();
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
  });
});

describe('touch targets on the Navigation panel with the course pad open', () => {
  it('every control, including the keypad and the steppers, is at least 48 dp', async () => {
    mockLayout = { deviceClass: 'phone', orientation: 'portrait' };
    const { services } = makeServices(liveSnapshot(), await seeded('navigation'));
    await render(tree(services));
    await screen.findByTestId('panel-navigation');
    await fireEvent.press(screen.getByLabelText('Enter course'));
    const targets = panelTargets();
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
  });
});

/**
 * The GMC-507 wide layout (720 dp and up) packs the controller's lateral, engage and vertical
 * groups into one row instead of three stacked ones; this covers it separately from the phone
 * sweep above, which never grows the window past the narrow default.
 */
describe('touch targets on the Autopilot panel in a wide layout', () => {
  it('every control, including the three GMC-507 key groups, is at least 48 dp', async () => {
    mockLayout = { deviceClass: 'tablet', orientation: 'landscape' };
    const original = Dimensions.get('window');
    Dimensions.set({ window: { width: 1024, height: 768, scale: 1, fontScale: 1 } });
    try {
      const { services } = makeServices(liveSnapshot(), await seeded('autopilot'));
      await render(tree(services));
      await screen.findByTestId('panel-autopilot');
      expect(screen.getByTestId('ap-controller-wide')).toBeTruthy();
      const targets = panelTargets();
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const style = StyleSheet.flatten(target.props.style) ?? {};
        const label = String(
          target.props.accessibilityLabel ?? target.props.testID ?? 'unlabelled',
        );
        expect({ label, minHeight: Number(style.minHeight ?? style.height ?? 0) >= 48 }).toEqual({
          label,
          minHeight: true,
        });
        expect({ label, minWidth: Number(style.minWidth ?? style.width ?? 0) >= 48 }).toEqual({
          label,
          minWidth: true,
        });
      }
    } finally {
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
  });
});

/**
 * The sweep above renders the CDU with no screen telemetry, so it only ever measures the waiting
 * state. This case gives it the toy FMS's screen on both units, so the live glass, both columns
 * of line-select keys and every function, alpha and numeric key are measured, at a window size
 * typical of each layout: a phone in portrait gets the narrow layout (keys scrolling under the
 * pinned unit), every other the wide one — asserted, not assumed.
 */
const CDU_WINDOWS: Record<string, { width: number; height: number; wide: boolean }> = {
  'phone portrait': { width: 390, height: 844, wide: false },
  'phone landscape': { width: 844, height: 390, wide: true },
  'tablet portrait': { width: 820, height: 1180, wide: true },
  'tablet landscape': { width: 1180, height: 820, wide: true },
};

describe.each(LAYOUTS)(
  'touch targets on the live CDU on a $deviceClass in $orientation',
  (layout) => {
    it('every key, the line-select keys included, is at least 48 dp', async () => {
      mockLayout = layout;
      const original = Dimensions.get('window');
      const size = CDU_WINDOWS[`${layout.deviceClass} ${layout.orientation}`];
      if (size === undefined) {
        throw new Error(`no CDU window for ${layout.deviceClass} ${layout.orientation}`);
      }
      Dimensions.set({
        window: { width: size.width, height: size.height, scale: 1, fontScale: 1 },
      });
      try {
        const snapshot = liveSnapshot();
        const { services } = makeServices(
          {
            ...snapshot,
            telemetry: { ...toyScreenTelemetry(1, NOW), ...toyScreenTelemetry(2, NOW) },
          },
          await seeded('cdu'),
        );
        await render(tree(services));
        await screen.findByTestId('panel-cdu');
        // Live, not waiting: the toy screen's title is on the glass and a key can be pressed.
        expect(screen.getByLabelText('TOY FMS')).toBeTruthy();
        expect(screen.getByLabelText('K').props.accessibilityState?.disabled).toBe(false);
        expect(screen.getByLabelText('Line select right 6')).toBeTruthy();
        if (size.wide) {
          expect(screen.getByTestId('cdu-wide-left')).toBeTruthy();
          expect(screen.getByTestId('cdu-wide-right')).toBeTruthy();
        } else {
          expect(screen.queryByTestId('cdu-wide-left')).toBeNull();
          expect(screen.getByTestId('cdu-keys-scroll')).toBeTruthy();
        }
        const targets = panelTargets();
        expect(targets.length).toBeGreaterThanOrEqual(70);
        for (const target of targets) {
          const style = StyleSheet.flatten(target.props.style) ?? {};
          const label = String(
            target.props.accessibilityLabel ?? target.props.testID ?? 'unlabelled',
          );
          expect({ label, minHeight: Number(style.minHeight ?? style.height ?? 0) >= 48 }).toEqual({
            label,
            minHeight: true,
          });
          expect({ label, minWidth: Number(style.minWidth ?? style.width ?? 0) >= 48 }).toEqual({
            label,
            minWidth: true,
          });
        }
      } finally {
        await act(async () => {
          Dimensions.set({ window: original });
        });
      }
    });
  },
);
