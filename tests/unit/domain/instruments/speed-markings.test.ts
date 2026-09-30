import { speedBands, speedMarkings } from '@/domain/instruments/speed-markings';

const C172 = { vso: 40, vs: 48, vfe: 85, vno: 129, vne: 163 };

describe('speed markings', () => {
  it('accepts a plausible set', () => {
    expect(speedMarkings(C172)).toEqual(C172);
  });

  it('rejects a set with a gap, a zero, a NaN or the wrong order', () => {
    expect(speedMarkings({ ...C172, vne: null })).toBeNull();
    expect(speedMarkings({ ...C172, vso: 0 })).toBeNull();
    expect(speedMarkings({ ...C172, vno: Number.NaN })).toBeNull();
    expect(speedMarkings({ ...C172, vno: 170 })).toBeNull();
    expect(speedMarkings({ ...C172, vs: 30 })).toBeNull();
    expect(speedMarkings({ ...C172, vfe: 39 })).toBeNull();
    expect(speedMarkings({ ...C172, vfe: 170 })).toBeNull();
  });

  it('draws white, green and yellow bands', () => {
    expect(speedBands(C172)).toEqual([
      { from: 40, to: 85, color: 'white' },
      { from: 48, to: 129, color: 'green' },
      { from: 129, to: 163, color: 'yellow' },
    ]);
  });
});
