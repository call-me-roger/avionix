/**
 * The default X-Plane FMS's CDU (F-32): its DataRef and command names, verified against
 * Laminar's DataRefs.txt and Commands.txt, and its keys in a Boeing-style arrangement.
 */
export type CduUnit = 1 | 2;

export interface CduKey {
  /** The command suffix after `sim/FMS/` or `sim/FMS2/`. */
  id: string;
  /** Printed on the key; `\n` breaks a two-word legend. Empty for line-select keys. */
  legend: string;
  /** Short name used in messages: "K", "EXEC", "DEP ARR", "LSK 1L". */
  name: string;
  /** Screen-reader label. */
  spoken: string;
}

export const CDU_LINE_COUNT = 16;

const INDICATORS = 'sim/cockpit2/radios/indicators';

function key(id: string, legend: string, spoken: string, name = legend.replace('\n', ' ')): CduKey {
  return { id, legend, name, spoken };
}

function lineSelect(side: 'l' | 'r'): CduKey[] {
  const word = side === 'l' ? 'left' : 'right';
  return [1, 2, 3, 4, 5, 6].map((row) =>
    key(`ls_${row}${side}`, '', `Line select ${word} ${row}`, `LSK ${row}${side.toUpperCase()}`),
  );
}

export const LSK_LEFT: readonly CduKey[] = lineSelect('l');
export const LSK_RIGHT: readonly CduKey[] = lineSelect('r');

export const FUNCTION_ROWS: readonly (readonly CduKey[])[] = [
  [
    key('index', 'INDEX', 'Index'),
    key('fpln', 'FPLN', 'Flight plan'),
    key('clb', 'CLB', 'Climb'),
    key('crz', 'CRZ', 'Cruise'),
    key('des', 'DES', 'Descent'),
  ],
  [
    key('dir_intc', 'DIR\nINTC', 'Direct intercept'),
    key('legs', 'LEGS', 'Legs'),
    key('dep_arr', 'DEP\nARR', 'Departure arrival'),
    key('hold', 'HOLD', 'Hold'),
    key('prog', 'PROG', 'Progress'),
    key('exec', 'EXEC', 'Execute'),
  ],
  [
    key('navrad', 'NAV\nRAD', 'Nav radio'),
    key('fix', 'FIX', 'Fix'),
    key('prev', 'PREV\nPAGE', 'Previous page'),
    key('next', 'NEXT\nPAGE', 'Next page'),
    key('key_back', 'BACK', 'Back'),
  ],
];

const letter = (l: string) => key(`key_${l}`, l, l);

export const ALPHA_ROWS: readonly (readonly CduKey[])[] = [
  ...['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', 'UVWXY'].map((row) => row.split('').map(letter)),
  [
    letter('Z'),
    key('key_space', 'SP', 'Space'),
    key('key_delete', 'DEL', 'Delete'),
    key('key_slash', '/', 'Slash'),
    key('key_clear', 'CLR', 'Clear'),
  ],
];

const digit = (d: string) => key(`key_${d}`, d, d);

export const NUMERIC_ROWS: readonly (readonly CduKey[])[] = [
  ['1', '2', '3'].map(digit),
  ['4', '5', '6'].map(digit),
  ['7', '8', '9'].map(digit),
  [key('key_period', '.', 'Point'), digit('0'), key('key_minus', '+/−', 'Plus minus')],
];

export const CDU_KEYS: readonly CduKey[] = [
  ...LSK_LEFT,
  ...LSK_RIGHT,
  ...FUNCTION_ROWS.flat(),
  ...ALPHA_ROWS.flat(),
  ...NUMERIC_ROWS.flat(),
];

const BY_ID = new Map(CDU_KEYS.map((entry) => [entry.id, entry]));

export function cduKey(id: string): CduKey | undefined {
  return BY_ID.get(id);
}

export function cduCommand(unit: CduUnit, id: string): string {
  return `sim/${unit === 1 ? 'FMS' : 'FMS2'}/${id}`;
}

export function cduTextLine(unit: CduUnit, line: number): string {
  return `${INDICATORS}/fms_cdu${unit}_text_line${line}`;
}

export function cduStyleLine(unit: CduUnit, line: number): string {
  return `${INDICATORS}/fms_cdu${unit}_style_line${line}`;
}

export function cduExecLight(unit: CduUnit): string {
  return `${INDICATORS}/fms_exec_light_${unit === 1 ? 'pilot' : 'copilot'}`;
}
