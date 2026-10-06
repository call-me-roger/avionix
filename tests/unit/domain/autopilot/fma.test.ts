import {
  AP_DISCONNECT_MS,
  EMPTY_BOX_STATE,
  EMPTY_DISCONNECT,
  FMA_BOX_MS,
  type FmaInput,
  disconnectShowing,
  fmaColumns,
  isBoxed,
  nextBoxState,
  nextDisconnect,
} from '@/domain/autopilot/fma';
import type { ModeStatuses } from '@/domain/autopilot/modes';

const NONE: ModeStatuses = {
  hdg: null,
  nav: null,
  apr: null,
  alt: null,
  vs: null,
  flc: null,
  gs: null,
  rol: null,
  pit: null,
};

function input(statuses: Partial<ModeStatuses>, overrides: Partial<FmaInput> = {}): FmaInput {
  return {
    statuses: { ...NONE, ...statuses },
    autothrottle: null,
    ap: false,
    fd: false,
    vsFpm: null,
    speed: null,
    speedIsMach: false,
    ...overrides,
  };
}

const T = 1_000_000;

describe('fmaColumns', () => {
  it('lays the modes out engaged over armed, per axis, with A/T and AP/FD', () => {
    expect(
      fmaColumns(input({ hdg: 2, nav: 1, alt: 2, gs: 1 }, { autothrottle: 1, ap: true, fd: true })),
    ).toEqual({
      lateral: { active: 'HDG', armed: ['NAV'] },
      vertical: { active: 'ALT', reference: null, armed: ['GS'] },
      autothrottle: { active: 'SPD', armed: false },
      ap: true,
      fd: true,
    });
  });

  it('gives VS its target, rounded to 100 and signed with a true minus for descent', () => {
    expect(fmaColumns(input({ vs: 2 }, { vsFpm: -512 })).vertical).toEqual({
      active: 'VS',
      reference: '−500FPM',
      armed: [],
    });
    expect(fmaColumns(input({ vs: 2 }, { vsFpm: 480 })).vertical.reference).toBe('500FPM');
    expect(fmaColumns(input({ vs: 2 }, { vsFpm: null })).vertical.reference).toBeNull();
  });

  it('gives FLC its target speed in knots or Mach', () => {
    expect(fmaColumns(input({ flc: 2 }, { speed: 120.4 })).vertical).toEqual({
      active: 'FLC',
      reference: '120KT',
      armed: [],
    });
    expect(
      fmaColumns(input({ flc: 2 }, { speed: 0.784, speedIsMach: true })).vertical.reference,
    ).toBe('M.78');
  });

  it('shows the autothrottle armed only when it is armed and not active', () => {
    expect(fmaColumns(input({}, { autothrottle: 0 })).autothrottle).toEqual({
      active: null,
      armed: true,
    });
    expect(fmaColumns(input({}, { autothrottle: -1 })).autothrottle).toEqual({
      active: null,
      armed: false,
    });
    expect(fmaColumns(input({}, { autothrottle: null })).autothrottle).toEqual({
      active: null,
      armed: false,
    });
  });

  it('keeps the annunciator’s precedence on both axes', () => {
    const columns = fmaColumns(input({ apr: 2, nav: 2, gs: 2, alt: 2 }));
    expect(columns.lateral.active).toBe('APR');
    expect(columns.vertical.active).toBe('GS');
  });

  it('arms only NAV and APR laterally and ALT and GS vertically, in that order', () => {
    const columns = fmaColumns(
      input({ apr: 1, nav: 1, gs: 1, alt: 1, hdg: 1, vs: 1, flc: 1, rol: 1, pit: 1 }),
    );
    expect(columns.lateral.armed).toEqual(['NAV', 'APR']);
    expect(columns.vertical.armed).toEqual(['ALT', 'GS']);
  });
});

describe('nextBoxState', () => {
  const hdg = fmaColumns(input({ hdg: 2, alt: 2 }));
  const nav = fmaColumns(input({ nav: 2, alt: 2 }));

  it('boxes nothing on the first sample: modes already engaged are not new', () => {
    const state = nextBoxState(EMPTY_BOX_STATE, hdg, T);
    for (const slot of ['autothrottle', 'lateral', 'vertical', 'ap'] as const) {
      expect(isBoxed(state, slot, T)).toBe(false);
    }
  });

  it(`boxes a newly active mode for ${FMA_BOX_MS} ms`, () => {
    const first = nextBoxState(EMPTY_BOX_STATE, hdg, T - 1000);
    const state = nextBoxState(first, nav, T);
    expect(isBoxed(state, 'lateral', T + 9_999)).toBe(true);
    expect(isBoxed(state, 'lateral', T + 10_000)).toBe(false);
    expect(isBoxed(state, 'vertical', T)).toBe(false);
  });

  it('does not box a new target for the same mode', () => {
    const first = nextBoxState(
      EMPTY_BOX_STATE,
      fmaColumns(input({ vs: 2 }, { vsFpm: 500 })),
      T - 1000,
    );
    const state = nextBoxState(first, fmaColumns(input({ vs: 2 }, { vsFpm: 600 })), T);
    expect(state).toBe(first);
    expect(isBoxed(state, 'vertical', T)).toBe(false);
  });

  it('does not box a slot that went empty', () => {
    const first = nextBoxState(EMPTY_BOX_STATE, hdg, T - 2000);
    const boxed = nextBoxState(first, nav, T - 1000);
    const state = nextBoxState(boxed, fmaColumns(input({ alt: 2 })), T);
    expect(isBoxed(state, 'lateral', T)).toBe(false);
  });

  it('boxes AP when the autopilot engages', () => {
    const first = nextBoxState(EMPTY_BOX_STATE, fmaColumns(input({}, { ap: false })), T - 1000);
    const state = nextBoxState(first, fmaColumns(input({}, { ap: true })), T);
    expect(isBoxed(state, 'ap', T)).toBe(true);
  });
});

describe('nextDisconnect', () => {
  it(`annunciates an autopilot disconnect seen live for ${AP_DISCONNECT_MS} ms`, () => {
    const engaged = nextDisconnect(EMPTY_DISCONNECT, true, true, T - 1000);
    const state = nextDisconnect(engaged, false, true, T);
    expect(disconnectShowing(state, T)).toBe(true);
    expect(disconnectShowing(state, T + 4_999)).toBe(true);
    expect(disconnectShowing(state, T + 5_000)).toBe(false);
  });

  it('does not count a change seen across a gap in current values', () => {
    const engaged = nextDisconnect(EMPTY_DISCONNECT, true, true, T - 2000);
    const gap = nextDisconnect(engaged, true, false, T - 1000);
    expect(disconnectShowing(gap, T - 1000)).toBe(false);
    const state = nextDisconnect(gap, false, true, T);
    expect(disconnectShowing(state, T)).toBe(false);
  });

  it('shows nothing without autopilot data', () => {
    const state = nextDisconnect(EMPTY_DISCONNECT, null, true, T);
    expect(state).toBe(EMPTY_DISCONNECT);
    expect(disconnectShowing(state, T)).toBe(false);
  });

  it('clears early once acknowledged', () => {
    const engaged = nextDisconnect(EMPTY_DISCONNECT, true, true, T - 1000);
    const state = nextDisconnect(engaged, false, true, T);
    const acknowledged = { ...state, since: null };
    expect(disconnectShowing(acknowledged, T)).toBe(false);
    expect(nextDisconnect(acknowledged, false, true, T + 1000)).toBe(acknowledged);
  });
});
