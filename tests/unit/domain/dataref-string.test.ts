import { decodeDataRefBytes, decodeDataRefString } from '@/domain/simulator/dataref-string';

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

describe('decodeDataRefBytes', () => {
  it('decodes the bytes of a base64 string', () => {
    const result = decodeDataRefBytes('AQID');
    expect(result).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('includes interior zeros', () => {
    const result = decodeDataRefBytes(Buffer.from([1, 0, 2]).toString('base64'));
    expect(result).toEqual(Uint8Array.from([1, 0, 2]));
  });

  it('converts an array to Uint8Array', () => {
    const result = decodeDataRefBytes([1, 2]);
    expect(result).toEqual(Uint8Array.from([1, 2]));
  });

  it('masks array values to 0–255', () => {
    const result = decodeDataRefBytes([256, -1, 0x1ff]);
    expect(result).toEqual(Uint8Array.from([0, 0xff, 0xff]));
  });

  it('returns null for a number', () => {
    expect(decodeDataRefBytes(42)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(decodeDataRefBytes(undefined)).toBeNull();
  });

  it('returns null for invalid base64', () => {
    expect(decodeDataRefBytes('not base64!')).toBeNull();
  });
});
