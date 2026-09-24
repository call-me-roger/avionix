import { decodeDataRefString } from '@/domain/simulator/dataref-string';

describe('decodeDataRefString', () => {
  it('decodes base64 text', () => {
    expect(decodeDataRefString('Q2Vzc25hIDE3MiBTUA==', 'data')).toBe('Cessna 172 SP');
  });

  it('cuts the string at the first NUL, which X-Plane pads with', () => {
    expect(decodeDataRefString('TjE3MlNQAAAAAA==', 'data')).toBe('N172SP');
  });

  it('decodes multi-byte UTF-8', () => {
    expect(decodeDataRefString('w4Q=', 'data')).toBe('Ä');
  });

  it('returns null for a value that decodes to nothing', () => {
    expect(decodeDataRefString('', 'data')).toBeNull();
    expect(decodeDataRefString('AAAA', 'data')).toBeNull();
  });

  it('returns null when the payload is not base64', () => {
    expect(decodeDataRefString('not base64!', 'data')).toBeNull();
  });

  it('returns null for every non-data value type, so a number is never read as text', () => {
    expect(decodeDataRefString('Q2Vzc25h', 'float')).toBeNull();
    expect(decodeDataRefString(12.5, 'data')).toBeNull();
    expect(decodeDataRefString([1, 2], 'float_array')).toBeNull();
  });
});
