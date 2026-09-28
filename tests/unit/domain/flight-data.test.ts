import { destinationView } from '@/domain/flight-data/destination';
import {
  MINUS,
  formatClock,
  formatDistance,
  formatFuel,
  formatHeading,
  formatSpeed,
  formatTemperature,
  formatTimeToGo,
  formatWind,
} from '@/domain/flight-data/format';
import { SIM_BADGE_LABEL, simulatorBadge } from '@/domain/flight-data/sim-state';

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('formatting', () => {
  it('rounds speeds to whole knots', () => {
    expect(formatSpeed(142.4)).toBe('142 kt');
    expect(formatSpeed(142.5)).toBe('143 kt');
    expect(formatSpeed(-0.2)).toBe('0 kt');
  });

  it('shows headings as three digits, 360 for north', () => {
    expect(formatHeading(87.2)).toBe('087°');
    expect(formatHeading(0)).toBe('360°');
    expect(formatHeading(359.6)).toBe('360°');
    expect(formatHeading(-5)).toBe('355°');
  });

  it('shows wind as direction and speed, calm below 1 kt', () => {
    expect(formatWind(270, 12.4)).toBe('270° / 12 kt');
    expect(formatWind(90, 0.9)).toBe('Calm');
  });

  it('shows temperatures with a true minus sign and no negative zero', () => {
    expect(MINUS).toBe('−');
    expect(formatTemperature(-12.3, 'C')).toBe('−12 °C');
    expect(formatTemperature(-0.4, 'C')).toBe('0 °C');
    expect(formatTemperature(10, 'F')).toBe('50 °F');
    expect(formatTemperature(-40, 'F')).toBe('−40 °F');
  });

  it('shows fuel in whole units with thousands grouping', () => {
    expect(formatFuel(1234.5, 'kg')).toBe('1,235 kg');
    expect(formatFuel(1000, 'lb')).toBe('2,205 lb');
    expect(formatFuel(0, 'kg')).toBe('0 kg');
  });

  it('shows simulator clocks as HH:MM:SS', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(50709.8)).toBe('14:05:09');
    expect(formatClock(86399)).toBe('23:59:59');
    expect(formatClock(86400)).toBe('00:00:00');
  });

  it('shows distance with one decimal below 10 and whole above', () => {
    expect(formatDistance(8.44, 'nm')).toBe('8.4 nm');
    expect(formatDistance(126.4, 'nm')).toBe('126 nm');
    expect(formatDistance(10, 'km')).toBe('19 km');
  });

  it('shows time to go as h:mm, capped', () => {
    expect(formatTimeToGo(65.2)).toBe('1:05');
    expect(formatTimeToGo(0)).toBe('0:00');
    expect(formatTimeToGo(99 * 60 + 59)).toBe('99:59');
    expect(formatTimeToGo(6000)).toBe('more than 99 h');
  });
});

describe('simulatorBadge', () => {
  it('says replay, even when the replay is paused', () => {
    expect(simulatorBadge('connected', 'paused', 1)).toBe('replay');
    expect(simulatorBadge('connected', 'running', 1)).toBe('replay');
  });

  it('says paused when paused and not in replay', () => {
    expect(simulatorBadge('connected', 'paused', 0)).toBe('paused');
    expect(simulatorBadge('connected', 'paused', undefined)).toBe('paused');
  });

  it('says nothing while running', () => {
    expect(simulatorBadge('connected', 'running', 0)).toBeNull();
  });

  it.each(['disconnected', 'reconnecting', 'error', 'connecting', 'pairing'] as const)(
    'says nothing when %s, even with a remembered replay flag',
    (state) => {
      expect(simulatorBadge(state, 'unknown', 1)).toBeNull();
    },
  );

  it('labels both badges', () => {
    expect(SIM_BADGE_LABEL).toEqual({ paused: 'PAUSED', replay: 'REPLAY' });
  });
});

describe('destinationView', () => {
  const resolved = { idStatus: 'ok' as const, distanceStatus: 'ok' as const };

  it('is unavailable when the GPS names did not resolve', () => {
    expect(
      destinationView({
        idStatus: 'missing',
        distanceStatus: 'ok',
        idValue: undefined,
        distanceValue: 3,
        timeValue: 2,
      }),
    ).toEqual({ kind: 'unavailable' });
    expect(
      destinationView({
        idStatus: 'ok',
        distanceStatus: 'missing',
        idValue: base64('KSEA'),
        distanceValue: undefined,
        timeValue: undefined,
      }),
    ).toEqual({ kind: 'unavailable' });
  });

  it('waits for the first values instead of claiming there is no destination', () => {
    expect(
      destinationView({
        ...resolved,
        idValue: undefined,
        distanceValue: undefined,
        timeValue: undefined,
      }),
    ).toEqual({ kind: 'waiting' });
  });

  it('says no destination is set when the identifier is empty, never a zero distance', () => {
    expect(
      destinationView({
        ...resolved,
        idValue: base64('\0\0\0\0'),
        distanceValue: 0,
        timeValue: 0,
      }),
    ).toEqual({ kind: 'notSet' });
  });

  it('shows a destination with its decoded identifier', () => {
    expect(
      destinationView({
        ...resolved,
        idValue: base64('KSEA\0\0\0\0'),
        distanceValue: 126.4,
        timeValue: 53.2,
      }),
    ).toEqual({ kind: 'shown', id: 'KSEA', distanceNm: 126.4, timeMin: 53.2 });
  });

  it('shows a destination without a time when the time DataRef is absent', () => {
    expect(
      destinationView({
        ...resolved,
        idValue: base64('KSEA'),
        distanceValue: 12,
        timeValue: undefined,
      }),
    ).toEqual({ kind: 'shown', id: 'KSEA', distanceNm: 12, timeMin: null });
  });
});
