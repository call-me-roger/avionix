import React from 'react';
import { Rect } from 'react-native-svg';

import { type InstrumentStatus, describeAttitude, withStatus } from '@/domain/instruments/labels';
import { AttitudeScene } from '@/features/panels/instruments/AttitudeScene';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 240 };

/**
 * The attitude with the slip trapezoid under its roll pointer. Radio altitude is drawn over it by
 * the PFD, so it shows whether or not the attitude has a value.
 */
export const AttitudeDisplay = React.memo(function AttitudeDisplay({
  width,
  height,
  status,
  pitch,
  roll,
  slip,
}: {
  width: number;
  height: number;
  status: InstrumentStatus;
  pitch: number | null;
  roll: number | null;
  slip: number | null;
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
      )}
    </InstrumentFace>
  );
});
