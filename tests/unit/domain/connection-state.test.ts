import {
  CONNECTION_STATES,
  type ConnectionEvent,
  type ConnectionState,
  transition,
} from '@/domain/connection/connection-state';
import { isAvionixError } from '@/domain/errors/avionix-error';

const legal: Array<[ConnectionState, ConnectionEvent, ConnectionState]> = [
  ['disconnected', 'connect', 'connecting'],
  ['connecting', 'connected', 'connected'],
  ['connecting', 'failed', 'error'],
  ['connecting', 'disconnect', 'disconnected'],
  ['connected', 'socketLost', 'reconnecting'],
  ['connected', 'failed', 'error'],
  ['connected', 'disconnect', 'disconnected'],
  ['reconnecting', 'connected', 'connected'],
  ['reconnecting', 'retryExhausted', 'error'],
  ['reconnecting', 'disconnect', 'disconnected'],
  ['error', 'connect', 'connecting'],
  ['error', 'disconnect', 'disconnected'],
];

const events: ConnectionEvent[] = [
  'connect',
  'connected',
  'failed',
  'disconnect',
  'socketLost',
  'retryExhausted',
];

describe('transition', () => {
  it.each(legal)('%s --%s--> %s', (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it('rejects every transition not in the table with INTERNAL', () => {
    for (const state of CONNECTION_STATES) {
      for (const event of events) {
        const isLegal = legal.some(([from, ev]) => from === state && ev === event);
        if (isLegal) {
          continue;
        }
        try {
          transition(state, event);
          throw new Error(`expected ${state} + ${event} to throw`);
        } catch (error) {
          expect(isAvionixError(error) && error.code).toBe('INTERNAL');
        }
      }
    }
  });
});
