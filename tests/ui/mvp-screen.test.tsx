import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { ConnectorDiscovery } from '@/application/connector-discovery';
import { ALL_DATAREF_NAMES, MVP_DATAREFS } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { AvionixError } from '@/domain/errors/avionix-error';
import { LINK_LABEL } from '@/features/health/LinkStatusBar';
import { MvpScreen } from '@/features/mvp/MvpScreen';
import { silentLogger } from '@/infrastructure/logging/logger';
import { ThemeProvider } from '@/theme/theme-context';
import { saveThemePreference } from '@/theme/theme-preference';
import { darkTheme, lightTheme } from '@/theme/tokens';

import { type FakeServiceBrowser, createFakeServiceBrowser } from '../support/fake-service-browser';

function makeServices(
  snapshot: Partial<SessionSnapshot> = {},
  browser: FakeServiceBrowser = createFakeServiceBrowser(),
) {
  const store = new Store<SessionSnapshot>({
    ...initialSnapshot(ALL_DATAREF_NAMES, 5),
    ...snapshot,
  });
  const session = {
    store,
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    pair: jest.fn(async (code: string) => {
      void code;
    }),
    writeHeading: jest.fn(async () => undefined),
    activateHeadingUp: jest.fn(async () => undefined),
  };
  const discovery = new ConnectorDiscovery({ browser, logger: silentLogger });
  const healthMonitor = { start: jest.fn(), stop: jest.fn(), refresh: jest.fn() };
  const services: AppServices = {
    session,
    discovery,
    settingsStorage: createMemorySettingsStorage(),
    healthMonitor,
  };
  return { services, session, store, browser, healthMonitor };
}

async function renderScreen(services: AppServices, systemScheme: 'light' | 'dark' = 'light') {
  return render(
    <ServicesProvider services={services}>
      <ThemeProvider storage={services.settingsStorage} systemSchemeOverride={systemScheme}>
        <MvpScreen />
      </ThemeProvider>
    </ServicesProvider>,
  );
}

