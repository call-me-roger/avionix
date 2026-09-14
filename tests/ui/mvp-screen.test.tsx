import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { MVP_DATAREFS, MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { AvionixError } from '@/domain/errors/avionix-error';
import { MvpScreen } from '@/features/mvp/MvpScreen';
import { ThemeProvider } from '@/theme/theme-context';
import { saveThemePreference } from '@/theme/theme-preference';
import { darkTheme, lightTheme } from '@/theme/tokens';

function makeServices(snapshot: Partial<SessionSnapshot> = {}) {
  const store = new Store<SessionSnapshot>({ ...initialSnapshot(MVP_DATAREF_NAMES), ...snapshot });
  const session = {
    store,
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    writeHeading: jest.fn(async () => undefined),
    activateHeadingUp: jest.fn(async () => undefined),
  };
  const services: AppServices = { session, settingsStorage: createMemorySettingsStorage() };
  return { services, session, store };
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
    await waitFor(() => expect(screen.getByDisplayValue('8086')).toBeTruthy());
    expect(screen.getByText('Status: disconnected')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('X-Plane host'), '192.168.1.100');
    await fireEvent.press(screen.getByText('Connect'));
    await waitFor(() => expect(session.connect).toHaveBeenCalledWith('192.168.1.100', '8086'));
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
    await waitFor(() => expect(screen.getByText('Status: connected')).toBeTruthy());
    expect(screen.getByText('X-Plane version: 12.4.0')).toBeTruthy();
    expect(screen.getByText('API versions: v1, v2, v3 (using v3)')).toBeTruthy();
    expect(screen.getByText('WebSocket: YES')).toBeTruthy();
    expect(screen.getByText('Subscription: YES')).toBeTruthy();
    expect(screen.getByText('124.3')).toBeTruthy();
    expect(screen.getByText('270')).toBeTruthy();
    expect(screen.getByText('Disconnect')).toBeTruthy();
  });

  it('shows the error message and the failing step', async () => {
    const { services } = makeServices({
      state: 'error',
      error: new AvionixError({
        code: 'INCOMING_TRAFFIC_DISABLED',
        message: 'X-Plane refused the request (HTTP 403).',
      }),
      diagnostics: {
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
    await waitFor(() => expect(screen.getByText('Status: error')).toBeTruthy());
    expect(
      screen.getByText('INCOMING_TRAFFIC_DISABLED: X-Plane refused the request (HTTP 403).'),
    ).toBeTruthy();
    expect(screen.getByText('Capabilities: NO')).toBeTruthy();
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
});
