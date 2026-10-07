import { ENGINE_CONFIG, GAUGES, markingName } from '@/domain/engines/catalogue';
import { type EngineReader, enginesPage } from '@/domain/engines/engine-page';
import { DEFAULT_UNITS } from '@/domain/units/units';

type Values = Record<string, number | number[]>;

/** A reader over plain values: a name resolves when it has a value, unless listed as missing. */
function reader(values: Values, missing: readonly string[] = []): EngineReader {
  return {
    has: (name) => !missing.includes(name) && name in values,
    number: (name, index = 0) => {
      const value = values[name];
      const candidate = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;
      return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
    },
  };
}

const sixteen = (...first: number[]): number[] => [
  ...first,
  ...new Array<number>(16 - first.length).fill(0),
];

/** A C172-like piston single: EGT in °F, oil temperature in °C, an EGT green band. */
const PISTON: Values = {
  [ENGINE_CONFIG.count]: 1,
  [ENGINE_CONFIG.type]: sixteen(1),
  [ENGINE_CONFIG.egtIsCelsius]: 0,
  [ENGINE_CONFIG.ittIsCelsius]: 1,
  [ENGINE_CONFIG.oilTempIsCelsius]: 1,
  [ENGINE_CONFIG.engineRedline]: 282.743,
  [ENGINE_CONFIG.propRedline]: 282.743,
  [GAUGES.rpm.name]: sixteen(2347),
  [GAUGES.map.name]: sixteen(24.6),
  [GAUGES.ff.name]: sixteen(0.0105),
  [GAUGES.egt.name]: sixteen(1320),
  [GAUGES.cht.name]: sixteen(180),
  [GAUGES.oilP.name]: sixteen(62),
  [GAUGES.oilT.name]: sixteen(82),
  [GAUGES.n1.name]: sixteen(0),
  [GAUGES.n2.name]: sixteen(0),
  [GAUGES.prop.name]: sixteen(2347),
  [GAUGES.trq.name]: sixteen(0),
  [GAUGES.epr.name]: sixteen(0),
  [GAUGES.itt.name]: sixteen(0),
  [markingName('green', 'lo', 'EGT')]: 1200,
  [markingName('green', 'hi', 'EGT')]: 1500,
};

