import React from 'react';
import { Rect } from 'react-native-svg';

import {
  type InstrumentStatus,
  describeAttitude,
  radioAltitudeShown,
  withStatus,
} from '@/domain/instruments/labels';
import { AttitudeScene } from '@/features/panels/instruments/AttitudeScene';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { DigitalWindow } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 240 };

/**
 * The attitude with the slip trapezoid under its roll pointer, and radio altitude low in the
 * centre from 2,500 ft down. The radio altitude window is fixed, so it covers the ladder moving
 * behind it; it sits well below the aircraft symbol and the roll pointer.
 */
export const AttitudeDisplay = React.memo(function AttitudeDisplay({
  width,
  height,
  status,
  pitch,
  roll,
  slip,
  radioAltitude,
}: {
  width: number;
  height: number;
  status: InstrumentStatus;
  pitch: number | null;
  roll: number | null;
  slip: number | null;
  radioAltitude: number | null;
}) {
  const ink = useTheme().instrument;
  const label = withStatus('Attitude', status, () => describeAttitude(pitch ?? 0, roll ?? 0));
  return (
    <InstrumentFace
      testID="instrument-attitude"
      label={label}
      status={status}
      width={width}
      height={height}
      viewBox={VB}
      scale={<Rect x={0} y={0} width={VB.width} height={VB.height} fill={ink.face} />}
    >
      {pitch === null || roll === null ? null : (
        <>
          <AttitudeScene
            pitch={pitch}
            roll={roll}
            slip={slip}
            cx={100}
            cy={120}
            pxPerDeg={4.8}
            windowDeg={25}
            bankRadius={92}
            clip={{ kind: 'rect', width: VB.width, height: VB.height }}
          />
          {radioAltitudeShown(radioAltitude) ? (
            <DigitalWindow
              x={100}
              y={222}
              width={60}
              text={String(Math.round(radioAltitude))}
              fontSize={14}
            />
          ) : null}
        </>
      )}
    </InstrumentFace>
  );
});
