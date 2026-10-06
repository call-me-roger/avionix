import React from 'react';
import { View } from 'react-native';

import { sixPackLayout } from '@/domain/instruments/geometry';
import { AirspeedDial } from '@/features/panels/instruments/six-pack/AirspeedDial';
import { AltimeterDial } from '@/features/panels/instruments/six-pack/AltimeterDial';
import { AttitudeIndicator } from '@/features/panels/instruments/six-pack/AttitudeIndicator';
import { HeadingIndicator } from '@/features/panels/instruments/six-pack/HeadingIndicator';
import { TurnCoordinator } from '@/features/panels/instruments/six-pack/TurnCoordinator';
import { VsiDial } from '@/features/panels/instruments/six-pack/VsiDial';
import { useAutopilotTargets } from '@/features/panels/instruments/useAutopilotTargets';
import { useInstrumentValues } from '@/features/panels/instruments/useInstrumentValues';
import { useTheme } from '@/theme/theme-context';

/**
 * The classic T in landscape (airspeed, attitude, altimeter / turn, heading, vertical speed). In
 * portrait's two columns the pairs stay related: speed beside attitude, the two vertical
 * instruments together, the two lateral ones together. The directional gyro carries the autopilot's
 * heading bug; the other gauges show no autopilot target.
 */
export function SixPackView({
  contentWidth,
  windowHeight,
  landscape,
}: {
  contentWidth: number;
  windowHeight: number;
  landscape: boolean;
}) {
  const gap = useTheme().spacing.sm;
  const { size } = sixPackLayout(contentWidth, windowHeight, landscape, gap);
  const v = useInstrumentValues();
  const { heading: headingBug } = useAutopilotTargets();
  const airspeed = (
    <AirspeedDial key="airspeed" size={size} {...v.airspeed} markings={v.markings} />
  );
  const attitude = <AttitudeIndicator key="attitude" size={size} {...v.attitude} />;
  const altitude = (
    <AltimeterDial
      key="altitude"
      size={size}
      status={v.altitude.status}
      feet={v.altitude.feet}
      baroShort={v.altitude.baroShort}
      baroWords={v.altitude.baroWords}
      radioAltitude={v.altitude.radioAltitude}
    />
  );
  const turn = <TurnCoordinator key="turn" size={size} {...v.turn} />;
  const heading = <HeadingIndicator key="heading" size={size} {...v.heading} bug={headingBug} />;
  const verticalSpeed = <VsiDial key="vertical-speed" size={size} {...v.verticalSpeed} />;
  const order = landscape
    ? [airspeed, attitude, altitude, turn, heading, verticalSpeed]
    : [airspeed, attitude, altitude, verticalSpeed, turn, heading];
  return (
    <View
      testID="six-pack"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap, justifyContent: 'center' }}
    >
      {order}
    </View>
  );
}
