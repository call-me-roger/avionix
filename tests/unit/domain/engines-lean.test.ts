import type { EnginesModel, GaugeReading } from '@/domain/engines/engine-page';
import { advancePeaks, egtSamples, leanAvailable, leanDelta } from '@/domain/engines/lean';
import { DEFAULT_UNITS } from '@/domain/units/units';

function egt(
  engine: number,
  value: number | null,
  source: GaugeReading['source'] = 'F',
): GaugeReading {
  return {
    engine,
    id: 'egt',
    legend: 'EGT',
    value,
    source,
    text: value === null ? '—' : String(value),
    scale: null,
    bands: [],
    tone: 'normal',
    spoken: '',
  };
}

function model(columns: EnginesModel['columns']): EnginesModel {
  return {
    status: 'ready',
    columns,
    rows: [],
    hidden: 0,
    missing: [],
    unknownUnits: [],
    unsupported: [],
  };
}

describe('lean assist (spec §4.6)', () => {
  it('samples EGT from piston engines only', () => {
    const twin = model([
      { engine: 1, kind: 'piston', dial: null, cells: { egt: egt(1, 1300) } },
      { engine: 2, kind: 'jet', dial: null, cells: { egt: egt(2, 900) } },
    ]);
    expect(egtSamples(twin)).toEqual([{ engine: 1, value: 1300 }]);
    expect(leanAvailable(twin)).toBe(true);
    expect(leanAvailable(model([{ engine: 1, kind: 'piston', dial: null, cells: {} }]))).toBe(
      false,
    );
    expect(leanAvailable({ ...twin, status: 'waiting' })).toBe(false);
  });

  it('keeps the highest EGT per engine, returning the same object when nothing rose', () => {
    const first = advancePeaks({}, [
      { engine: 1, value: 1300 },
      { engine: 2, value: null },
    ]);
    expect(first).toEqual({ 1: 1300 });
    const second = advancePeaks(first, [{ engine: 1, value: 1350 }]);
    expect(second).toEqual({ 1: 1350 });
    expect(advancePeaks(second, [{ engine: 1, value: 1320 }])).toBe(second);
  });

  it('shows the difference from peak in the pilot unit', () => {
    expect(leanDelta(egt(1, 1325), 1350, { ...DEFAULT_UNITS, temperature: 'F' })).toEqual({
      text: '−25',
      spoken: 'Engine 1 25 degrees below peak EGT',
    });
    // 25 °F of difference is 13.9 °C.
    expect(leanDelta(egt(1, 1325), 1350, DEFAULT_UNITS).text).toBe('−14');
    expect(leanDelta(egt(1, 1350), 1350, DEFAULT_UNITS)).toEqual({
      text: '0',
      spoken: 'Engine 1 at peak EGT',
    });
    expect(leanDelta(egt(1, 700, 'unknown'), 710, DEFAULT_UNITS).text).toBe('−10');
  });

  it('shows a dash before a peak or a value exists', () => {
    expect(leanDelta(egt(1, 1300), undefined, DEFAULT_UNITS)).toEqual({
      text: '—',
      spoken: 'Engine 1, no peak EGT yet',
    });
    expect(leanDelta(egt(1, null), 1300, DEFAULT_UNITS).text).toBe('—');
  });
});
