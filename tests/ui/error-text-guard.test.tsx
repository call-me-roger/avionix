import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { DiscoverySnapshot } from '@/application/connector-discovery';
import {
  type LastOperation,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { createConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError, type AvionixErrorCode } from '@/domain/errors/avionix-error';
import { DiscoveredConnectors } from '@/features/connection/DiscoveredConnectors';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { ControlPanel } from '@/features/mvp/ControlPanel';
import { ThemeProvider } from '@/theme/theme-context';

const mockShareText = jest.fn(async (_text: string, _title: string) => undefined);
// jest.mock is hoisted above every const, so the factory may only close over a `mock`-prefixed name.
jest.mock('@/platform/share', () => ({
  shareText: (text: string, title: string) => mockShareText(text, title),
}));

const RAW = 'GET http://192.168.1.10:8086/api/capabilities failed: HTTP 403 token=avx_secret';

const ALL_CODES: AvionixErrorCode[] = [
  'INVALID_HOST',
  'INVALID_PORT',
  'NETWORK_ERROR',
  'TIMEOUT',
  'HTTP_ERROR',
  'INCOMING_TRAFFIC_DISABLED',
  'PAIRING_REQUIRED',
  'PAIRING_FAILED',
  'PAIRING_RATE_LIMITED',
  'UNAUTHORIZED',
  'DISCOVERY_ERROR',
  'UNSUPPORTED_API',
  'INVALID_RESPONSE',
  'WEBSOCKET_ERROR',
  'DATAREF_NOT_FOUND',
  'COMMAND_NOT_FOUND',
  'DATAREF_READONLY',
  'SUBSCRIPTION_FAILED',
  'WRITE_FAILED',
  'COMMAND_FAILED',
  'SIMULATOR_ERROR',
  'SIMULATOR_NOT_READY',
  'CANCELLED',
  'INTERNAL',
  'UNKNOWN',
];

function snapshotFor(code: AvionixErrorCode): SessionSnapshot {
  const base = initialSnapshot(GENERIC_PROFILE, 5);
  return {
    ...base,
    state: 'error',
    config: createConnectionConfig('192.168.1.10', '8086'),
    error: new AvionixError({ code, message: RAW, httpStatus: 403 }),
    health: { ...base.health, lastEndReason: { code, step: 'capabilities' } },
  };
}

function discoverySnapshotFor(code: AvionixErrorCode): DiscoverySnapshot {
  return {
    availability: 'available',
    scanning: false,
    connectors: [],
    error: new AvionixError({ code, message: RAW, httpStatus: 403 }),
  };
}

/**
 * The raw text is planted in `message` too, on purpose: `ControlPanel` must ignore it and
 * render `failure` through `FailureNotice` instead, exactly as `simulator-session.ts` never
 * does for a real `WRITE_FAILED`/`COMMAND_FAILED`.
 */
function lastOperationFor(code: AvionixErrorCode): LastOperation {
  return {
    kind: 'write',
    ok: false,
    message: RAW,
    failure: { code, step: 'operation' },
    at: 10_000,
  };
}

describe.each(ALL_CODES)('%s never reaches the screen raw', (code) => {
  it('is rendered as a cause and an action, not as its message', async () => {
    await render(
      <ThemeProvider storage={createMemorySettingsStorage()}>
        <LinkStatusBar snapshot={snapshotFor(code)} now={10_000} onOpenDiagnostics={jest.fn()} />
        <DiagnosticsScreen
          snapshot={snapshotFor(code)}
          now={10_000}
          onRetry={jest.fn()}
          onDisconnect={jest.fn()}
        />
        <DiscoveredConnectors snapshot={discoverySnapshotFor(code)} enabled onSelect={jest.fn()} />
        <ControlPanel
          enabled
          lastOperation={lastOperationFor(code)}
          onWriteHeading={jest.fn()}
          onHeadingUp={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByText(new RegExp('http://'))).toBeNull();
    expect(screen.queryByText(/HTTP 403/)).toBeNull();
    expect(screen.queryByText(/avx_secret/)).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
  });
});
