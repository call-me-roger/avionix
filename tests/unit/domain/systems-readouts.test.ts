import {
  brightnessPercent,
  engineColumns,
  flapReadout,
  flapsMoved,
  gearLamps,
  gearSummary,
  numberAt,
  switchOn,
  trimAtLimit,
  trimReadout,
} from '@/domain/systems/readouts';

describe('numberAt and switchOn', () => {
  it('reads a scalar at index 0 and an array at any index', () => {
    expect(numberAt(1, 0)).toBe(1);
    expect(numberAt(1, 1)).toBeNull();
    expect(numberAt([0, 1, 0], 1)).toBe(1);
    expect(numberAt([0], 3)).toBeNull();
    expect(numberAt('text', 0)).toBeNull();
    expect(numberAt(undefined, 0)).toBeNull();
    expect(numberAt(Number.NaN, 0)).toBeNull();
  });

  it('reads a switch as on above one half, unknown when there is no number', () => {
    expect(switchOn(1, 0)).toBe(true);
    expect(switchOn(0, 0)).toBe(false);
    expect(switchOn(0.75, 0)).toBe(true);
    expect(switchOn([0, 1], 1)).toBe(true);
    expect(switchOn(undefined, 0)).toBeNull();
  });
});

describe('gear lamps', () => {
  it('reads entries 0 to 2: down at 0.99 and above, up at 0.01 and below, transit between', () => {
    expect(gearLamps([1, 1, 1, 0, 0, 0, 0, 0, 0, 0])).toEqual(['down', 'down', 'down']);
    expect(gearLamps([0, 0.5, 0.995, 0, 0, 0, 0, 0, 0, 0])).toEqual(['up', 'transit', 'down']);
    expect(gearLamps([0.005, 0, 0])).toEqual(['up', 'up', 'up']);
  });

  it('gives no lamps without three numbers', () => {
    expect(gearLamps(undefined)).toBeNull();
    expect(gearLamps([1, 1])).toBeNull();
    expect(gearLamps(1)).toBeNull();
  });

  it('speaks three green, up, in transit with the green count, or the handle alone', () => {
    expect(gearSummary(['down', 'down', 'down'], true)).toBe('Gear down, three green');
    expect(gearSummary(['up', 'up', 'up'], false)).toBe('Gear up');
    expect(gearSummary(['down', 'transit', 'down'], true)).toBe('Gear in transit, two green');
    expect(gearSummary(['down', 'transit', 'transit'], true)).toBe('Gear in transit, one green');
    expect(gearSummary(['transit', 'transit', 'up'], false)).toBe('Gear in transit');
    expect(gearSummary(null, true)).toBe('Gear handle down');
    expect(gearSummary(null, false)).toBe('Gear handle up');
    expect(gearSummary(null, null)).toBe('Gear position unknown');
  });
});

describe('flap readout', () => {
  it('names the detent from the handle when the detent count is known', () => {
    expect(flapReadout(0, 0, 3)).toEqual({
      label: 'UP',
      spoken: 'Flaps up',
      moving: false,
      atUp: true,
      atFull: false,
    });
    expect(flapReadout(2 / 3, 2 / 3, 3)?.label).toBe('2 of 3');
    expect(flapReadout(2 / 3, 2 / 3, 3)?.spoken).toBe('Flaps 2 of 3');
    expect(flapReadout(1, 1, 3)).toEqual({
      label: 'FULL',
      spoken: 'Flaps full',
      moving: false,
      atUp: false,
      atFull: true,
    });
  });

  it('falls back to a percentage without a usable detent count', () => {
    expect(flapReadout(0.4, 0.4, null)?.label).toBe('40 %');
    expect(flapReadout(0.4, 0.4, 0)?.spoken).toBe('Flaps 40 percent');
    expect(flapReadout(0.4, 0.4, 2.5)?.label).toBe('40 %');
    expect(flapReadout(0, 0, null)?.label).toBe('UP');
  });

  it('says MOVING while the flaps lag the handle by more than 0.02', () => {
    const moving = flapReadout(2 / 3, 0.3, 3);
    expect(moving?.moving).toBe(true);
    expect(moving?.spoken).toBe('Flaps 2 of 3, moving');
    expect(flapReadout(2 / 3, 0.66, 3)?.moving).toBe(false);
    expect(flapReadout(2 / 3, null, 3)?.moving).toBe(false);
  });

  it('has no readout without a handle', () => {
    expect(flapReadout(null, 0.5, 3)).toBeNull();
  });

  it('counts a handle change in the pressed direction only', () => {
    expect(flapsMoved('down', 1 / 3, 2 / 3)).toBe(true);
    expect(flapsMoved('down', 1 / 3, 1 / 3)).toBe(false);
    expect(flapsMoved('up', 1 / 3, 0)).toBe(true);
    expect(flapsMoved('up', 1 / 3, 2 / 3)).toBe(false);
    expect(flapsMoved('up', 1 / 3, null)).toBe(false);
  });
});

describe('trim readout', () => {
  it('reads percent of the range with the direction in pilot words', () => {
    expect(trimReadout('pitch', 'pitch trim', 0.12)).toEqual({
      percent: 12,
      text: '12 % nose up',
      spoken: 'Pitch trim, 12 percent nose up',
    });
    expect(trimReadout('pitch', 'pitch trim', -0.5)?.text).toBe('50 % nose down');
    expect(trimReadout('roll', 'roll trim', -0.034)?.text).toBe('3 % left');
    expect(trimReadout('yaw', 'rudder trim', 0.2)?.spoken).toBe('Rudder trim, 20 percent right');
  });

  it('calls anything under 1 % centred', () => {
    expect(trimReadout('roll', 'roll trim', 0.004)).toEqual({
      percent: 0,
      text: 'centred',
      spoken: 'Roll trim centred',
    });
  });

  it('has no readout without a value', () => {
    expect(trimReadout('pitch', 'pitch trim', null)).toBeNull();
  });

  it('knows the end a hold drives toward', () => {
    expect(trimAtLimit(0.99, 1)).toBe(true);
    expect(trimAtLimit(0.99, -1)).toBe(false);
    expect(trimAtLimit(-1, -1)).toBe(true);
    expect(trimAtLimit(null, 1)).toBe(false);
  });
});

describe('brightness and engines', () => {
  it('rounds brightness to a percent', () => {
    expect(brightnessPercent(0.456)).toBe(46);
    expect(brightnessPercent(null)).toBeNull();
  });

  it('draws engines 1 to the count, at most four, one when the count is unusable', () => {
    expect(engineColumns(2, [1, 0, 4])).toEqual({
      columns: [
        { engine: 1, piston: true },
        { engine: 2, piston: true },
      ],
      hidden: 0,
    });
    expect(engineColumns(6, [5, 5, 5, 5, 5, 5]).columns.map((column) => column.engine)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(engineColumns(6, undefined).hidden).toBe(2);
    expect(engineColumns(null, undefined)).toEqual({
      columns: [{ engine: 1, piston: false }],
      hidden: 0,
    });
    expect(engineColumns(0, [0]).columns).toEqual([{ engine: 1, piston: true }]);
    expect(engineColumns(1, [2]).columns).toEqual([{ engine: 1, piston: false }]);
  });
});
