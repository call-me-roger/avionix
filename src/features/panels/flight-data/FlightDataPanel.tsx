import React from 'react';

import {
  FEATURE_FLIGHT_DATA,
  FEATURE_GPS_DESTINATION,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import {
  formatClock,
  formatFuel,
  formatHeading,
  formatSpeed,
  formatTemperature,
  formatWind,
} from '@/domain/flight-data/format';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { DestinationBlock } from '@/features/panels/flight-data/DestinationBlock';
import { FlightValue } from '@/features/panels/flight-data/FlightValue';
import { SimBadge } from '@/features/panels/flight-data/SimBadge';
import { useUnits } from '@/features/units/UnitsProvider';

export const FLIGHT_DATA_PANEL: PanelDescriptor = {
  id: 'flight-data',
  title: 'Flight data',
  features: [FEATURE_FLIGHT_DATA, FEATURE_GPS_DESTINATION],
  supports: EVERYWHERE,
};

const one = (format: (value: number) => string) => (values: readonly number[]) =>
  format(values[0] ?? 0);

/** F-11: the numbers no instrument shows. Read-only (R11): nothing here writes or activates. */
export function FlightDataPanel() {
  const { units } = useUnits();
  return (
    <>
      <SimBadge />
      <FlightValue label="Ground speed" names={[D.groundSpeed]} format={one(formatSpeed)} />
      <FlightValue label="True airspeed" names={[D.trueAirspeed]} format={one(formatSpeed)} />
      <FlightValue label="Track (magnetic)" names={[D.groundTrack]} format={one(formatHeading)} />
      <FlightValue
        label="Wind (from)"
        names={[D.windDirection, D.windSpeed]}
        format={([direction = 0, speed = 0]) => formatWind(direction, speed)}
      />
      <FlightValue
        label="Outside air temp"
        names={[D.outsideAirTemp]}
        format={one((c) => formatTemperature(c, units.temperature))}
      />
      <FlightValue
        label="Total air temp"
        names={[D.totalAirTemp]}
        format={one((c) => formatTemperature(c, units.temperature))}
      />
      <FlightValue
        label="Fuel remaining"
        names={[D.fuelTotal]}
        format={one((kg) => formatFuel(kg, units.fuel))}
      />
      <FlightValue label="Sim zulu" names={[D.zuluTime]} format={one(formatClock)} />
      <FlightValue label="Sim local" names={[D.localTime]} format={one(formatClock)} />
      <DestinationBlock />
    </>
  );
}
