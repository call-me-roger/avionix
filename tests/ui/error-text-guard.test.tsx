import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { DiscoverySnapshot } from '@/application/connector-discovery';
import {
  type OperationOutcome,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { createConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError, type AvionixErrorCode } from '@/domain/errors/avionix-error';
import { AircraftSummary } from '@/features/aircraft/AircraftSummary';
import { CompatibilityScreen } from '@/features/aircraft/CompatibilityScreen';
import { DiscoveredConnectors } from '@/features/connection/DiscoveredConnectors';
import { DiagnosticsScreen } from '@/features/health/DiagnosticsScreen';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { FlightDataStrip } from '@/features/panels/flight-data/FlightDataStrip';
import { InstrumentPreferencesProvider } from '@/features/panels/instruments/InstrumentPreferencesProvider';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { PANELS } from '@/features/panels/registry';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

import { toyScreenTelemetry } from '../helpers/cdu';

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
    const storage = createMemorySettingsStorage();
    await render(
      <ThemeProvider storage={storage}>
        <UnitsProvider storage={storage}>
          <InstrumentPreferencesProvider storage={storage}>
            <LinkStatusBar
              snapshot={snapshotFor(code)}
              now={10_000}
              onOpenDiagnostics={jest.fn()}
            />
            <DiagnosticsScreen
              snapshot={snapshotFor(code)}
              now={10_000}
              onRetry={jest.fn()}
              onDisconnect={jest.fn()}
            />
            <DiscoveredConnectors
              snapshot={discoverySnapshotFor(code)}
              enabled
              onSelect={jest.fn()}
            />
            <AircraftSummary
              snapshot={snapshotFor(code)}
              now={10_000}
              onOpenCompatibility={jest.fn()}
            />
            <CompatibilityScreen snapshot={snapshotFor(code)} now={10_000} onRecheck={jest.fn()} />
            <FlightDataStrip
              snapshot={{ ...snapshotFor(code), operations: failedOperationsFor(code) }}
              now={10_000}
              onOpen={jest.fn()}
            />
            {PANELS.map(({ descriptor, Component }) => (
              <PanelFrame
                key={descriptor.id}
                title={descriptor.title}
                snapshot={{
                  ...snapshotFor(code),
                  operations: failedOperationsFor(code),
                  // The CDU's live glass and keys, not its waiting state: a screen on both units.
                  telemetry: { ...toyScreenTelemetry(1, 9_000), ...toyScreenTelemetry(2, 9_000) },
                }}
                now={10_000}
                actions={{
                  write: jest.fn(async () => undefined),
                  activate: jest.fn(async () => 'ok' as const),
                }}
              >
                <Component />
              </PanelFrame>
            ))}
          </InstrumentPreferencesProvider>
        </UnitsProvider>
      </ThemeProvider>,
    );
    // The CDU is covered live: its glass is drawn and its keys are there, not the waiting state.
    expect(screen.getByLabelText('TOY FMS')).toBeTruthy();
    expect(screen.queryByText('Waiting for the CDU screen…')).toBeNull();
    expect(screen.queryByText(new RegExp('http://'))).toBeNull();
    expect(screen.queryByText(/HTTP 403/)).toBeNull();
    expect(screen.queryByText(/avx_secret/)).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
  });
});
