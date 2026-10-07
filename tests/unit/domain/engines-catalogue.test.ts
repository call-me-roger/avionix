import {
  ELECTRICAL,
  ENGINE_CONFIG,
  ENGINES_FEATURES,
  FUEL,
  GAUGES,
  GAUGE_IDS,
  MARKING_NAMES,
  markingName,
} from '@/domain/engines/catalogue';
import { GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';
import { ENGINES } from '@/domain/systems/controls';

describe('the F-12 catalogue', () => {
  it('lists the four features in profile order', () => {
    expect(ENGINES_FEATURES).toEqual([
      'engine-gauges',
      'engine-markings',
      'fuel-quantity',
      'electrical-monitor',
    ]);
  });

  it('names the thirteen engine indicators by Laminar name (spec §3)', () => {
    expect(GAUGE_IDS.map((id) => GAUGES[id].name)).toEqual([
      'sim/cockpit2/engine/indicators/engine_speed_rpm',
      'sim/cockpit2/engine/indicators/prop_speed_rpm',
      'sim/cockpit2/engine/indicators/N1_percent',
      'sim/cockpit2/engine/indicators/N2_percent',
      'sim/cockpit2/engine/indicators/MPR_in_hg',
      'sim/cockpit2/engine/indicators/torque_n_mtr',
      'sim/cockpit2/engine/indicators/EPR_ratio',
      'sim/cockpit2/engine/indicators/EGT_deg_cel',
      'sim/cockpit2/engine/indicators/CHT_deg_cel',
      'sim/cockpit2/engine/indicators/ITT_deg_cel',
      'sim/cockpit2/engine/indicators/fuel_flow_kg_sec',
      'sim/cockpit2/engine/indicators/oil_pressure_psi',
      'sim/cockpit2/engine/indicators/oil_temperature_deg_C',
    ]);
  });

  it('reuses F-24 engine count and type, and F-11 fuel total', () => {
    expect(ENGINE_CONFIG.count).toBe(ENGINES.count);
    expect(ENGINE_CONFIG.type).toBe(ENGINES.type);
    expect(FUEL.total).toBe(GENERIC_DATAREFS.fuelTotal);
  });

  it('reads EGT, ITT and oil temperature units from flags, and CHT as Celsius', () => {
    expect(GAUGES.egt.temperature).toEqual({
      kind: 'flag',
      name: 'sim/aircraft/engine/acf_EGT_is_C',
    });
    expect(GAUGES.itt.temperature).toEqual({
      kind: 'flag',
      name: 'sim/aircraft/engine/acf_ITT_is_C',
    });
    expect(GAUGES.oilT.temperature).toEqual({
      kind: 'flag',
      name: 'sim/aircraft/engine/acf_oilT_is_C',
    });
    expect(GAUGES.cht.temperature).toEqual({ kind: 'celsius' });
    expect(GAUGES.rpm.temperature).toBeNull();
  });

  it('builds the 60 marking names, ten instruments by three colours by two edges', () => {
    expect(MARKING_NAMES).toHaveLength(60);
    expect(new Set(MARKING_NAMES).size).toBe(60);
    expect(markingName('yellow', 'hi', 'TRQ')).toBe('sim/aircraft/limits/yellow_hi_TRQ');
    expect(MARKING_NAMES[0]).toBe('sim/aircraft/limits/green_lo_MP');
    expect(MARKING_NAMES[59]).toBe('sim/aircraft/limits/red_hi_oilP');
  });

  it('marks RPM, PROP and FF as having no aircraft markings', () => {
    expect(GAUGES.rpm.marking).toBeNull();
    expect(GAUGES.prop.marking).toBeNull();
    expect(GAUGES.ff.marking).toBeNull();
    expect(GAUGES.map.marking).toBe('MP');
    expect(GAUGES.oilT.marking).toBe('oilT');
  });

  it('names the fuel and electrical DataRefs (spec §3)', () => {
    expect(Object.values(FUEL)).toEqual([
      'sim/flightmodel/weight/m_fuel',
      'sim/flightmodel/weight/m_fuel_total',
      'sim/aircraft/overflow/acf_tank_rat',
      'sim/aircraft/overflow/acf_num_tanks',
      'sim/aircraft/weight/acf_m_fuel_tot',
      'sim/aircraft/overflow/acf_tank_X',
      'sim/cockpit2/fuel/fuel_totalizer_sum_kg',
    ]);
    expect(Object.values(ELECTRICAL)).toEqual([
      'sim/aircraft/electrical/num_buses',
      'sim/aircraft/electrical/num_batteries',
      'sim/cockpit2/electrical/bus_volts',
      'sim/cockpit2/electrical/bus_load_amps',
      'sim/cockpit2/electrical/battery_voltage_indicated_volts',
      'sim/cockpit2/electrical/battery_amps',
      'sim/cockpit2/electrical/generator_amps',
    ]);
  });
});
