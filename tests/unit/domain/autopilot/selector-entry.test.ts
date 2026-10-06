import {
  EMPTY_SELECTOR_DRAFT,
  type SelectorDraft,
  deleteSelectorDigit,
  explainSelector,
  hasSign,
  parseSelectorEntry,
  pushSelectorDigit,
  selectorDraftText,
  toggleSelectorSign,
} from '@/domain/autopilot/selector-entry';
import type { SelectorKind } from '@/domain/autopilot/selectors';

function typed(kind: SelectorKind, digits: string, negative = false): SelectorDraft {
  let draft: SelectorDraft = EMPTY_SELECTOR_DRAFT;
  for (const digit of digits) {
    draft = pushSelectorDigit(kind, draft, Number(digit));
  }
  return negative ? toggleSelectorSign(kind, draft) : draft;
}

describe('the selector draft', () => {
  it("stops at each kind's length", () => {
    expect(typed('heading', '2705').digits).toBe('270');
    expect(typed('altitude', '123456').digits).toBe('12345');
    expect(typed('verticalSpeed', '12345').digits).toBe('1234');
    expect(typed('knots', '2500').digits).toBe('250');
    expect(typed('mach', '785').digits).toBe('78');
  });
  it('deletes the last digit', () => {
    expect(deleteSelectorDigit(typed('altitude', '500')).digits).toBe('50');
  });
  it('has a sign only for vertical speed', () => {
    expect(hasSign('verticalSpeed')).toBe(true);
    expect(hasSign('altitude')).toBe(false);
    expect(toggleSelectorSign('altitude', typed('altitude', '5')).negative).toBe(false);
    expect(toggleSelectorSign('verticalSpeed', typed('verticalSpeed', '5')).negative).toBe(true);
  });
  it('reads as typed, with the unit', () => {
    expect(selectorDraftText('heading', typed('heading', '27'))).toBe('27°');
    expect(selectorDraftText('altitude', typed('altitude', '5000'))).toBe('5000 ft');
    expect(selectorDraftText('verticalSpeed', typed('verticalSpeed', '1500', true))).toBe(
      '−1500 fpm',
    );
    expect(selectorDraftText('knots', typed('knots', '25'))).toBe('25 kt');
    expect(selectorDraftText('mach', typed('mach', '7'))).toBe('M .7_');
    expect(selectorDraftText('altitude', EMPTY_SELECTOR_DRAFT)).toBe('');
  });
});

describe('parseSelectorEntry', () => {
  it('sends a typed 360 as 0', () => {
    expect(parseSelectorEntry('heading', typed('heading', '360'))).toEqual({
      status: 'valid',
      value: 0,
      text: '360°',
    });
    expect(parseSelectorEntry('heading', typed('heading', '5'))).toEqual({
      status: 'valid',
      value: 5,
      text: '005°',
    });
  });
  it('accepts any whole altitude in range', () => {
    expect(parseSelectorEntry('altitude', typed('altitude', '4550'))).toEqual({
      status: 'valid',
      value: 4550,
      text: '4,550 ft',
    });
    expect(parseSelectorEntry('altitude', typed('altitude', '60000'))).toEqual({
      status: 'invalid',
      message: 'Altitude runs from 0 to 50,000 ft.',
    });
  });
  it('applies the vertical speed sign, and never sends minus zero', () => {
    expect(parseSelectorEntry('verticalSpeed', typed('verticalSpeed', '1500', true))).toEqual({
      status: 'valid',
      value: -1500,
      text: '−1,500 fpm',
    });
    const zero = parseSelectorEntry('verticalSpeed', typed('verticalSpeed', '0', true));
    expect(zero.status === 'valid' && Object.is(zero.value, 0)).toBe(true);
    expect(parseSelectorEntry('verticalSpeed', typed('verticalSpeed', '9950'))).toEqual({
      status: 'invalid',
      message: 'Vertical speed runs from −9,900 to +9,900 fpm.',
    });
  });
  it('needs two digits for knots and Mach', () => {
    expect(parseSelectorEntry('knots', typed('knots', '2'))).toEqual({ status: 'incomplete' });
    expect(parseSelectorEntry('mach', typed('mach', '8'))).toEqual({ status: 'incomplete' });
    expect(parseSelectorEntry('mach', typed('mach', '82'))).toEqual({
      status: 'valid',
      value: 0.82,
      text: 'M .82',
    });
    expect(parseSelectorEntry('mach', typed('mach', '05'))).toEqual({
      status: 'invalid',
      message: 'Mach runs from .10 to .99.',
    });
    expect(parseSelectorEntry('knots', typed('knots', '30'))).toEqual({
      status: 'invalid',
      message: 'Airspeed runs from 40 to 500 kt.',
    });
  });
  it('is incomplete when empty', () => {
    expect(parseSelectorEntry('altitude', EMPTY_SELECTOR_DRAFT)).toEqual({ status: 'incomplete' });
  });
});

describe('explainSelector', () => {
  const explain = (kind: SelectorKind, digits: string) => {
    const draft = typed(kind, digits);
    return explainSelector(kind, draft, parseSelectorEntry(kind, draft));
  };
  it('waits while more digits could still bring the value into range', () => {
    expect(explain('knots', '30')).toBe(false);
    expect(explain('knots', '300')).toBe(false);
  });
  it('explains at full length, or once the value is already above the maximum', () => {
    expect(explain('knots', '600')).toBe(true);
    expect(explain('heading', '400')).toBe(true);
    expect(explain('mach', '05')).toBe(true);
    expect(explain('altitude', '60000')).toBe(true);
  });
});