describe('MvpScreen', () => {
  it('shows the disconnected state with the default port and connects with the entered host', async () => {
    const { services, session } = makeServices();
    await renderScreen(services);
    await waitFor(() => expect(screen.getByDisplayValue('8080')).toBeTruthy());
    expect(screen.getByText(LINK_LABEL.disconnected)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('X-Plane host'), '192.168.1.100');
    await fireEvent.press(screen.getByText('Connect'));
    await waitFor(() => expect(session.connect).toHaveBeenCalledWith('192.168.1.100', '8080'));
  });

  it('renders connected status, versions, diagnostics and telemetry from the snapshot', async () => {
    const { services } = makeServices({
      state: 'connected',
      apiVersion: 'v3',
      capabilities: {
        simulatorVersion: '12.4.0',
        supportedApiVersions: ['v1', 'v2', 'v3'],
        rawApiVersions: ['v1', 'v2', 'v3'],
      },
      config: { host: '192.168.1.100', port: 8086 },
      diagnostics: {
        connector: 'direct',
        http: 'ok',
        capabilities: 'ok',
        websocket: 'ok',
        command: 'ok',
        subscription: 'ok',
        dataRefs: {
          [MVP_DATAREFS.heartbeat]: 'ok',
          [MVP_DATAREFS.airspeed]: 'ok',
          [MVP_DATAREFS.heading]: 'ok',
        },
      },
      telemetry: {
        [MVP_DATAREFS.airspeed]: { value: 124.3, receivedAt: Date.now() },
        [MVP_DATAREFS.heading]: { value: 270, receivedAt: Date.now() },
      },
    });
    await renderScreen(services);
    await waitFor(() => expect(screen.getByText(LINK_LABEL.connected)).toBeTruthy());
    expect(screen.getByText('124.3')).toBeTruthy();
    expect(screen.getByText('270')).toBeTruthy();
    expect(screen.getByText('Disconnect')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('link-status-bar'));
    expect(screen.getByText('X-Plane: 12.4.0')).toBeTruthy();
    expect(screen.getByText('API: v1, v2, v3 (using v3)')).toBeTruthy();
    expect(screen.getByText('Live data channel: ok')).toBeTruthy();
    expect(screen.getByText('Subscription: ok')).toBeTruthy();
  });

  it('shows the plain-language cause and the failing step, never the raw message', async () => {
    const { services } = makeServices({
      state: 'error',
      error: new AvionixError({
        code: 'INCOMING_TRAFFIC_DISABLED',
        message: 'X-Plane refused the request (HTTP 403).',
      }),
      diagnostics: {
        connector: 'direct',
        http: 'ok',
        capabilities: 'failed',
        websocket: 'idle',
        command: 'idle',
        subscription: 'idle',
        dataRefs: {
          [MVP_DATAREFS.heartbeat]: 'idle',
          [MVP_DATAREFS.airspeed]: 'idle',
          [MVP_DATAREFS.heading]: 'idle',
        },
      },
    });
    await renderScreen(services);
    await waitFor(() => expect(screen.getByText(LINK_LABEL.error)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('link-status-bar'));
    expect(screen.getByText('X-Plane is not accepting network connections.')).toBeTruthy();
    expect(screen.getByText('Capabilities: failed')).toBeTruthy();
  });

  it('writes the heading and activates the command, showing the last operation', async () => {
    const { services, session, store } = makeServices({ state: 'connected' });
    await renderScreen(services);
    await fireEvent.changeText(screen.getByLabelText('Heading to write'), '95');
    await fireEvent.press(screen.getByText('Write heading'));
    await waitFor(() => expect(session.writeHeading).toHaveBeenCalledWith(95));
    await fireEvent.press(screen.getByText('Heading up'));
    await waitFor(() => expect(session.activateHeadingUp).toHaveBeenCalled());
    await act(async () => {
      store.setState((prev) => ({
        ...prev,
        lastOperation: {
          kind: 'command',
          ok: true,
          message: 'Activated sim/autopilot/heading_up',
          failure: null,
          at: 1,
        },
      }));
    });
    await waitFor(() =>
      expect(
        screen.getByText('Last operation: OK Activated sim/autopilot/heading_up'),
      ).toBeTruthy(),
    );
  });

  it('renders a failed operation as a cause and an action, never the raw protocol message', async () => {
    const { services, store } = makeServices({ state: 'connected' });
    await renderScreen(services);
    await act(async () => {
      store.setState((prev) => ({
        ...prev,
        lastOperation: {
          kind: 'write',
          ok: false,
          message:
            'Writing dataref 12 failed: X-Plane answered HTTP 403 for PATCH /api/v2/datarefs/12/value',
          failure: { code: 'HTTP_ERROR', step: 'operation' },
          at: 1,
        },
      }));
    });
    await waitFor(() => expect(screen.getByText('Last operation: FAILED')).toBeTruthy());
    expect(screen.getByText('X-Plane refused the request.')).toBeTruthy();
    expect(screen.queryByText(/HTTP 403/)).toBeNull();
    expect(screen.queryByText(/\/api\/v2\/datarefs/)).toBeNull();
    expect(screen.queryByText(/PATCH/)).toBeNull();
  });

  it('calls disconnect', async () => {
    const { services, session } = makeServices({ state: 'connected' });
    await renderScreen(services);
    await fireEvent.press(screen.getByText('Disconnect'));
    expect(session.disconnect).toHaveBeenCalled();
  });

  it('paints the light theme by default and the dark theme when the OS is dark', async () => {
    const { services } = makeServices();
    await saveThemePreference(services.settingsStorage, 'light');
    const light = await renderScreen(services, 'light');
    await waitFor(() => expect(screen.getByLabelText('Theme Light')).toBeChecked());
    expect(screen.getByTestId('mvp-screen')).toHaveStyle({
      backgroundColor: lightTheme.colors.background,
    });
    await light.unmount();
    await renderScreen(makeServices().services, 'dark');
    await waitFor(() =>
      expect(screen.getByTestId('mvp-screen')).toHaveStyle({
        backgroundColor: darkTheme.colors.background,
      }),
    );
  });

  it('applies a persisted dark preference and lets the toggle switch back', async () => {
    const { services } = makeServices();
    await saveThemePreference(services.settingsStorage, 'dark');
    await renderScreen(services, 'light');
    await waitFor(() =>
      expect(screen.getByTestId('mvp-screen')).toHaveStyle({
        backgroundColor: darkTheme.colors.background,
      }),
    );
    await fireEvent.press(screen.getByLabelText('Theme Light'));
    await waitFor(() =>
      expect(screen.getByTestId('mvp-screen')).toHaveStyle({
        backgroundColor: lightTheme.colors.background,
      }),
    );
  });

  describe('discovered connectors', () => {
    const simPc = {
      name: 'Sim PC',
      host: 'sim-pc.local.',
      port: 8080,
      addresses: ['fe80::1', '192.168.1.20'],
      txt: { v: '1', pairing: '1' },
    };

    it('lists resolved connectors and connects with the tapped one', async () => {
      const { services, session, browser } = makeServices();
      await renderScreen(services);
      await waitFor(() => expect(browser.browseCalls).toHaveLength(1));
      expect(screen.getByText('Connectors on this network')).toBeTruthy();
      expect(screen.getByText('Looking for connectors…')).toBeTruthy();
      await act(async () => {
        browser.listener().resolved(simPc);
        browser.listener().resolved({ ...simPc, name: 'Open PC', txt: { pairing: '0' } });
      });
      expect(screen.getByText('Sim PC')).toBeTruthy();
      expect(screen.getAllByText('192.168.1.20:8080')).toHaveLength(2);
      expect(screen.getByText('Needs pairing')).toBeTruthy();
      expect(screen.getByText('Open')).toBeTruthy();
      expect(screen.queryByText('Looking for connectors…')).toBeNull();
      await fireEvent.press(screen.getByLabelText(/^Connect to Sim PC,/));
      await waitFor(() => expect(session.connect).toHaveBeenCalledWith('192.168.1.20', '8080'));
      expect(screen.getByDisplayValue('192.168.1.20')).toBeTruthy();
      await waitFor(async () =>
        expect(await services.settingsStorage.getItem('avionix.connection')).toBe(
          JSON.stringify({ host: '192.168.1.20', port: 8080 }),
        ),
      );
    });

    it('hides the section while connected and shows it again after disconnect', async () => {
      const { services, store, browser } = makeServices({ state: 'connected' });
      await renderScreen(services);
      await waitFor(() => expect(screen.getByText(LINK_LABEL.connected)).toBeTruthy());
      expect(screen.queryByText('Connectors on this network')).toBeNull();
      expect(browser.browseCalls).toHaveLength(0);
      await act(async () => {
        store.setState((prev) => ({ ...prev, state: 'disconnected' }));
      });
      await waitFor(() => expect(browser.browseCalls).toHaveLength(1));
      expect(screen.getByText('Connectors on this network')).toBeTruthy();
    });

    it('explains that Expo Go needs the development build', async () => {
      const { services, browser } = makeServices({}, createFakeServiceBrowser('needsDevBuild'));
      await renderScreen(services);
      await waitFor(() =>
        expect(
          screen.getByText('Connector discovery needs the Avionix development build.'),
        ).toBeTruthy(),
      );
      expect(browser.browseCalls).toHaveLength(0);
    });

    it('shows a discovery error beneath the list', async () => {
      const browser = createFakeServiceBrowser('available', {
        failOnBrowse: new AvionixError({ code: 'DISCOVERY_ERROR', message: 'NSD failed' }),
      });
      const { services } = makeServices({}, browser);
      await renderScreen(services);
      await waitFor(() =>
        expect(
          screen.getByText(
            'Discovery failed: Avionix could not search the network for connectors.',
          ),
        ).toBeTruthy(),
      );
      expect(
        screen.getByText(
          'Enter the address from the connector window by hand, or allow local network access for Avionix.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText('Discovery failed: NSD failed')).toBeNull();
      expect(screen.queryByText('NSD failed')).toBeNull();
      expect(screen.queryByText('Looking for connectors…')).toBeNull();
      expect(screen.queryByText('No connectors found yet.')).toBeNull();
    });
  });
});

describe('MvpScreen pairing mode', () => {
  const connector = {
    name: 'Sim PC',
    version: '0.1.0',
    pairingRequired: true,
    xplane: { host: '127.0.0.1', port: 8086, reachable: true },
  };

  it('names the connector and enables Pair only for six digits', async () => {
    const { services, session } = makeServices({ state: 'pairing', connector });
    await renderScreen(services);
    await waitFor(() =>
      expect(
        screen.getByText('Sim PC needs pairing. Enter the code shown in the connector window.'),
      ).toBeTruthy(),
    );
    const input = screen.getByTestId('pairing-code');
    await fireEvent.changeText(input, '12345');
    await fireEvent.press(screen.getByText('Pair'));
    expect(session.pair).not.toHaveBeenCalled();
    await fireEvent.changeText(input, '123456');
    await fireEvent.press(screen.getByText('Pair'));
    await waitFor(() => expect(session.pair).toHaveBeenCalledWith('123456'));
  });

  it('falls back to a generic name when the connector is unknown', async () => {
    const { services } = makeServices({ state: 'pairing', connector: null });
    await renderScreen(services);
    await waitFor(() =>
      expect(
        screen.getByText(
          'This connector needs pairing. Enter the code shown in the connector window.',
        ),
      ).toBeTruthy(),
    );
  });

  it('Cancel disconnects', async () => {
    const { services, session } = makeServices({ state: 'pairing', connector });
    await renderScreen(services);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(session.disconnect).toHaveBeenCalled();
  });

  it('clears the code after a failed attempt', async () => {
    const { services, session, store } = makeServices({ state: 'pairing', connector });
    session.pair.mockImplementation(async (code: string) => {
      void code;
      store.setState((prev) => ({
        ...prev,
        error: new AvionixError({ code: 'PAIRING_FAILED', message: 'Wrong pairing code' }),
      }));
    });
    await renderScreen(services);
    await fireEvent.changeText(screen.getByTestId('pairing-code'), '000000');
    await fireEvent.press(screen.getByText('Pair'));
    await fireEvent.press(screen.getByTestId('link-status-bar'));
    await waitFor(() => expect(screen.getByText('That code was not accepted.')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('pairing-code').props.value).toBe(''));
  });

  it('re-enables Pair after a Cancel while a pair call was still in flight', async () => {
    const { services, session, store } = makeServices({ state: 'pairing', connector });
    // A pair call that never settles: Cancel is the only way out of it.
    session.pair.mockImplementation(() => new Promise<void>(() => undefined));
    await renderScreen(services);
    await fireEvent.changeText(screen.getByTestId('pairing-code'), '123456');
    await fireEvent.press(screen.getByText('Pair'));
    await waitFor(() => expect(session.pair).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByText('Cancel'));
    await act(async () => {
      store.setState((prev) => ({ ...prev, state: 'disconnected' }));
    });
    await act(async () => {
      store.setState((prev) => ({ ...prev, state: 'pairing' }));
    });

    // The form is usable again: the stale code is gone and a fresh one can be submitted.
    expect(screen.getByTestId('pairing-code').props.value).toBe('');
    await fireEvent.changeText(screen.getByTestId('pairing-code'), '654321');
    await fireEvent.press(screen.getByText('Pair'));
    await waitFor(() => expect(session.pair).toHaveBeenCalledWith('654321'));
  });

  it('clears a code left over from an earlier pairing attempt', async () => {
    const { services, store } = makeServices({ state: 'pairing', connector });
    await renderScreen(services);
    await fireEvent.changeText(screen.getByTestId('pairing-code'), '123456');

    await act(async () => {
      store.setState((prev) => ({ ...prev, state: 'connecting' }));
    });
    await act(async () => {
      store.setState((prev) => ({ ...prev, state: 'pairing' }));
    });

    expect(screen.getByTestId('pairing-code').props.value).toBe('');
  });

  it.each([
    ['PAIRING_FAILED', 'That code was not accepted.'],
    ['PAIRING_RATE_LIMITED', 'Too many pairing attempts.'],
    ['UNAUTHORIZED', 'The connector no longer accepts this device.'],
    ['PAIRING_REQUIRED', 'This connector needs to be paired with this device first.'],
  ] as const)('renders plain text for %s', async (code, text) => {
    const { services } = makeServices({
      state: 'pairing',
      connector,
      error: new AvionixError({ code, message: 'raw protocol message' }),
    });
    await renderScreen(services);
    await fireEvent.press(screen.getByTestId('link-status-bar'));
    await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
    expect(screen.queryByText(`${code}: raw protocol message`)).toBeNull();
    expect(screen.queryByText(/raw protocol message/)).toBeNull();
  });

  it('shows the connector diagnostics row', async () => {
    const { services } = makeServices({
      state: 'connected',
      connector,
      diagnostics: {
        connector: 'paired',
        http: 'ok',
        capabilities: 'ok',
        websocket: 'ok',
        command: 'ok',
        subscription: 'ok',
        dataRefs: {
          [MVP_DATAREFS.heartbeat]: 'ok',
          [MVP_DATAREFS.airspeed]: 'ok',
          [MVP_DATAREFS.heading]: 'ok',
        },
      },
    });
    await renderScreen(services);
    await fireEvent.press(screen.getByTestId('link-status-bar'));
    await waitFor(() => expect(screen.getByText('Connector check: paired')).toBeTruthy());
  });
});
