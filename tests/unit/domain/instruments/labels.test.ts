import {
  describeAirspeed,
  describeAltitude,
  describeAttitude,
  describeHeading,
  describeTurn,
  describeVerticalSpeed,
  groupThousands,
  instrumentStatus,
  machShown,
  radioAltitudeShown,
  withStatus,
} from '@/domain/instruments/labels';

describe('instrument labels', () => {
  it('orders the states: unavailable, no value, live, not live', () => {
    expect(instrumentStatus(true, true, true)).toBe('unavailable');
    expect(instrumentStatus(false, false, true)).toBe('noValue');
    expect(instrumentStatus(false, true, true)).toBe('live');
    expect(instrumentStatus(false, true, false)).toBe('notLive');
  });

  it('words each state, describing only when there is a value', () => {
    const describe = jest.fn(() => 'Airspeed 112 knots');
    expect(withStatus('Airspeed', 'unavailable', describe)).toBe(
      'Airspeed: not available on this aircraft',
    );
    expect(withStatus('Airspeed', 'noValue', describe)).toBe('Airspeed: no value');
    expect(describe).not.toHaveBeenCalled();
    expect(withStatus('Airspeed', 'live', describe)).toBe('Airspeed 112 knots');
    expect(withStatus('Airspeed', 'notLive', describe)).toBe('Airspeed 112 knots, not live');
  });

  it('groups thousands', () => {
    expect(groupThousands(4520)).toBe('4,520');
    expect(groupThousands(-12340)).toBe('-12,340');
    expect(groupThousands(999)).toBe('999');
  });

  it('shows Mach from 0.40 and radio altitude up to 2,500 ft', () => {
    expect(machShown(0.39)).toBe(false);
    expect(machShown(0.4)).toBe(true);
    expect(machShown(null)).toBe(false);
    expect(radioAltitudeShown(2500)).toBe(true);
    expect(radioAltitudeShown(2501)).toBe(false);
    expect(radioAltitudeShown(-1)).toBe(false);
    expect(radioAltitudeShown(null)).toBe(false);
  });

  it('describes airspeed, with Mach when shown', () => {
    expect(describeAirspeed(112.4, null)).toBe('Airspeed 112 knots');
    expect(describeAirspeed(280, 0.782)).toBe('Airspeed 280 knots, Mach 0.78');
    expect(describeAirspeed(120, 0.2)).toBe('Airspeed 120 knots');
  });

  it('describes attitude in words, level when it rounds to zero', () => {
    expect(describeAttitude(3.2, 15.4)).toBe('Attitude: pitch 3 degrees up, bank 15 degrees right');
    expect(describeAttitude(-1, -30)).toBe('Attitude: pitch 1 degree down, bank 30 degrees left');
    expect(describeAttitude(0.3, -0.2)).toBe('Attitude: pitch level, wings level');
  });

  it('describes altitude with the altimeter and radio altitude when given', () => {
    expect(describeAltitude(4524, null, null)).toBe('Altitude 4,520 feet');
    expect(describeAltitude(4524, '29.92 inches, standard', null)).toBe(
      'Altitude 4,520 feet, altimeter 29.92 inches, standard',
    );
    expect(describeAltitude(820, null, 812.6)).toBe('Altitude 820 feet, radio altitude 813 feet');
    expect(describeAltitude(8000, null, 7990)).toBe('Altitude 8,000 feet');
  });

  it('describes vertical speed', () => {
    expect(describeVerticalSpeed(503)).toBe('Vertical speed climbing 500 feet per minute');
    expect(describeVerticalSpeed(-1204)).toBe('Vertical speed descending 1,200 feet per minute');
    expect(describeVerticalSpeed(3)).toBe('Vertical speed level');
  });

  it('describes heading, north as 360', () => {
    expect(describeHeading(270.2)).toBe('Heading 270 degrees');
    expect(describeHeading(0)).toBe('Heading 360 degrees');
    expect(describeHeading(359.7)).toBe('Heading 360 degrees');
    expect(describeHeading(5)).toBe('Heading 5 degrees');
  });

  it('describes turn as a fraction of standard rate and the ball in degrees', () => {
    expect(describeTurn(24, 2.2)).toBe('Turn: rate 1.2 standard rate right, ball 2 degrees right');
    expect(describeTurn(-10, -1)).toBe('Turn: rate 0.5 standard rate left, ball 1 degree left');
    expect(describeTurn(0.4, 0.2)).toBe('Turn: no turn, ball centred');
    expect(describeTurn(null, 3)).toBe('Turn: ball 3 degrees right');
    expect(describeTurn(20, null)).toBe('Turn: rate 1.0 standard rate right');
  });
});
