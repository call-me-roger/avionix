import {
  ACTIVITY_LABEL,
  type ActivityInput,
  type SimulatorActivity,
  deriveActivity,
} from '@/domain/health/simulator-activity';
import { STALE_AFTER_MS, ageMs, formatAge, isLive } from '@/domain/health/freshness';

const base: ActivityInput = {
  linkState: 'connected',
  heartbeatAdvancing: true,
  paused: null,
  flightLoaded: true,
};

describe('deriveActivity', () => {
  const cases: Array<[string, Partial<ActivityInput>, SimulatorActivity]> = [
    ['not connected wins over everything', { linkState: 'reconnecting' }, 'unknown'],
    ['disconnected is unknown', { linkState: 'disconnected' }, 'unknown'],
    ['no flight wins over a live heartbeat', { flightLoaded: false }, 'noFlight'],
    ['advancing heartbeat is running', {}, 'running'],
    ['advancing wins over paused=1', { paused: 1 }, 'running'],
    [
      'frozen heartbeat with paused=1 is paused',
      { heartbeatAdvancing: false, paused: 1 },
      'paused',
    ],
    [
      'frozen heartbeat with paused=0 is stalled',
      { heartbeatAdvancing: false, paused: 0 },
      'stalled',
    ],
    [
      'frozen heartbeat without the paused dataref is the honest combined state',
      { heartbeatAdvancing: false, paused: null },
      'pausedOrStalled',
    ],
  ];

  it.each(cases)('%s', (_name, patch, expected) => {
    expect(deriveActivity({ ...base, ...patch })).toBe(expected);
  });

  it('labels every activity with non-empty user-facing text', () => {
    for (const [activity, label] of Object.entries(ACTIVITY_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(activity);
    }
  });
});

describe('freshness', () => {
  it('reports no age before the first heartbeat', () => {
    expect(ageMs(null, 1000)).toBeNull();
    expect(isLive(null)).toBe(false);
    expect(formatAge(null)).toBe('no data yet');
  });

  it('never reports a negative age when the clock moves backwards', () => {
    expect(ageMs(2000, 1000)).toBe(0);
  });

  it('is live up to and including the threshold, stale after it', () => {
    expect(isLive(STALE_AFTER_MS - 1)).toBe(true);
    expect(isLive(STALE_AFTER_MS)).toBe(true);
    expect(isLive(STALE_AFTER_MS + 1)).toBe(false);
  });

  it('formats an age in the largest sensible unit', () => {
    expect(formatAge(400)).toBe('400 ms ago');
    expect(formatAge(4000)).toBe('4 s ago');
    expect(formatAge(120_000)).toBe('2 min ago');
  });
});
