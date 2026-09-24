import type { AvionixErrorCode } from '@/domain/errors/avionix-error';
import {
  CONNECT_STEPS,
  type ConnectStep,
  explainFailure,
} from '@/domain/health/failure-explanation';

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

describe('explainFailure', () => {
  it.each(ALL_CODES)('%s has a cause and an action at every step', (code) => {
    const steps: Array<ConnectStep | null> = [null, ...CONNECT_STEPS];
    for (const step of steps) {
      const explanation = explainFailure(code, step);
      expect(explanation.cause.length).toBeGreaterThan(0);
      expect(explanation.action.length).toBeGreaterThan(0);
    }
  });

  it('never leaks protocol vocabulary into user-facing copy', () => {
    const banned = /HTTP \d|http:\/\/|ws:\/\/|websocket|dataref|json|stack|exception/i;
    for (const code of ALL_CODES) {
      for (const step of [null, ...CONNECT_STEPS] as Array<ConnectStep | null>) {
        const { cause, action } = explainFailure(code, step);
        expect(`${cause} ${action}`).not.toMatch(banned);
      }
    }
  });

  it('names the simulator setting that must be enabled', () => {
    expect(explainFailure('INCOMING_TRAFFIC_DISABLED', 'capabilities').action).toContain(
      'Accept incoming connections',
    );
  });

  it('names the minimum simulator version', () => {
    expect(explainFailure('UNSUPPORTED_API', 'capabilities').action).toContain('12.1.4');
  });

  it('blames the network, and mentions VPNs, when the connector probe cannot reach the PC', () => {
    const { cause, action } = explainFailure('NETWORK_ERROR', 'connector');
    expect(cause).toContain('could not reach');
    expect(action).toContain('VPN');
  });

  it('tells the pilot to start a flight rather than chasing a missing value', () => {
    expect(explainFailure('SIMULATOR_NOT_READY', 'resolution').cause).toContain('no flight');
  });

  it('prefers a step-specific explanation over the generic one', () => {
    expect(explainFailure('NETWORK_ERROR', 'connector')).not.toEqual(
      explainFailure('NETWORK_ERROR', null),
    );
  });
});
