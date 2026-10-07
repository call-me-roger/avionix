import { FUEL, GAUGES } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { fuelPage, tankNames, usedSlots } from '@/domain/engines/fuel';
import { formatFuel } from '@/domain/flight-data/format';
import { DEFAULT_UNITS } from '@/domain/units/units';

type Values = Record<string, number | number[]>;

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

const nine = (...first: number[]): number[] => [
  ...first,
  ...new Array<number>(9 - first.length).fill(0),
];

/** Two wing tanks of 42 kg, each half of a 370 lb (167.8 kg) capacity; one engine at 37.8 kg/h. */
const C172: Values = {
  [FUEL.perTank]: nine(42, 42),
  [FUEL.total]: 84,
  [FUEL.ratio]: nine(0.5, 0.5),
  [FUEL.count]: 9,
  [FUEL.capacity]: 370,
  [FUEL.side]: nine(-10, 10),
  [FUEL.used]: 12,
  [GAUGES.ff.name]: [0.0105, 0, 0, 0],
};

describe('fuel tanks (spec §4.7)', () => {
  it('uses the slots with a ratio above 0, below the slot count', () => {
    expect(usedSlots(reader(C172))).toEqual([0, 1]);
    expect(usedSlots(reader({ ...C172, [FUEL.ratio]: nine(0.3, 0, 0.4, 0.3) }))).toEqual([0, 2, 3]);
    expect(usedSlots(reader({ ...C172, [FUEL.count]: 1 }))).toEqual([0]);
  });

  it('falls back to the slot count without ratios, and to nothing without both', () => {
    expect(usedSlots(reader({ ...C172, [FUEL.count]: 3 }, [FUEL.ratio]))).toEqual([0, 1, 2]);
    expect(usedSlots(reader(C172, [FUEL.ratio, FUEL.count]))).toBeNull();
  });

  it('names tanks by side, numbering a shared side, and by number without positions', () => {
    expect(tankNames([0, 1], reader(C172))).toEqual(['LEFT', 'RIGHT']);
    expect(tankNames([0, 1, 2, 3], reader({ ...C172, [FUEL.side]: nine(-10, -4, 0, 10) }))).toEqual(
      ['LEFT 1', 'LEFT 2', 'CENTER', 'RIGHT'],
    );
    expect(tankNames([0, 1], reader(C172, [FUEL.side]))).toEqual(['TANK 1', 'TANK 2']);
  });

  it('shows each tank with its share of its capacity', () => {
    const model = fuelPage(reader(C172), DEFAULT_UNITS, 1);
    expect(model.unit).toBe('KG');
    expect(model.tanks?.map((tank) => [tank.name, tank.text])).toEqual([
      ['LEFT', '42'],
      ['RIGHT', '42'],
    ]);
    expect(model.tanks?.[0]?.fraction).toBeCloseTo(42 / (370 * 0.45359237 * 0.5), 6);
    expect(model.tanks?.[0]?.spoken).toBe('Left tank, 42 kilograms');
    expect(
      fuelPage(reader(C172, [FUEL.capacity]), DEFAULT_UNITS, 1).tanks?.[0]?.fraction,
    ).toBeNull();
  });

  it('has no tank list without per-tank fuel or slots', () => {
    expect(fuelPage(reader(C172, [FUEL.perTank]), DEFAULT_UNITS, 1).tanks).toBeNull();
    expect(fuelPage(reader(C172, [FUEL.ratio, FUEL.count]), DEFAULT_UNITS, 1).tanks).toBeNull();
  });
});

describe('fuel totalizer (spec §4.7)', () => {
  it('shows total, flow, used and endurance', () => {
    const model = fuelPage(reader(C172), DEFAULT_UNITS, 1);
    expect(model.total).toEqual({ text: '84', spoken: 'Total fuel 84 kilograms' });
    expect(model.flow).toEqual({ text: '37.8', spoken: 'Fuel flow 37.8 kilograms per hour' });
    expect(model.flowUnit).toBe('KG/H');
    expect(model.used).toEqual({ text: '12', spoken: 'Fuel used 12 kilograms' });
    // 84 kg at 37.8 kg/h is 2 h 13 min (133.3 minutes, rounded down).
    expect(model.endurance).toEqual({ text: '2:13', spoken: 'Endurance 2 hours 13 minutes' });
    expect(model.missing).toEqual([]);
  });

  it('shows no endurance at 1 kg/h or less, or without engines', () => {
    const idle = fuelPage(reader({ ...C172, [GAUGES.ff.name]: [0, 0, 0, 0] }), DEFAULT_UNITS, 1);
    expect(idle.endurance).toEqual({ text: '—', spoken: 'Endurance, not available' });
    expect(idle.flow.text).toBe('0.0');
    const glider = fuelPage(reader(C172), DEFAULT_UNITS, 0);
    expect(glider.flow).toEqual({ text: '—', spoken: 'Fuel flow, no value' });
    expect(fuelPage(reader(C172), DEFAULT_UNITS, null).endurance.text).toBe('—');
  });

  it('switches every fuel number to pounds together, and TOTAL agrees with the F-11 strip (Review Focus 5)', () => {
    const model = fuelPage(reader(C172), { ...DEFAULT_UNITS, fuel: 'lb' }, 1);
    expect(model.unit).toBe('LB');
    expect(model.flowUnit).toBe('LB/H');
    expect(model.tanks?.[0]?.text).toBe('93');
    expect(model.total?.text).toBe('185');
    expect(formatFuel(84, 'lb')).toBe(`${model.total?.text} lb`);
    expect(model.used?.spoken).toBe('Fuel used 26 pounds');
    expect(model.flow.text).toBe('83.3');
  });

  it('lists TOTAL and USED as unavailable when their DataRefs are missing', () => {
    const model = fuelPage(reader(C172, [FUEL.total, FUEL.used]), DEFAULT_UNITS, 1);
    expect(model.total).toBeNull();
    expect(model.used).toBeNull();
    expect(model.missing).toEqual(['TOTAL', 'USED']);
    expect(model.endurance.text).toBe('—');
  });

  it('shows a non-finite tank as a dash with no bar (Review Focus 3)', () => {
    const model = fuelPage(
      reader({ ...C172, [FUEL.perTank]: nine(Number.NaN, 42) }),
      DEFAULT_UNITS,
      1,
    );
    expect(model.tanks?.[0]?.text).toBe('—');
    expect(model.tanks?.[0]?.fraction).toBeNull();
    expect(model.tanks?.[0]?.spoken).toBe('Left tank, no value');
  });
});
