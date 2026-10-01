import React from 'react';
import { Line, Rect } from 'react-native-svg';

import { STANDARD_RATE_DEFLECTION_DEG, turnDeflection } from '@/domain/instruments/geometry';
import { type InstrumentStatus, describeTurn, withStatus } from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 20 };
const CX = 100;
const PX_PER_DEG = 2;
const MARKS = [
  CX,
  CX - STANDARD_RATE_DEFLECTION_DEG * PX_PER_DEG,
  CX + STANDARD_RATE_DEFLECTION_DEG * PX_PER_DEG,
];

/**
 * Turn rate as a bar from the centre; the standard-rate marks stand either side. The PFD's ball is
 * the slip trapezoid under the roll pointer, drawn by the attitude display — but this scale still
 * carries the slip in its label, so a screen-reader user hears the turn exactly as on the six-pack.
 */
export const TurnRateScale = React.memo(function TurnRateScale({
  width,
  height,
  status,
  rate,
  slip,
}: {
  width: number;
  height: number;
  status: InstrumentStatus;
  rate: number | null;
  slip: number | null;
}) {
  const ink = useTheme().instrument;
  const label = withStatus('Turn', status, () => describeTurn(rate, slip));
  const scale = (
    <>
      <Rect x={0} y={0} width={VB.width} height={VB.height} fill={ink.tape} />
      {MARKS.map((x) => (
        <Line key={x} x1={x} y1={2} x2={x} y2={18} stroke={ink.marking} strokeWidth={2} />
      ))}
    </>
  );
  const end = rate === null ? CX : CX + turnDeflection(rate) * PX_PER_DEG;
  return (
    <InstrumentFace
      testID="instrument-turn"
      label={label}
      status={status}
      width={width}
      height={height}
      viewBox={VB}
      scale={scale}
    >
      {rate === null ? null : (
        <Rect
          x={Math.min(CX, end)}
          y={7}
          width={Math.abs(end - CX)}
          height={6}
          fill={ink.pointer}
        />
      )}
    </InstrumentFace>
  );
});
