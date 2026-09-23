import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ALL_DATAREF_NAMES, MVP_DATAREFS } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { createConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError } from '@/domain/errors/avionix-error';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import { ThemeProvider } from '@/theme/theme-context';

const mockShareText = jest.fn(async (_text: string, _title: string) => undefined);
// jest.mock is hoisted above every const, so the factory may only close over a `mock`-prefixed name.
jest.mock('@/platform/share', () => ({
  shareText: (text: string, title: string) => mockShareText(text, title),
}));

async function renderScreen(patch: Partial<SessionSnapshot> = {}) {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  const snapshot: SessionSnapshot = { ...base, ...patch };
  const onRetry = jest.fn();
  const onDisconnect = jest.fn();
  await render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <DiagnosticsScreen
        snapshot={snapshot}
        now={10_000}
        onRetry={onRetry}
        onDisconnect={onDisconnect}
      />
    </ThemeProvider>,
  );
  return { onRetry, onDisconnect };
}

const failedAtCapabilities = (): Partial<SessionSnapshot> => {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  return {
    state: 'error',
    config: createConnectionConfig('192.168.1.10', '8086'),
    diagnostics: { ...base.diagnostics, connector: 'paired', http: 'ok', capabilities: 'failed' },
    error: new AvionixError({
      code: 'INCOMING_TRAFFIC_DISABLED',
      message: 'GET http://192.168.1.10:8086/api/capabilities failed: HTTP 403',
      httpStatus: 403,
    }),
    health: {
      ...base.health,
      lastEndReason: { code: 'INCOMING_TRAFFIC_DISABLED', step: 'capabilities' },
    },
  };
};

describe('DiagnosticsScreen', () => {
  it('lists every connect step with its outcome', async () => {
    await renderScreen(failedAtCapabilities());
    expect(screen.getByText('Reachable: ok')).toBeTruthy();
    expect(screen.getByText('Capabilities: failed')).toBeTruthy();
    expect(screen.getByText('Live data channel: not reached')).toBeTruthy();
  });

  it('states the cause and the action, never the raw error', async () => {
    await renderScreen(failedAtCapabilities());
    expect(screen.getByText('X-Plane is not accepting network connections.')).toBeTruthy();
    expect(screen.queryByText(/HTTP 403/)).toBeNull();
    expect(screen.queryByText(/http:\/\//)).toBeNull();
  });

  it('names an unresolved value and the feature that needs it', async () => {
    const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
    await renderScreen({
      diagnostics: {
        ...base.diagnostics,
        dataRefs: { ...base.diagnostics.dataRefs, [MVP_DATAREFS.airspeed]: 'failed' },
      },
    });
    expect(screen.getByText(new RegExp(MVP_DATAREFS.airspeed))).toBeTruthy();
    expect(screen.getByText(/Live telemetry/)).toBeTruthy();
  });

  it('offers retry and disconnect', async () => {
    const { onRetry, onDisconnect } = await renderScreen(failedAtCapabilities());
    await fireEvent.press(screen.getByText('Retry'));
    await fireEvent.press(screen.getByText('Disconnect'));
    expect(onRetry).toHaveBeenCalled();
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('shares the redacted summary', async () => {
    await renderScreen(failedAtCapabilities());
    await fireEvent.press(screen.getByText('Share diagnostics'));
    expect(mockShareText).toHaveBeenCalled();
    const [text] = mockShareText.mock.calls[0] as unknown as [string];
    expect(text).toContain('Avionix diagnostics');
    expect(text).not.toContain('HTTP 403');
  });

  it('still reports the last known state while disconnected', async () => {
    const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
    await renderScreen({
      state: 'disconnected',
      diagnostics: { ...base.diagnostics, websocket: 'ok' },
      health: {
        ...base.health,
        lastConnectedAt: 4_000,
        lastEndedAt: 9_000,
        lastEndReason: { code: 'WEBSOCKET_ERROR', step: 'websocket' },
      },
    });
    expect(screen.getByText('Live data channel: ok')).toBeTruthy();
    expect(screen.getByText(/Last connected: 6 s ago/)).toBeTruthy();
    expect(screen.getByText('The live data connection dropped.')).toBeTruthy();
  });
});
