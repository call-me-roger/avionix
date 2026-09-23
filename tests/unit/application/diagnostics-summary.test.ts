import { formatDiagnosticsSummary } from '@/application/diagnostics-summary';
import { ALL_DATAREF_NAMES } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createConnectionConfig } from '@/domain/connection/connection-config';
import { AvionixError } from '@/domain/errors/avionix-error';

const SECRET_TOKEN = 'avx_7f3c9d2b1a8e4f60';
const PAIRING_CODE = '481920';

function snapshotWithSecrets(): SessionSnapshot {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  return {
    ...base,
    state: 'error',
    config: createConnectionConfig('192.168.1.10', '8086'),
    capabilities: {
      simulatorVersion: '12.4.0',
      supportedApiVersions: ['v2'],
      rawApiVersions: ['v2'],
    },
    apiVersion: 'v2',
    diagnostics: { ...base.diagnostics, connector: 'paired', http: 'ok', capabilities: 'failed' },
    error: new AvionixError({
      code: 'HTTP_ERROR',
      message: `GET http://192.168.1.10:8086/api/capabilities failed: HTTP 403 token=${SECRET_TOKEN} code=${PAIRING_CODE}`,
      httpStatus: 403,
      cause: new TypeError('Network request failed at XMLHttpRequest.send'),
    }),
    health: {
      ...base.health,
      lastHeartbeatAt: 9_000,
      lastEndReason: { code: 'HTTP_ERROR', step: 'capabilities' },
    },
  };
}

describe('formatDiagnosticsSummary', () => {
  it('never contains a token, a pairing code, a URL, an HTTP status or exception text', () => {
    const text = formatDiagnosticsSummary(snapshotWithSecrets(), 10_000);
    expect(text).not.toContain(SECRET_TOKEN);
    expect(text).not.toContain(PAIRING_CODE);
    expect(text).not.toContain('http://');
    expect(text).not.toContain('HTTP 403');
    expect(text).not.toContain('403');
    expect(text).not.toContain('XMLHttpRequest');
    expect(text).not.toContain('TypeError');
    expect(text).not.toContain('Network request failed');
  });

  it('carries what a support request actually needs', () => {
    const text = formatDiagnosticsSummary(snapshotWithSecrets(), 10_000);
    expect(text).toContain('Avionix diagnostics');
    expect(text).toContain('192.168.1.10:8086');
    expect(text).toContain('12.4.0');
    expect(text).toContain('HTTP_ERROR');
    expect(text).toContain('Capabilities: failed');
  });

  it('states the cause and the action for the failure', () => {
    const text = formatDiagnosticsSummary(snapshotWithSecrets(), 10_000);
    expect(text).toContain('X-Plane is reachable but refused to describe itself.');
    expect(text).toContain('12.1.4');
  });

  it('uses relative ages rather than absolute timestamps', () => {
    const text = formatDiagnosticsSummary(snapshotWithSecrets(), 10_000);
    expect(text).toContain('1 s ago');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('works on a snapshot that never connected', () => {
    const text = formatDiagnosticsSummary(initialSnapshot(ALL_DATAREF_NAMES, 5), 10_000);
    expect(text).toContain('Avionix diagnostics');
    expect(text).toContain('no data yet');
  });
});
