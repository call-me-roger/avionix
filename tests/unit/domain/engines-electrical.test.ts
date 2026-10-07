import { ELECTRICAL } from '@/domain/engines/catalogue';
import type { EngineReader } from '@/domain/engines/engine-page';
import { electricalPage } from '@/domain/engines/electrical';

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

const VALUES: Values = {
  [ELECTRICAL.busCount]: 2,
  [ELECTRICAL.batteryCount]: 1,
  [ELECTRICAL.busVolts]: [28.14, 27.9, 0, 0, 0, 0],
  [ELECTRICAL.busAmps]: [12.4, 3, 0, 0, 0, 0],
  [ELECTRICAL.batteryVolts]: [24.3, 0, 0, 0, 0, 0, 0, 0],
  [ELECTRICAL.batteryAmps]: [-4.2, 0, 0, 0, 0, 0, 0, 0],
  [ELECTRICAL.generatorAmps]: [30, 28, 0, 0, 0, 0, 0, 0],
};

describe('electrical rows (spec §4.8)', () => {
  it('draws the buses, batteries and one generator per engine', () => {
    const model = electricalPage(reader(VALUES), 2);
    expect(model.buses).toEqual([
      {
        key: 'bus-1',
        label: 'BUS 1',
        volts: '28.1',
        amps: '12',
        spoken: 'Bus 1, 28.1 volts, 12 amps',
      },
      {
        key: 'bus-2',
        label: 'BUS 2',
        volts: '27.9',
        amps: '3',
        spoken: 'Bus 2, 27.9 volts, 3 amps',
      },
    ]);
    expect(model.batteries).toEqual([
      {
        key: 'batt-1',
        label: 'BATT 1',
        volts: '24.3',
        amps: '−4',
        spoken: 'Battery 1, 24.3 volts, minus 4 amps',
      },
    ]);
    expect(model.generators.map((row) => [row.label, row.volts, row.amps, row.spoken])).toEqual([
      ['GEN 1', null, '30', 'Generator 1, 30 amps'],
      ['GEN 2', null, '28', 'Generator 2, 28 amps'],
    ]);
    expect(model.missing).toEqual([]);
  });

  it('shows the first entry only without a count, and none for a count of 0', () => {
    const model = electricalPage(reader(VALUES, [ELECTRICAL.busCount]), 1);
    expect(model.buses).toHaveLength(1);
    expect(
      electricalPage(reader({ ...VALUES, [ELECTRICAL.batteryCount]: 0 }), 1).batteries,
    ).toEqual([]);
  });

  it('has no generator rows on a glider, and one when the engine count is unknown', () => {
    expect(electricalPage(reader(VALUES), 0).generators).toEqual([]);
    expect(electricalPage(reader(VALUES), null).generators).toHaveLength(1);
  });

  it('drops a column whose DataRef is missing, and a group with neither', () => {
    const noVolts = electricalPage(reader(VALUES, [ELECTRICAL.busVolts]), 1);
    expect(noVolts.buses[0]).toEqual({
      key: 'bus-1',
      label: 'BUS 1',
      volts: null,
      amps: '12',
      spoken: 'Bus 1, 12 amps',
    });
    const noBattery = electricalPage(
      reader(VALUES, [ELECTRICAL.batteryVolts, ELECTRICAL.batteryAmps, ELECTRICAL.generatorAmps]),
      1,
    );
    expect(noBattery.batteries).toEqual([]);
    expect(noBattery.generators).toEqual([]);
    expect(noBattery.missing).toEqual(['BATT', 'GEN']);
  });

  it('shows a reading that has not arrived as a dash', () => {
    const model = electricalPage(reader({ ...VALUES, [ELECTRICAL.busVolts]: [] }), 1);
    expect(model.buses[0]?.volts).toBe('—');
    expect(model.buses[0]?.spoken).toBe('Bus 1, no voltage reading, 12 amps');
  });
});
