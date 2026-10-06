import {
  formatSelector,
  selectorMatches,
  selectorNotTaken,
  stepLabel,
  stepSelector,
  stepSpoken,
} from '@/domain/autopilot/selectors';

describe('formatSelector', () => {
  it('shows headings as three digits, with 360 for north', () => {
    expect(formatSelector('heading', 270)).toBe('270°');
    expect(formatSelector('heading', 5)).toBe('005°');
    expect(formatSelector('heading', 0)).toBe('360°');
    expect(formatSelector('heading', 359.6)).toBe('360°');
    expect(formatSelector('heading', -10)).toBe('350°');
  });
  it('groups thousands for altitude and vertical speed, with a sign on climbs and descents', () => {
    expect(formatSelector('altitude', 5000)).toBe('5,000 ft');
    expect(formatSelector('altitude', 12500.4)).toBe('12,500 ft');
    expect(formatSelector('verticalSpeed', 1500)).toBe('+1,500 fpm');
    expect(formatSelector('verticalSpeed', -800)).toBe('−800 fpm');
    expect(formatSelector('verticalSpeed', 0.3)).toBe('0 fpm');
  });
  it('shows knots whole and Mach as hundredths without a leading zero', () => {
    expect(formatSelector('knots', 249.6)).toBe('250 kt');
    expect(formatSelector('mach', 0.78)).toBe('M .78');
    expect(formatSelector('mach', 0.8)).toBe('M .80');
  });
});

describe('stepSelector', () => {
  it('adds to the rounded heading and wraps', () => {
    expect(stepSelector('heading', 355, 10)).toBe(5);
    expect(stepSelector('heading', 3, -10)).toBe(353);
    expect(stepSelector('heading', 269.6, 1)).toBe(271);
  });
  it('moves altitude and vertical speed to the 100-ft grid in the direction of travel first', () => {
    expect(stepSelector('altitude', 4550, 100)).toBe(4600);
    expect(stepSelector('altitude', 4550, -100)).toBe(4500);
    expect(stepSelector('altitude', 4500, 1000)).toBe(5500);
    expect(stepSelector('verticalSpeed', -850, 100)).toBe(-800);
    expect(stepSelector('verticalSpeed', -850, -100)).toBe(-900);
  });
  it('steps airspeed from the rounded knot or hundredth of Mach', () => {
    expect(stepSelector('knots', 119.7, 10)).toBe(130);
    expect(stepSelector('mach', 0.785, 0.01)).toBe(0.8);
    expect(stepSelector('mach', 0.78, -0.05)).toBe(0.73);
  });
  it('refuses a step past a limit', () => {
    expect(stepSelector('altitude', 50000, 100)).toBeNull();
    expect(stepSelector('altitude', 49950, 1000)).toBeNull();
    expect(stepSelector('altitude', 49950, 100)).toBe(50000);
    expect(stepSelector('verticalSpeed', 9900, 100)).toBeNull();
    expect(stepSelector('knots', 40, -1)).toBeNull();
    expect(stepSelector('mach', 0.99, 0.01)).toBeNull();
  });
  it('steps back into range from outside, landing on the limit', () => {
    expect(stepSelector('knots', 0, 1)).toBe(40);
    expect(stepSelector('knots', 0, -1)).toBeNull();
    expect(stepSelector('altitude', 60000, -100)).toBe(50000);
    expect(stepSelector('altitude', 60000, 100)).toBeNull();
  });
});

describe('step labels', () => {
  it('labels steps with a sign, Mach as hundredths', () => {
    expect(stepLabel('altitude', -1000)).toBe('−1000');
    expect(stepLabel('heading', 1)).toBe('+1');
    expect(stepLabel('mach', -0.05)).toBe('−.05');
  });
  it('speaks steps in words', () => {
    expect(stepSpoken('Altitude', 'altitude', 100)).toBe('Altitude plus 100 feet');
    expect(stepSpoken('Heading', 'heading', -1)).toBe('Heading minus 1 degree');
    expect(stepSpoken('Heading', 'heading', 10)).toBe('Heading plus 10 degrees');
    expect(stepSpoken('Vertical speed', 'verticalSpeed', 500)).toBe(
      'Vertical speed plus 500 feet per minute',
    );
    expect(stepSpoken('Airspeed', 'knots', 1)).toBe('Airspeed plus 1 knot');
    expect(stepSpoken('Airspeed', 'mach', 0.01)).toBe('Airspeed plus .01 Mach');
  });
});

describe('selectorMatches', () => {
  it('treats headings 0 and 360 as the same, within half a degree', () => {
    expect(selectorMatches('heading', 0)(359.8)).toBe(true);
    expect(selectorMatches('heading', 0)(0.2)).toBe(true);
    expect(selectorMatches('heading', 0)(1)).toBe(false);
  });
  it('compares Mach to the hundredth', () => {
    expect(selectorMatches('mach', 0.78)(0.7801)).toBe(true);
    expect(selectorMatches('mach', 0.78)(0.79)).toBe(false);
  });
  it('compares the others to the unit, and rejects non-numbers', () => {
    expect(selectorMatches('altitude', 5000)(5000.3)).toBe(true);
    expect(selectorMatches('altitude', 5000)(5100)).toBe(false);
    expect(selectorMatches('altitude', 5000)(undefined)).toBe(false);
    expect(selectorMatches('altitude', 5000)([5000])).toBe(true);
  });
});

describe('selectorNotTaken', () => {
  it('names what was sent and what X-Plane shows', () => {
    expect(selectorNotTaken('altitude', 5100, 5000)).toBe(
      'X-Plane did not take altitude 5,100 ft. The selector still shows 5,000 ft.',
    );
    expect(selectorNotTaken('mach', 0.82, 0.78)).toBe(
      'X-Plane did not take Mach .82. The selector still shows M .78.',
    );
    expect(selectorNotTaken('heading', 90, null)).toBe('X-Plane did not take heading 090°.');
    expect(selectorNotTaken('verticalSpeed', -1500, 0)).toBe(
      'X-Plane did not take vertical speed −1,500 fpm. The selector still shows 0 fpm.',
    );
    expect(selectorNotTaken('knots', 250, 120)).toBe(
      'X-Plane did not take airspeed 250 kt. The selector still shows 120 kt.',
    );
  });
});
