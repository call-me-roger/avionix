import { GAUGES } from '@/domain/engines/catalogue';
import { GAUGE_SETS, engineKind, gaugeLegend, gaugeSpoken } from '@/domain/engines/gauge-sets';
import { bandsFor, scaleFor, scaleFraction, toneOf } from '@/domain/engines/markings';
import {
  convertTemperatureDelta,
  convertTemperatureFrom,
  formatGauge,
  gaugeUnit,
  instrumentValue,
  redlineRpm,
  temperatureSource,
} from '@/domain/engines/units';
import { DEFAULT_UNITS } from '@/domain/units/units';

const LB = { ...DEFAULT_UNITS, fuel: 'lb' as const, temperature: 'F' as const };

describe('engine kinds and gauge sets (spec §4.2)', () => {
  it.each([
    [0, 'piston'],
    [1, 'piston'],
    [3, 'electric'],
    [5, 'singleSpoolJet'],
    [6, 'unsupported'],
    [7, 'jet'],
    [9, 'turboprop'],
    [10, 'turboprop'],
    [2, 'unsupported'],
    [null, 'unsupported'],
  ])('acf_en_type %p is %s', (type, kind) => {
    expect(engineKind(type)).toBe(kind);
  });

  it('gives each kind its dial and rows', () => {
    expect(GAUGE_SETS.piston).toEqual({
      dial: 'rpm',
      rows: ['map', 'ff', 'egt', 'cht', 'oilP', 'oilT'],
    });
    expect(GAUGE_SETS.turboprop).toEqual({
      dial: 'trq',
      rows: ['itt', 'prop', 'n1', 'ff', 'oilP', 'oilT'],
    });
    expect(GAUGE_SETS.jet).toEqual({
      dial: 'n1',
      rows: ['egt', 'n2', 'ff', 'oilP', 'oilT', 'epr'],
    });
    expect(GAUGE_SETS.singleSpoolJet).toEqual({
      dial: 'n1',
      rows: ['egt', 'ff', 'oilP', 'oilT', 'epr'],
    });
    expect(GAUGE_SETS.electric).toEqual({ dial: 'rpm', rows: ['trq'] });
    expect(GAUGE_SETS.unsupported).toEqual({ dial: null, rows: [] });
  });

  it('calls N1 NG on a turboprop only', () => {
    expect(gaugeLegend('n1', 'turboprop')).toBe('NG');
    expect(gaugeLegend('n1', 'jet')).toBe('N1');
    expect(gaugeSpoken('n1', 'turboprop')).toBe('NG');
    expect(gaugeSpoken('oilP', 'piston')).toBe('oil pressure');
  });
});

describe('markings (spec §4.5)', () => {
  const values: Record<string, number> = {
    'sim/aircraft/limits/green_lo_EGT': 1200,
    'sim/aircraft/limits/green_hi_EGT': 1500,
    'sim/aircraft/limits/yellow_lo_EGT': 1500,
    'sim/aircraft/limits/yellow_hi_EGT': 1600,
    'sim/aircraft/limits/red_lo_EGT': 0,
    'sim/aircraft/limits/red_hi_EGT': 0,
  };
  const read = (name: string): number | null => values[name] ?? null;

  it('uses a band only when its high edge is above its low edge', () => {
    expect(bandsFor('EGT', read)).toEqual([
      { colour: 'green', from: 1200, to: 1500 },
      { colour: 'yellow', from: 1500, to: 1600 },
    ]);
    expect(bandsFor(null, read)).toEqual([]);
    expect(bandsFor('CHT', read)).toEqual([]);
  });

  it('scales from the lowest to the highest edge, widened 10 % at the top', () => {
    const bands = bandsFor('EGT', read);
    expect(scaleFor('egt', bands, null)).toEqual({ min: 1200, max: 1640, redline: null });
  });

  it('scales RPM and PROP without markings to 110 % of the redline, N1 and N2 to 110 %', () => {
    expect(scaleFor('rpm', [], 2700)).toEqual({ min: 0, max: 2970, redline: 2700 });
    expect(scaleFor('prop', [], null)).toBeNull();
    expect(scaleFor('n2', [], null)).toEqual({ min: 0, max: 110, redline: null });
    expect(scaleFor('oilT', [], null)).toBeNull();
  });

  it('takes the colour of the band the value is in: red over yellow, redline over normal', () => {
    const bands = [
      { colour: 'green' as const, from: 0, to: 100 },
      { colour: 'yellow' as const, from: 100, to: 120 },
      { colour: 'red' as const, from: 120, to: 140 },
    ];
    expect(toneOf(50, bands, null)).toBe('normal');
    expect(toneOf(110, bands, null)).toBe('yellow');
    expect(toneOf(120, bands, null)).toBe('red');
    expect(toneOf(2750, [], 2700)).toBe('redline');
    expect(toneOf(2700, [], 2700)).toBe('normal');
  });

  it('places a value on the scale, clamped to 0..1', () => {
    const scale = { min: 0, max: 200, redline: null };
    expect(scaleFraction(50, scale)).toBe(0.25);
    expect(scaleFraction(-10, scale)).toBe(0);
    expect(scaleFraction(500, scale)).toBe(1);
  });
});

