import React from 'react';
import { Circle } from 'react-native-svg';

import { type InstrumentStatus, describeAttitude, withStatus } from '@/domain/instruments/labels';
import { AttitudeScene } from '@/features/panels/instruments/AttitudeScene';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 200 };
const C = 100;

export const AttitudeIndicator = React.memo(function AttitudeIndicator({
  size,
  status,
  pitch,
  roll,
}: {
  size: number;
  status: InstrumentStatus;
  pitch: number | null;
  roll: number | null;
}) {
  const ink = useTheme().instrument;
  const label = withStatus('Attitude', status, () => describeAttitude(pitch ?? 0, roll ?? 0));
  return (
    <InstrumentFace
      testID="instrument-attitude"
      label={label}
      status={status}
      width={size}
      height={size}
      viewBox={VB}
      scale={<Circle cx={C} cy={C} r={98} fill={ink.face} />}
    >
      {pitch === null || roll === null ? null : (
        <AttitudeScene
          pitch={pitch}
          roll={roll}
          slip={null}
          cx={C}
          cy={C}
          pxPerDeg={4.5}
          windowDeg={20}
          bankRadius={88}
          clip={{ kind: 'circle', r: 96 }}
        />
      )}
    </InstrumentFace>
  );
});
