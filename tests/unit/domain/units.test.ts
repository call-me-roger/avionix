import {
  DEFAULT_UNITS,
  DISTANCE_UNITS,
  FUEL_UNITS,
  TEMPERATURE_UNITS,
  UNIT_LABEL,
  convertDistance,
  convertFuel,
  convertTemperature,
} from '@/domain/units/units';

describe('units', () => {
  it('defaults to kilograms, Celsius and nautical miles', () => {
    expect(DEFAULT_UNITS).toEqual({
      fuel: 'kg',
      temperature: 'C',
      distance: 'nm',
      pressure: 'inHg',
    });
    expect(FUEL_UNITS).toEqual(['kg', 'lb']);
    expect(TEMPERATURE_UNITS).toEqual(['C', 'F']);
    expect(DISTANCE_UNITS).toEqual(['nm', 'km']);
  });

  it('defaults pressure to inches of mercury and labels both units', () => {
    expect(DEFAULT_UNITS.pressure).toBe('inHg');
    expect(UNIT_LABEL.pressure).toEqual({ inHg: 'inHg', hPa: 'hPa' });
  });

  it('converts fuel mass exactly', () => {
    expect(convertFuel(100, 'kg')).toBe(100);
    expect(convertFuel(0.45359237, 'lb')).toBeCloseTo(1, 10);
    expect(convertFuel(1000, 'lb')).toBeCloseTo(2204.62262, 4);
  });

  it('converts temperature', () => {
    expect(convertTemperature(-40, 'F')).toBeCloseTo(-40, 10);
    expect(convertTemperature(0, 'F')).toBe(32);
    expect(convertTemperature(100, 'F')).toBe(212);
    expect(convertTemperature(-12.3, 'C')).toBe(-12.3);
  });

  it('converts distance', () => {
    expect(convertDistance(1, 'km')).toBe(1.852);
    expect(convertDistance(126.4, 'nm')).toBe(126.4);
  });

  it('labels every unit', () => {
    expect(UNIT_LABEL.fuel).toEqual({ kg: 'kg', lb: 'lb' });
    expect(UNIT_LABEL.temperature).toEqual({ C: '°C', F: '°F' });
    expect(UNIT_LABEL.distance).toEqual({ nm: 'nm', km: 'km' });
  });
});
