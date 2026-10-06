import {
  AIRSPEED_SWEEP_DEG,
  PFD_VIEW,
  STANDARD_RATE_DEFLECTION_DEG,
  airspeedAngle,
  airspeedDialMax,
  altimeterHands,
  arcPath,
  attitudeTransform,
  clamp,
  headingCardRotation,
  headingText,
  headingTickLabel,
  headingTicks,
  normalizeDegrees,
  pfdWidth,
  pitchLadder,
  polar,
  roundAltitude,
  roundVerticalSpeed,
  scaleTicks,
  sixPackLayout,
  slipOffset,
  standardRateFraction,
  tapeTicks,
  turnDeflection,
  vsiAngle,
  vsiHundreds,
  vsiScaleOffset,
} from '@/domain/instruments/geometry';

describe('instrument geometry', () => {
  it('clamps and normalises', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-10)).toBe(350);
    expect(Object.is(normalizeDegrees(-360), 0)).toBe(true);
  });

  it('places points clockwise from twelve o’clock', () => {
    const top = polar(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const right = polar(100, 100, 50, 90);
    expect(right.x).toBeCloseTo(150);
    expect(right.y).toBeCloseTo(100);
  });

  it('draws arcs with the large-arc flag only past half a turn', () => {
    expect(arcPath(100, 100, 50, 0, 90)).toBe('M 100.00 50.00 A 50 50 0 0 1 150.00 100.00');
    expect(arcPath(100, 100, 50, 0, 270)).toContain(' 0 1 1 ');
  });

  it('lists scale ticks with majors on the major step', () => {
    const ticks = scaleTicks(0, 40, 10, 20);
    expect(ticks).toEqual([
      { value: 0, major: true },
      { value: 10, major: false },
      { value: 20, major: true },
      { value: 30, major: false },
      { value: 40, major: true },
    ]);
  });

  it('scales the airspeed dial from Vne, or 200 kt without it', () => {
    expect(airspeedDialMax(null)).toBe(200);
    expect(airspeedDialMax(163)).toBe(180);
    // 200 × 1.1 is 220 exactly, not the next step up.
    expect(airspeedDialMax(200)).toBe(220);
    expect(airspeedDialMax(340)).toBe(380);
  });

  it('pegs the airspeed needle at both stops', () => {
    expect(airspeedAngle(0, 200)).toBe(0);
    expect(airspeedAngle(100, 200)).toBe(AIRSPEED_SWEEP_DEG / 2);
    expect(airspeedAngle(250, 200)).toBe(AIRSPEED_SWEEP_DEG);
    expect(airspeedAngle(-5, 200)).toBe(0);
  });

  it('turns the altimeter hands once per 1,000 and 10,000 ft', () => {
    expect(altimeterHands(0)).toEqual({ hundredsDeg: 0, thousandsDeg: 0 });
    expect(altimeterHands(4500)).toEqual({ hundredsDeg: 180, thousandsDeg: 162 });
    expect(altimeterHands(-250).hundredsDeg).toBe(270);
    expect(roundAltitude(4524)).toBe(4520);
    expect(roundAltitude(-1206)).toBe(-1210);
  });

  it('points the VSI left at zero and pegs beyond 2,000 ft/min', () => {
    expect(vsiAngle(0)).toBe(-90);
    expect(vsiAngle(2000)).toBe(80);
    expect(vsiAngle(2500)).toBe(80);
    expect(vsiAngle(-2000)).toBe(-260);
    expect(vsiScaleOffset(1000, 110)).toBe(55);
    expect(vsiScaleOffset(-3000, 110)).toBe(-110);
    expect(vsiHundreds(1240)).toBe('+12');
    expect(vsiHundreds(-560)).toBe('-6');
    expect(vsiHundreds(40)).toBe('');
    expect(roundVerticalSpeed(2504)).toBe(2500);
  });

  it('rotates the heading card against the heading and names it in three digits', () => {
    expect(headingCardRotation(90)).toBe(-90);
    expect(headingCardRotation(-10)).toBe(-350);
    expect(headingText(5)).toBe('005');
    expect(headingText(359.6)).toBe('360');
    expect(headingText(0)).toBe('360');
    expect(headingText(270.2)).toBe('270');
  });

  it('moves the horizon down for pitch up and rotates it against the bank', () => {
    expect(attitudeTransform(10, 20, 4)).toEqual({ rotateDeg: -20, translateY: 40 });
    expect(attitudeTransform(120, 0, 1).translateY).toBe(90);
    expect(attitudeTransform(-120, 0, 1).translateY).toBe(-90);
  });

  it('lists ladder marks near the current pitch, never at the horizon', () => {
    const marks = pitchLadder(0, 20);
    expect(marks.map((mark) => mark.deg)).toEqual([-25, -20, -15, -10, -5, 5, 10, 15, 20, 25]);
    expect(marks.find((mark) => mark.deg === 10)?.major).toBe(true);
    expect(marks.find((mark) => mark.deg === 5)?.major).toBe(false);
    expect(pitchLadder(85, 20).every((mark) => mark.deg <= 90)).toBe(true);
  });

  it('deflects the turn symbol up to ±45° and expresses turn as standard rate', () => {
    expect(STANDARD_RATE_DEFLECTION_DEG).toBe(20);
    expect(turnDeflection(60)).toBe(45);
    expect(turnDeflection(-60)).toBe(-45);
    expect(standardRateFraction(20)).toBe(1);
    expect(standardRateFraction(-10)).toBe(-0.5);
  });

  it('offsets the ball up to the end of its tube', () => {
    expect(slipOffset(5, 30)).toBe(15);
    expect(slipOffset(20, 30)).toBe(30);
    expect(slipOffset(-20, 30)).toBe(-30);
  });

  it('lists tape ticks around the value, above a floor', () => {
    const ticks = tapeTicks(15, 20, 10, 20, 0);
    expect(ticks).toEqual([
      { value: 0, offset: -15, labelled: true },
      { value: 10, offset: -5, labelled: false },
      { value: 20, offset: 5, labelled: true },
      { value: 30, offset: 15, labelled: false },
    ]);
    expect(tapeTicks(-300, 200, 100, 200).map((tick) => tick.value)).toEqual([
      -500, -400, -300, -200, -100,
    ]);
  });

  it('wraps the heading tape across north', () => {
    const ticks = headingTicks(358, 10);
    expect(ticks.map((tick) => tick.value)).toEqual([350, 355, 0, 5]);
    expect(ticks.map((tick) => tick.offset)).toEqual([-8, -3, 2, 7]);
    expect(headingTickLabel(0)).toBe('N');
    expect(headingTickLabel(90)).toBe('E');
    expect(headingTickLabel(120)).toBe('12');
    expect(headingTickLabel(30)).toBe('3');
  });

  it('sizes the PFD to the width, or to 70% of the window height', () => {
    expect(PFD_VIEW).toEqual({ width: 360, height: 300 });
    expect(pfdWidth(340, 2000)).toBe(340);
    expect(pfdWidth(1000, 400)).toBeCloseTo(336);
    expect(pfdWidth(-10, 400)).toBe(0);
  });

  it('takes a height reserved above the PFD out of its 70% share', () => {
    // 400 × 0.7 = 280, less 48 for the FMA, is 232 tall: 278.4 wide at 360 × 300.
    expect(pfdWidth(1000, 400, 48)).toBeCloseTo(278.4);
    expect(pfdWidth(1000, 400, 48)).toBeLessThan(pfdWidth(1000, 400));
    expect(pfdWidth(340, 2000, 48)).toBe(340);
    expect(pfdWidth(1000, 50, 48)).toBe(0);
  });

  it('lays the six-pack out 2 × 3 in portrait and 3 × 2 in landscape', () => {
    expect(sixPackLayout(400, 2000, false, 8)).toEqual({ columns: 2, size: 196 });
    expect(sixPackLayout(2000, 400, true, 8)).toEqual({ columns: 3, size: 136 });
  });
});
