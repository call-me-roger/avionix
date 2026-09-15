import { AvionixError } from '@/domain/errors/avionix-error';

export type ConnectionState =
  'disconnected' | 'connecting' | 'pairing' | 'connected' | 'reconnecting' | 'error';

export const CONNECTION_STATES: readonly ConnectionState[] = [
  'disconnected',
  'connecting',
  'pairing',
  'connected',
  'reconnecting',
  'error',
];

export type ConnectionEvent =
  | 'connect'
  | 'connected'
  | 'failed'
  | 'disconnect'
  | 'socketLost'
  | 'retryExhausted'
  | 'pairingRequired'
  | 'pair';

const TABLE: Readonly<Record<ConnectionState, Partial<Record<ConnectionEvent, ConnectionState>>>> =
  {
    disconnected: { connect: 'connecting' },
    connecting: {
      connected: 'connected',
      failed: 'error',
      disconnect: 'disconnected',
      pairingRequired: 'pairing',
    },
    pairing: { pair: 'connecting', disconnect: 'disconnected' },
    connected: {
      socketLost: 'reconnecting',
      failed: 'error',
      disconnect: 'disconnected',
      // The datarefs, commands and writes that follow a successful connect still run over
      // authenticated HTTP, so a connector can reject this device after `connected`.
      pairingRequired: 'pairing',
    },
    reconnecting: {
      connected: 'connected',
      retryExhausted: 'error',
      disconnect: 'disconnected',
      pairingRequired: 'pairing',
    },
    error: { connect: 'connecting', disconnect: 'disconnected' },
  };

export function transition(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  const next = TABLE[state][event];
  if (next === undefined) {
    throw new AvionixError({
      code: 'INTERNAL',
      message: `Illegal connection transition: ${state} + ${event}`,
    });
  }
  return next;
}
