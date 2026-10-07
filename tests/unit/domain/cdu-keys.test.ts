import {
  ALPHA_ROWS,
  CDU_KEYS,
  FUNCTION_ROWS,
  LSK_LEFT,
  LSK_RIGHT,
  NUMERIC_ROWS,
  cduCommand,
  cduExecLight,
  cduKey,
  cduStyleLine,
  cduTextLine,
} from '@/domain/cdu/keys';

// Laminar's Commands.txt, sim/FMS/ section, minus CDU_popup and CDU_popout.
const LAMINAR_IDS = [
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`ls_${n}l`, `ls_${n}r`]),
  'index',
  'fpln',
  'clb',
  'crz',
  'des',
  'dir_intc',
  'legs',
  'dep_arr',
  'hold',
  'prog',
  'exec',
  'fix',
  'navrad',
  'prev',
  'next',
  ...'0123456789'.split('').map((d) => `key_${d}`),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `key_${l}`),
  'key_period',
  'key_minus',
  'key_slash',
  'key_back',
  'key_space',
  'key_delete',
  'key_clear',
];

describe('CDU key catalogue', () => {
  it('has exactly the 70 Laminar key commands, each once', () => {
    const ids = CDU_KEYS.map((key) => key.id);
    expect(new Set(ids).size).toBe(70);
    expect([...ids].sort()).toEqual([...LAMINAR_IDS].sort());
  });

  it('lays the keys out like a Boeing CDU', () => {
    expect(LSK_LEFT.map((k) => k.name)).toEqual([
      'LSK 1L',
      'LSK 2L',
      'LSK 3L',
      'LSK 4L',
      'LSK 5L',
      'LSK 6L',
    ]);
    expect(LSK_RIGHT.map((k) => k.id)).toEqual([
      'ls_1r',
      'ls_2r',
      'ls_3r',
      'ls_4r',
      'ls_5r',
      'ls_6r',
    ]);
    expect(FUNCTION_ROWS.map((row) => row.map((k) => k.name))).toEqual([
      ['INDEX', 'FPLN', 'CLB', 'CRZ', 'DES'],
      ['DIR INTC', 'LEGS', 'DEP ARR', 'HOLD', 'PROG', 'EXEC'],
      ['NAV RAD', 'FIX', 'PREV PAGE', 'NEXT PAGE', 'BACK'],
    ]);
    expect(ALPHA_ROWS.map((row) => row.map((k) => k.legend))).toEqual([
      ['A', 'B', 'C', 'D', 'E'],
      ['F', 'G', 'H', 'I', 'J'],
      ['K', 'L', 'M', 'N', 'O'],
      ['P', 'Q', 'R', 'S', 'T'],
      ['U', 'V', 'W', 'X', 'Y'],
      ['Z', 'SP', 'DEL', '/', 'CLR'],
    ]);
    expect(NUMERIC_ROWS.map((row) => row.map((k) => k.legend))).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['.', '0', '+/−'],
    ]);
    expect(cduKey('key_minus')?.name).toBe('+/−');
    expect(cduKey('dep_arr')?.legend).toBe('DEP\nARR');
    expect(cduKey('ls_3l')?.spoken).toBe('Line select left 3');
  });

  it('builds the verified X-Plane names', () => {
    expect(cduCommand(1, 'exec')).toBe('sim/FMS/exec');
    expect(cduCommand(2, 'key_A')).toBe('sim/FMS2/key_A');
    expect(cduTextLine(1, 0)).toBe('sim/cockpit2/radios/indicators/fms_cdu1_text_line0');
    expect(cduStyleLine(2, 15)).toBe('sim/cockpit2/radios/indicators/fms_cdu2_style_line15');
    expect(cduExecLight(1)).toBe('sim/cockpit2/radios/indicators/fms_exec_light_pilot');
    expect(cduExecLight(2)).toBe('sim/cockpit2/radios/indicators/fms_exec_light_copilot');
  });
});
