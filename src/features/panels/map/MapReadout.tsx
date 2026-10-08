import React from 'react';
import { View } from 'react-native';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { formatHeading, formatSpeed } from '@/domain/flight-data/format';
import { MAP_DATAREFS as M } from '@/domain/map/catalogue';
import { formatGpsAltitude, formatPosition } from '@/domain/map/map-format';
import { FlightValue } from '@/features/panels/flight-data/FlightValue';
import { one } from '@/features/panels/flight-data/useFlightValue';

/** Spec §4.5: the strip's own formatting, so the map and the strip never disagree. */
export function MapReadout() {
  return (
    <View testID="map-readout">
      <FlightValue
        label="Position"
        names={[M.latitude, M.longitude]}
        format={([lat = 0, lon = 0]) => formatPosition(lat, lon)}
      />
      <FlightValue label="GPS alt" names={[M.elevation]} format={one(formatGpsAltitude)} />
      <FlightValue label="Ground speed" names={[D.groundSpeed]} format={one(formatSpeed)} />
      <FlightValue label="Track (magnetic)" names={[D.groundTrack]} format={one(formatHeading)} />
    </View>
  );
}
