import React from 'react';

import type { DistanceUnit, FuelUnit, PressureUnit, TemperatureUnit } from '@/domain/units/units';
import { useUnits } from '@/features/units/UnitsProvider';
import { RadioChips } from '@/theme/RadioChips';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';

const FUEL: { value: FuelUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'kg', label: 'kg', accessibilityLabel: 'Fuel in kilograms' },
  { value: 'lb', label: 'lb', accessibilityLabel: 'Fuel in pounds' },
];
const TEMPERATURE: { value: TemperatureUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'C', label: '°C', accessibilityLabel: 'Temperature in Celsius' },
  { value: 'F', label: '°F', accessibilityLabel: 'Temperature in Fahrenheit' },
];
const DISTANCE: { value: DistanceUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'nm', label: 'nm', accessibilityLabel: 'Distance in nautical miles' },
  { value: 'km', label: 'km', accessibilityLabel: 'Distance in kilometres' },
];
const PRESSURE: { value: PressureUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'inHg', label: 'inHg', accessibilityLabel: 'Pressure in inches of mercury' },
  { value: 'hPa', label: 'hPa', accessibilityLabel: 'Pressure in hectopascals' },
];

/** Speeds stay in knots and directions in degrees, as on every pilot-facing instrument. */
export function UnitsSection() {
  const { units, setUnit } = useUnits();
  return (
    <Section>
      <SectionTitle>Units</SectionTitle>
      <BodyText>Fuel</BodyText>
      <RadioChips
        options={FUEL}
        selected={units.fuel}
        onSelect={(value) => setUnit('fuel', value)}
        accessibilityLabel="Fuel unit"
      />
      <BodyText>Temperature</BodyText>
      <RadioChips
        options={TEMPERATURE}
        selected={units.temperature}
        onSelect={(value) => setUnit('temperature', value)}
        accessibilityLabel="Temperature unit"
      />
      <BodyText>Distance</BodyText>
      <RadioChips
        options={DISTANCE}
        selected={units.distance}
        onSelect={(value) => setUnit('distance', value)}
        accessibilityLabel="Distance unit"
      />
      <BodyText>Altimeter setting</BodyText>
      <RadioChips
        options={PRESSURE}
        selected={units.pressure}
        onSelect={(value) => setUnit('pressure', value)}
        accessibilityLabel="Pressure unit"
      />
    </Section>
  );
}