describe('enginesPage (spec §4.2–§4.5)', () => {
  it('draws a piston single: an RPM dial and the six piston rows with units', () => {
    const model = enginesPage(reader(PISTON), DEFAULT_UNITS);
    expect(model.status).toBe('ready');
    expect(model.columns).toHaveLength(1);
    expect(model.columns[0]?.kind).toBe('piston');
    expect(model.columns[0]?.dial?.id).toBe('rpm');
    expect(model.columns[0]?.dial?.text).toBe('2,350');
    expect(model.columns[0]?.dial?.scale?.redline).toBeCloseTo(2700, 0);
    expect(model.rows).toEqual([
      { id: 'map', label: 'MAP IN' },
      { id: 'ff', label: 'FF KG/H' },
      { id: 'egt', label: 'EGT °C' },
      { id: 'cht', label: 'CHT °C' },
      { id: 'oilP', label: 'OIL P PSI' },
      { id: 'oilT', label: 'OIL T °C' },
    ]);
    expect(model.hidden).toBe(0);
    expect(model.missing).toEqual([]);
  });

  it('converts EGT from the aircraft unit (°F) to the pilot unit and keeps bands in the source unit', () => {
    const model = enginesPage(reader(PISTON), DEFAULT_UNITS);
    const egt = model.columns[0]?.cells.egt;
    expect(egt?.source).toBe('F');
    expect(egt?.value).toBe(1320);
    expect(egt?.text).toBe('716');
    expect(egt?.bands).toEqual([{ colour: 'green', from: 1200, to: 1500 }]);
    expect(egt?.tone).toBe('normal');
    expect(egt?.spoken).toBe('Engine 1 EGT 716 degrees Celsius');
  });

  it('speaks a value in a band by its colour, and a missing value as no value', () => {
    const hot = enginesPage(
      reader({
        ...PISTON,
        [markingName('red', 'lo', 'EGT')]: 1300,
        [markingName('red', 'hi', 'EGT')]: 1700,
      }),
      { ...DEFAULT_UNITS, temperature: 'F' },
    );
    expect(hot.columns[0]?.cells.egt?.tone).toBe('red');
    expect(hot.columns[0]?.cells.egt?.spoken).toBe(
      'Engine 1 EGT 1,320 degrees Fahrenheit, in the red band',
    );
    const empty = enginesPage(reader({ ...PISTON, [GAUGES.cht.name]: [] }), DEFAULT_UNITS);
    expect(empty.columns[0]?.cells.cht?.text).toBe('—');
    expect(empty.columns[0]?.cells.cht?.spoken).toBe('Engine 1 CHT, no value');
  });

  it('says above the redline for an RPM past it', () => {
    const model = enginesPage(
      reader({ ...PISTON, [GAUGES.rpm.name]: sixteen(2800) }),
      DEFAULT_UNITS,
    );
    expect(model.columns[0]?.dial?.tone).toBe('redline');
    expect(model.columns[0]?.dial?.spoken).toBe('Engine 1 RPM 2,800, above the redline');
  });

  it('draws a turboprop twin with a TRQ dial and NG', () => {
    const model = enginesPage(
      reader({ ...PISTON, [ENGINE_CONFIG.count]: 2, [ENGINE_CONFIG.type]: sixteen(9, 9) }),
      DEFAULT_UNITS,
    );
    expect(model.columns.map((column) => column.dial?.id)).toEqual(['trq', 'trq']);
    expect(model.rows.map((row) => row.label)).toEqual([
      'ITT °C',
      'PROP',
      'NG %',
      'FF KG/H',
      'OIL P PSI',
      'OIL T °C',
    ]);
  });

  it('draws four jets, and says engines 5 and up are not shown', () => {
    const model = enginesPage(
      reader({
        ...PISTON,
        [ENGINE_CONFIG.count]: 6,
        [ENGINE_CONFIG.type]: sixteen(7, 7, 7, 7, 7, 7),
      }),
      DEFAULT_UNITS,
    );
    expect(model.columns).toHaveLength(4);
    expect(model.hidden).toBe(2);
    expect(model.rows.map((row) => row.id)).toEqual(['egt', 'n2', 'ff', 'oilP', 'oilT', 'epr']);
  });

  it('lists mixed engines with engine 1 rows first, then the others, empty where unused', () => {
    const model = enginesPage(
      reader({ ...PISTON, [ENGINE_CONFIG.count]: 2, [ENGINE_CONFIG.type]: sixteen(1, 5) }),
      DEFAULT_UNITS,
    );
    expect(model.rows.map((row) => row.id)).toEqual([
      'map',
      'ff',
      'egt',
      'cht',
      'oilP',
      'oilT',
      'epr',
    ]);
    expect(model.columns[1]?.cells.map).toBeUndefined();
    expect(model.columns[1]?.cells.epr?.legend).toBe('EPR');
  });

  it('marks a missing gauge DataRef unavailable and draws the rest (R6)', () => {
    const model = enginesPage(reader(PISTON, [GAUGES.cht.name, GAUGES.rpm.name]), DEFAULT_UNITS);
    expect(model.missing).toEqual(['RPM', 'CHT']);
    expect(model.columns[0]?.dial).toBeNull();
    expect(model.rows.map((row) => row.id)).not.toContain('cht');
    expect(model.rows).toHaveLength(5);
  });

  it('is unidentified without the count or the type, waiting before the count arrives', () => {
    expect(enginesPage(reader(PISTON, [ENGINE_CONFIG.count]), DEFAULT_UNITS).status).toBe(
      'unidentified',
    );
    expect(enginesPage(reader(PISTON, [ENGINE_CONFIG.type]), DEFAULT_UNITS).status).toBe(
      'unidentified',
    );
    expect(
      enginesPage(reader({ ...PISTON, [ENGINE_CONFIG.count]: Number.NaN }), DEFAULT_UNITS).status,
    ).toBe('waiting');
    expect(
      enginesPage(reader({ ...PISTON, [ENGINE_CONFIG.count]: 1.5 }), DEFAULT_UNITS).status,
    ).toBe('unidentified');
  });

  it('says a glider has no engines (Review Focus 1)', () => {
    const model = enginesPage(reader({ ...PISTON, [ENGINE_CONFIG.count]: 0 }), DEFAULT_UNITS);
    expect(model.status).toBe('none');
    expect(model.columns).toEqual([]);
  });

  it('marks an engine whose type is short or garbage unsupported, and draws the others (Review Focus 2)', () => {
    const model = enginesPage(
      reader({ ...PISTON, [ENGINE_CONFIG.count]: 3, [ENGINE_CONFIG.type]: [1, 6] }),
      DEFAULT_UNITS,
    );
    expect(model.unsupported).toEqual([2, 3]);
    expect(model.columns[0]?.dial?.id).toBe('rpm');
    expect(model.columns[1]?.dial).toBeNull();
    expect(model.columns[1]?.cells).toEqual({});
  });

  it('shows a non-finite value as a dash with no pointer (Review Focus 3)', () => {
    const model = enginesPage(
      reader({ ...PISTON, [GAUGES.oilP.name]: sixteen(Number.POSITIVE_INFINITY) }),
      DEFAULT_UNITS,
    );
    expect(model.columns[0]?.cells.oilP?.text).toBe('—');
    expect(model.columns[0]?.cells.oilP?.value).toBeNull();
  });

  it('lists temperatures whose unit the aircraft does not publish, labelled with a bare degree', () => {
    const model = enginesPage(reader(PISTON, [ENGINE_CONFIG.egtIsCelsius]), DEFAULT_UNITS);
    expect(model.unknownUnits).toEqual(['egt']);
    expect(model.rows.find((row) => row.id === 'egt')?.label).toBe('EGT °');
    expect(model.columns[0]?.cells.egt?.text).toBe('1,320');
  });
});