describe('units and formats (spec §4.3, §4.4)', () => {
  it('turns torque into ft-lb and fuel flow into kg per hour; the rest as reported', () => {
    expect(instrumentValue('trq', 1000)).toBeCloseTo(737.562, 3);
    expect(instrumentValue('ff', 0.01)).toBeCloseTo(36, 6);
    expect(instrumentValue('egt', 1320)).toBe(1320);
  });

  it('turns a redline in rad/s into rev/min; nothing for a missing or zero redline', () => {
    expect(redlineRpm(282.743)).toBeCloseTo(2700, 0);
    expect(redlineRpm(0)).toBeNull();
    expect(redlineRpm(null)).toBeNull();
  });

  it('reads the temperature source from the flag, CHT as Celsius, unknown without the flag', () => {
    const has = (name: string) => name !== 'sim/aircraft/engine/acf_ITT_is_C';
    const flags: Record<string, number> = {
      'sim/aircraft/engine/acf_EGT_is_C': 0,
      'sim/aircraft/engine/acf_oilT_is_C': 1,
    };
    const read = (name: string) => flags[name] ?? null;
    expect(temperatureSource(GAUGES.egt, has, read)).toBe('F');
    expect(temperatureSource(GAUGES.oilT, has, read)).toBe('C');
    expect(temperatureSource(GAUGES.cht, has, read)).toBe('C');
    expect(temperatureSource(GAUGES.itt, has, read)).toBe('unknown');
    expect(temperatureSource(GAUGES.rpm, has, read)).toBeNull();
    // Resolved but no value yet: pending, not unknown, so no sentence flashes at connect.
    expect(
      temperatureSource(
        GAUGES.egt,
        () => true,
        () => null,
      ),
    ).toBe('pending');
  });

  it('converts temperatures and temperature differences', () => {
    expect(convertTemperatureFrom(100, 'C', 'F')).toBe(212);
    expect(convertTemperatureFrom(212, 'F', 'C')).toBe(100);
    expect(convertTemperatureFrom(70, 'F', 'F')).toBe(70);
    expect(convertTemperatureDelta(-10, 'C', 'F')).toBe(-18);
    expect(convertTemperatureDelta(-18, 'F', 'C')).toBe(-10);
  });

  it('formats each gauge (spec §4.3)', () => {
    expect(formatGauge('rpm', 2347, DEFAULT_UNITS, null)).toBe('2,350');
    expect(formatGauge('map', 24.63, DEFAULT_UNITS, null)).toBe('24.6');
    expect(formatGauge('trq', 1236, DEFAULT_UNITS, null)).toBe('1,240');
    expect(formatGauge('n1', 87.44, DEFAULT_UNITS, null)).toBe('87.4');
    expect(formatGauge('epr', 1.417, DEFAULT_UNITS, null)).toBe('1.42');
    expect(formatGauge('egt', 1320.4, LB, 'F')).toBe('1,320');
    expect(formatGauge('egt', 100, LB, 'C')).toBe('212');
    expect(formatGauge('oilT', -5, DEFAULT_UNITS, 'C')).toBe('−5');
    expect(formatGauge('egt', 700, LB, 'unknown')).toBe('700');
    expect(formatGauge('egt', 700, LB, 'pending')).toBe('—');
    expect(formatGauge('ff', 36, DEFAULT_UNITS, null)).toBe('36.0');
    expect(formatGauge('ff', 36, LB, null)).toBe('79.4');
    expect(formatGauge('ff', 1200, DEFAULT_UNITS, null)).toBe('1,200');
    expect(formatGauge('oilP', 61.6, DEFAULT_UNITS, null)).toBe('62');
  });

  it('labels each gauge unit once per row, and speaks it', () => {
    expect(gaugeUnit('rpm', DEFAULT_UNITS, null)).toEqual({ label: '', spoken: '' });
    expect(gaugeUnit('map', DEFAULT_UNITS, null)).toEqual({ label: 'IN', spoken: 'inches' });
    expect(gaugeUnit('trq', DEFAULT_UNITS, null)).toEqual({
      label: 'FT-LB',
      spoken: 'foot-pounds',
    });
    expect(gaugeUnit('n1', DEFAULT_UNITS, null)).toEqual({ label: '%', spoken: 'percent' });
    expect(gaugeUnit('ff', LB, null)).toEqual({ label: 'LB/H', spoken: 'pounds per hour' });
    expect(gaugeUnit('ff', DEFAULT_UNITS, null)).toEqual({
      label: 'KG/H',
      spoken: 'kilograms per hour',
    });
    expect(gaugeUnit('oilP', DEFAULT_UNITS, null)).toEqual({ label: 'PSI', spoken: 'psi' });
    expect(gaugeUnit('egt', LB, 'C')).toEqual({ label: '°F', spoken: 'degrees Fahrenheit' });
    expect(gaugeUnit('cht', DEFAULT_UNITS, 'C')).toEqual({
      label: '°C',
      spoken: 'degrees Celsius',
    });
    expect(gaugeUnit('egt', LB, 'unknown')).toEqual({
      label: '°',
      spoken: 'degrees, unit unknown',
    });
  });
});
