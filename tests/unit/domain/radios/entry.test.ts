import {
  deleteDigit,
  entryDigits,
  entryText,
  keyAccepted,
  parseEntry,
  pushDigit,
} from '@/domain/radios/entry';

describe('digit entry', () => {
  it("stops at the kind's length", () => {
    let draft = '';
    for (const digit of [1, 2, 1, 5, 0, 0, 5]) {
      draft = pushDigit('com', draft, digit);
    }
    expect(draft).toBe('121500');
    expect(pushDigit('nav', '11030', 5)).toBe('11030');
    expect(pushDigit('squawk', '7000', 1)).toBe('7000');
  });

  it('never takes 8 or 9 for a squawk', () => {
    expect(keyAccepted('squawk', 8)).toBe(false);
    expect(keyAccepted('squawk', 9)).toBe(false);
    expect(keyAccepted('squawk', 7)).toBe(true);
    expect(pushDigit('squawk', '7', 8)).toBe('7');
    expect(entryDigits('squawk')).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
    expect(entryDigits('com')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  });

  it('deletes one digit', () => {
    expect(deleteDigit('1215')).toBe('121');
    expect(deleteDigit('')).toBe('');
  });

  it('shows the implied decimal point and the digits still to come', () => {
    expect(entryText('com', '1215')).toBe('121.5__');
    expect(entryText('com', '')).toBe('___.___');
    expect(entryText('nav', '1103')).toBe('110.3_');
    expect(entryText('squawk', '70')).toBe('70__');
  });
});

describe('parsing an entry', () => {
  it('says nothing until three digits for a frequency', () => {
    expect(parseEntry('com', '12')).toEqual({ status: 'incomplete', message: null });
    expect(parseEntry('nav', '')).toEqual({ status: 'incomplete', message: null });
  });

  it('pads a short frequency with zeros', () => {
    expect(parseEntry('com', '121')).toEqual({
      status: 'valid',
      value: 121_000,
      text: '121.000',
      note: null,
    });
    expect(parseEntry('com', '1215')).toMatchObject({ status: 'valid', value: 121_500 });
    expect(parseEntry('com', '118005')).toMatchObject({ status: 'valid', value: 118_005 });
    expect(parseEntry('nav', '1103')).toMatchObject({
      status: 'valid',
      value: 11_030,
      text: '110.30',
    });
  });

  it('rejects with the channel rule, never snapping', () => {
    expect(parseEntry('com', '11802')).toEqual({
      status: 'invalid',
      message: '118.020 is not a COM channel. Nearest: 118.015 or 118.025.',
    });
    expect(parseEntry('com', '2')).toEqual({ status: 'incomplete', message: null });
    expect(parseEntry('com', '200')).toEqual({
      status: 'invalid',
      message: 'COM channels run from 118.000 to 136.990.',
    });
    expect(parseEntry('nav', '11032')).toEqual({
      status: 'invalid',
      message: 'NAV frequencies run from 108.00 to 117.95 in 0.05 steps.',
    });
  });

  it('asks for four squawk digits once one is typed', () => {
    expect(parseEntry('squawk', '')).toEqual({ status: 'incomplete', message: null });
    expect(parseEntry('squawk', '70')).toEqual({
      status: 'incomplete',
      message: 'Enter four digits.',
    });
  });

  it('accepts a squawk and names an emergency code', () => {
    expect(parseEntry('squawk', '0400')).toEqual({
      status: 'valid',
      value: 400,
      text: '0400',
      note: null,
    });
    expect(parseEntry('squawk', '7700')).toEqual({
      status: 'valid',
      value: 7700,
      text: '7700',
      note: '7700 — emergency',
    });
  });

  it('refuses a draft that did not come from the keypad', () => {
    expect(parseEntry('squawk', '7800')).toEqual({
      status: 'invalid',
      message: 'Squawk codes use the digits 0 to 7.',
    });
    expect(parseEntry('com', '12a500')).toEqual({ status: 'incomplete', message: null });
  });
});
