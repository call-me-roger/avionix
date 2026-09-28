import { act, renderHook } from '@testing-library/react-native';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ConnectorDiscovery } from '@/application/connector-discovery';
import { initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { ConnectionState } from '@/domain/connection/connection-state';
import { useConnectorDiscovery } from '@/hooks/useConnectorDiscovery';
import { silentLogger } from '@/infrastructure/logging/logger';
import { createFakeServiceBrowser } from '../support/fake-service-browser';

function setup() {
  const browser = createFakeServiceBrowser();
  const services: AppServices = {
    settingsStorage: createMemorySettingsStorage(),
    discovery: new ConnectorDiscovery({ browser, logger: silentLogger }),
    session: {
      store: new Store(initialSnapshot(GENERIC_PROFILE)),
      connect: async () => undefined,
      disconnect: () => undefined,
      pair: async () => undefined,
      write: async () => undefined,
      activate: async () => undefined,
      recheckCompatibility: async () => undefined,
      setDemand: () => undefined,
    },
    healthMonitor: { start: jest.fn(), stop: jest.fn(), refresh: jest.fn() },
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  return { browser, wrapper };
}

describe('useConnectorDiscovery', () => {
  const originalCurrentState = AppState.currentState;

  afterEach(() => {
    Object.defineProperty(AppState, 'currentState', {
      value: originalCurrentState,
      configurable: true,
      writable: true,
    });
    jest.mocked(AppState.addEventListener).mockClear();
  });

  it('starts while disconnected, stops once connected and restarts after disconnect', async () => {
    const { browser, wrapper } = setup();
    const { result, rerender } = await renderHook(
      (state: ConnectionState) => useConnectorDiscovery(state),
      { wrapper, initialProps: 'disconnected' },
    );
    expect(browser.browseCalls).toHaveLength(1);
    expect(result.current.scanning).toBe(true);
    await act(async () => {
      browser.listener().resolved({
        name: 'Sim PC',
        host: 'sim-pc.local.',
        port: 8080,
        addresses: ['192.168.1.20'],
        txt: { pairing: '1' },
      });
    });
    expect(result.current.connectors).toHaveLength(1);
    await rerender('connecting');
    expect(browser.stopCalls).toBe(1);
    expect(result.current).toMatchObject({ scanning: false, connectors: [] });
    await rerender('connected');
    expect(browser.browseCalls).toHaveLength(1);
    await rerender('error');
    expect(browser.browseCalls).toHaveLength(2);
    await rerender('disconnected');
    expect(browser.browseCalls).toHaveLength(2);
  });

  it('stops when the app goes to the background and resumes in the foreground', async () => {
    const { browser, wrapper } = setup();
    await renderHook((state: ConnectionState) => useConnectorDiscovery(state), {
      wrapper,
      initialProps: 'disconnected',
    });
    expect(browser.browseCalls).toHaveLength(1);
    const subscribe = jest.mocked(AppState.addEventListener);
    const handlers = subscribe.mock.calls
      .filter(([type]) => type === 'change')
      .map(([, handler]) => handler);
    expect(handlers.length).toBeGreaterThan(0);
    const notify = (status: AppStateStatus) => {
      Object.defineProperty(AppState, 'currentState', {
        value: status,
        configurable: true,
        writable: true,
      });
      for (const handler of handlers) {
        handler(status);
      }
    };
    await act(async () => notify('background'));
    expect(browser.stopCalls).toBe(1);
    await act(async () => notify('active'));
    expect(browser.browseCalls).toHaveLength(2);
  });

  it('stops on unmount', async () => {
    const { browser, wrapper } = setup();
    const { unmount } = await renderHook((state: ConnectionState) => useConnectorDiscovery(state), {
      wrapper,
      initialProps: 'disconnected',
    });
    // v14's `unmount` wraps the teardown in `act` and returns a promise; awaiting it lets the
    // effect cleanup (and the `discovery.stop()` it calls) run before the assertion below.
    await unmount();
    expect(browser.stopCalls).toBe(1);
  });
});
