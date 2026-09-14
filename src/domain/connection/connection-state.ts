import { AvionixError } from '@/domain/errors/avionix-error';

export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export const CONNECTION_STATES: readonly ConnectionState[] = [
  'disconnected',
  'connecting',
  'connected',
  'reconnecting',
  'error',
];

export type ConnectionEvent =
  'connect' | 'connected' | 'failed' | 'disconnect' | 'socketLost' | 'retryExhausted';

const TABLE: Readonly<Record<ConnectionState, Partial<Record<ConnectionEvent, ConnectionState>>>> =
  {
    disconnected: { connect: 'connecting' },
    connecting: { connected: 'connected', failed: 'error', disconnect: 'disconnected' },
    connected: { socketLost: 'reconnecting', failed: 'error', disconnect: 'disconnected' },
    reconnecting: { connected: 'connected', retryExhausted: 'error', disconnect: 'disconnected' },
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
