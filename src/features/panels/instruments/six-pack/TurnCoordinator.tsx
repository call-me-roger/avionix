import React from 'react';
import { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import {
  STANDARD_RATE_DEFLECTION_DEG,
  polar,
  slipOffset,
  turnDeflection,
} from '@/domain/instruments/geometry';
import { type InstrumentStatus, describeTurn, withStatus } from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { useSvgFonts } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 200 };
const C = 100;
const MARKS = [90, 270, 90 + STANDARD_RATE_DEFLECTION_DEG, 270 - STANDARD_RATE_DEFLECTION_DEG];
// L and R sit just below the standard-rate marks, beyond the wing tips' reach, so a standard-rate
// turn never hides the letter it points at.
const LETTER_OFFSET_DEG = 18;
const LETTER_RADIUS = 80;
const left = polar(C, C, LETTER_RADIUS, 270 - STANDARD_RATE_DEFLECTION_DEG - LETTER_OFFSET_DEG);
const right = polar(C, C, LETTER_RADIUS, 90 + STANDARD_RATE_DEFLECTION_DEG + LETTER_OFFSET_DEG);

/**
 * Turn and slip share this face. Either part may be absent: the missing one is simply not drawn,
 * never shown at a centred default (R9).
 */
export const TurnCoordinator = React.memo(function TurnCoordinator({
  size,
  status,
  rate,
  slip,
}: {
  size: number;
  status: InstrumentStatus;
  rate: number | null;
  slip: number | null;
}) {
  const ink = useTheme().instrument;
  const { letters } = useSvgFonts();
  const label = withStatus('Turn', status, () => describeTurn(rate, slip));
  const scale = (
    <>
      <Circle cx={C} cy={C} r={98} fill={ink.face} />
      {MARKS.map((deg) => {
        const outer = polar(C, C, 94, deg);
        const inner = polar(C, C, 80, deg);
        return (
          <Line
            key={deg}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            stroke={ink.marking}
            strokeWidth={3}
          />
        );
      })}
      <SvgText
        x={left.x}
        y={left.y + 5}
        fontSize={14}
        fill={ink.marking}
        textAnchor="middle"
        {...letters}
      >
        L
      </SvgText>
      <SvgText
        x={right.x}
        y={right.y + 5}
        fontSize={14}
        fill={ink.marking}
        textAnchor="middle"
        {...letters}
      >
        R
      </SvgText>
      <SvgText x={C} y={188} fontSize={14} fill={ink.marking} textAnchor="middle" {...letters}>
        2 MIN
      </SvgText>
      <Rect
        x={62}
        y={138}
        width={76}
        height={22}
        rx={11}
        stroke={ink.marking}
        strokeWidth={2}
        fill="none"
      />
      <Line x1={89} y1={138} x2={89} y2={160} stroke={ink.marking} strokeWidth={2} />
      <Line x1={111} y1={138} x2={111} y2={160} stroke={ink.marking} strokeWidth={2} />
    </>
  );
  return (
    <InstrumentFace
      testID="instrument-turn"
      label={label}
      status={status}
      width={size}
      height={size}
      viewBox={VB}
      scale={scale}
    >
      {rate === null ? null : (
        <G transform={`rotate(${turnDeflection(rate)} ${C} ${C})`}>
          <Line
            x1={30}
            y1={C}
            x2={170}
            y2={C}
            stroke={ink.marking}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Circle cx={C} cy={C} r={10} fill={ink.marking} />
          <Line x1={C} y1={90} x2={C} y2={76} stroke={ink.marking} strokeWidth={4} />
        </G>
      )}
      {slip === null ? null : (
        <Circle cx={C + slipOffset(slip, 27)} cy={149} r={9} fill={ink.marking} />
      )}
    </InstrumentFace>
  );
});
