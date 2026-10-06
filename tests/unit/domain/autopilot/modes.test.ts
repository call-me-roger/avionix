import {
  type ModeStatuses,
  annunciationText,
  autothrottleArmed,
  autothrottleEngaged,
  autothrottleWord,
  modeNotTaken,
  modeState,
} from '@/domain/autopilot/modes';

const OFF: ModeStatuses = {
  hdg: 0,
  nav: 0,
  apr: 0,
  alt: 0,
  vs: 0,
  flc: 0,
  gs: 0,
  rol: 0,
  pit: 0,
};

describe('modeState', () => {
  it("reads X-Plane's 0 off, 1 armed, 2 captured", () => {
    expect(modeState(0)).toBe('off');
    expect(modeState(1)).toBe('armed');
    expect(modeState(2)).toBe('engaged');
    expect(modeState(3)).toBe('engaged');
    expect(modeState(null)).toBe('off');
    expect(modeState(-1)).toBe('off');
  });
});

describe('annunciationText', () => {
  it('names the engaged lateral and vertical modes, then the armed ones', () => {
    expect(annunciationText({ ...OFF, hdg: 2, nav: 1, alt: 2 }, 0)).toBe('HDG · ALT · Armed NAV');
  });
  it('gives the approach precedence over heading, and glideslope over altitude', () => {
    expect(annunciationText({ ...OFF, hdg: 2, apr: 2, alt: 2, gs: 2 }, null)).toBe('APR · GS');
  });
  it('lists every armed mode in order, and the autothrottle mode when active', () => {
    expect(annunciationText({ ...OFF, rol: 2, pit: 2, nav: 1, apr: 1, alt: 1, gs: 1 }, 1)).toBe(
      'ROL · PIT · Armed NAV, APR, ALT, GS · A/T SPD',
    );
  });
  it('says so when nothing is engaged', () => {
    expect(annunciationText(OFF, 0)).toBe('No modes engaged');
    expect(annunciationText(OFF, null)).toBe('No modes engaged');
  });
  it('shows a vertical mode alone', () => {
    expect(annunciationText({ ...OFF, vs: 2 }, null)).toBe('VS');
    expect(annunciationText({ ...OFF, flc: 2 }, 2)).toBe('FLC · A/T N1');
  });
});

describe('autothrottle', () => {
  it('words each active mode, nothing for off or armed', () => {
    expect(autothrottleWord(-1)).toBeNull();
    expect(autothrottleWord(0)).toBeNull();
    expect(autothrottleWord(1)).toBe('SPD');
    expect(autothrottleWord(2)).toBe('N1');
    expect(autothrottleWord(3)).toBe('RETARD');
    expect(autothrottleWord(4)).toBe('ON');
    expect(autothrottleWord(null)).toBeNull();
  });
  it('is armed from 0 and engaged from 1', () => {
    expect(autothrottleArmed(-1)).toBe(false);
    expect(autothrottleArmed(0)).toBe(true);
    expect(autothrottleArmed(null)).toBe(false);
    expect(autothrottleEngaged(0)).toBe(false);
    expect(autothrottleEngaged(2)).toBe(true);
  });
});

describe('modeNotTaken', () => {
  it('says what did not happen, with a next step for navigation modes', () => {
    expect(modeNotTaken('HDG', true, false)).toBe('X-Plane did not engage HDG.');
    expect(modeNotTaken('NAV', true, true)).toBe(
      'X-Plane did not engage NAV. Check the navigation source.',
    );
    expect(modeNotTaken('APR', false, true)).toBe('X-Plane did not turn APR off.');
  });
});
