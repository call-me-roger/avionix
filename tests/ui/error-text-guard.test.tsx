import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { DiscoverySnapshot } from '@/application/connector-discovery';
import {
  type OperationOutcome,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { createConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError, type AvionixErrorCode } from '@/domain/errors/avionix-error';
import { AircraftSummary } from '@/features/aircraft/AircraftSummary';
import { CompatibilityScreen } from '@/features/aircraft/CompatibilityScreen';
import { DiscoveredConnectors } from '@/features/connection/DiscoveredConnectors';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { ControlPanel } from '@/features/mvp/ControlPanel';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { PANELS } from '@/features/panels/registry';
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

function failedOutcome(code: AvionixErrorCode): OperationOutcome {
  return { status: 'failed', failure: { code, step: 'operation' }, refusal: null, at: 10_000 };
}

/** Every binding name a panel's features declare, each with a failed outcome for `code`. */
function failedOperationsFor(code: AvionixErrorCode): SessionSnapshot['operations'] {
  const operations: Record<string, OperationOutcome> = {};
  for (const feature of GENERIC_PROFILE.features) {
    for (const binding of feature.bindings) {
      operations[binding.name] = failedOutcome(code);
    }
  }
  return operations;
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
          feature={null}
          operations={{
            [GENERIC_DATAREFS.headingBug]: failedOutcome(code),
            [GENERIC_COMMANDS.headingUp]: failedOutcome(code),
          }}
          onWriteHeading={jest.fn()}
          onHeadingUp={jest.fn()}
        />
        <AircraftSummary
          snapshot={snapshotFor(code)}
          now={10_000}
          onOpenCompatibility={jest.fn()}
        />
        <CompatibilityScreen snapshot={snapshotFor(code)} now={10_000} onRecheck={jest.fn()} />
        {PANELS.map(({ descriptor, Component }) => (
          <PanelFrame
            key={descriptor.id}
            title={descriptor.title}
            snapshot={{ ...snapshotFor(code), operations: failedOperationsFor(code) }}
            now={10_000}
            actions={{
              write: jest.fn(async () => undefined),
              activate: jest.fn(async () => undefined),
            }}
          >
            <Component />
          </PanelFrame>
        ))}
      </ThemeProvider>,
    );
    expect(screen.queryByText(new RegExp('http://'))).toBeNull();
    expect(screen.queryByText(/HTTP 403/)).toBeNull();
    expect(screen.queryByText(/avx_secret/)).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
  });
});
