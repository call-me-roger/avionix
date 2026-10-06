import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { ConnectorDiscovery } from '@/application/connector-discovery';
import { initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { LINK_LABEL } from '@/features/health/LinkStatusBar';
import { AppShell } from '@/features/shell/AppShell';
import { silentLogger } from '@/infrastructure/logging/logger';
import { ThemeProvider } from '@/theme/theme-context';

import { createFakeServiceBrowser } from '../support/fake-service-browser';

declare global {
  // React reads this flag to enable act() in non-RTL environments.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// AppShell reads the safe-area insets; this mock supplies zero insets without a provider.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/platform/keep-awake', () => ({
  KEEP_AWAKE_TAG: 'avionix-panel',
  holdScreenAwake: jest.fn(async () => undefined),
  releaseScreenAwake: jest.fn(async () => undefined),
}));

function services(): AppServices {
  return {
    settingsStorage: createMemorySettingsStorage(),
    discovery: new ConnectorDiscovery({
      browser: createFakeServiceBrowser('unsupported'),
      logger: silentLogger,
    }),
    session: {
      store: new Store(initialSnapshot(GENERIC_PROFILE, 5)),
      connect: async () => undefined,
      disconnect: () => undefined,
      pair: async () => undefined,
      write: async () => undefined,
      activate: async () => undefined,
      recheckCompatibility: async () => undefined,
      setDemand: () => undefined,
    },
    healthMonitor: { start: () => undefined, stop: () => undefined, refresh: () => undefined },
  };
}

describe('AppShell on react-native-web', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders the screen and the theme toggle as DOM', async () => {
    const s = services();
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <AppShell />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    // let the async settings/theme loads settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Avionix');
    expect(text).toContain(LINK_LABEL.disconnected);
    expect(container.querySelector('[aria-label="Theme Dark"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="setup-screen"]')).not.toBeNull();
  });

  it('renders the pairing mode as DOM', async () => {
    const s = services();
    s.session.store.setState((prev) => ({
      ...prev,
      state: 'pairing',
      connector: {
        name: 'Sim PC',
        version: '0.1.0',
        pairingRequired: true,
        xplane: { host: '127.0.0.1', port: 8086, reachable: true },
      },
    }));
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <AppShell />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const text = container.textContent ?? '';
    expect(text).toContain(LINK_LABEL.pairing);
    expect(text).toContain('Sim PC needs pairing.');
    expect(container.querySelector('[data-testid="pairing-code"]')).not.toBeNull();
  });

  it('does not render the discovery section on the web', async () => {
    const s = services();
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <AppShell />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent ?? '').not.toContain('Connectors on this network');
  });

  it('switches to a panel as DOM', async () => {
    const s = services();
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <AppShell />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const tab = container.querySelector('[data-testid="switch-autopilot"]');
    expect(tab).not.toBeNull();
    await act(async () => {
      (tab as HTMLElement).click();
    });
    expect(container.querySelector('[data-testid="panel-autopilot"]')).not.toBeNull();
    expect(container.textContent ?? '').toContain('No modes engaged');
  });

  it('draws the instruments as DOM, Instruments first in the switcher', async () => {
    const s = services();
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <AppShell />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const tabs = [...container.querySelectorAll('[data-testid^="switch-"]')];
    expect(tabs[0]?.getAttribute('data-testid')).toBe('switch-instruments');
    await act(async () => {
      (tabs[0] as HTMLElement).click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // react-native-svg on the web: the PFD must render as real SVG, not fail or render nothing.
    const pfd = container.querySelector('[data-testid="pfd"]');
    expect(pfd).not.toBeNull();
    expect(pfd?.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[aria-label^="Attitude"]')).not.toBeNull();
  });
});
