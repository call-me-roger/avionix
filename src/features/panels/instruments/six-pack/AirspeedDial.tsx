import React from 'react';
import { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import {
  airspeedAngle,
  airspeedDialMax,
  arcPath,
  polar,
  scaleTicks,
} from '@/domain/instruments/geometry';
import {
  type InstrumentStatus,
  describeAirspeed,
  machShown,
  withStatus,
} from '@/domain/instruments/labels';
import { type SpeedMarkings, speedBands } from '@/domain/instruments/speed-markings';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { ARC_COLOR, DigitalWindow } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 200 };
const C = 100;

export const AirspeedDial = React.memo(function AirspeedDial({
  size,
  status,
  knots,
  mach,
  markings,
}: {
  size: number;
  status: InstrumentStatus;
  knots: number | null;
  mach: number | null;
  markings: SpeedMarkings | null;
}) {
  const ink = useTheme().instrument;
  const max = airspeedDialMax(markings?.vne ?? null);
  const angle = (value: number) => airspeedAngle(value, max);
  const ticks = scaleTicks(0, max, 10, max <= 200 ? 20 : 40);
  const label = withStatus('Airspeed', status, () => describeAirspeed(knots ?? 0, mach));
  const redOuter = markings === null ? null : polar(C, C, 94, angle(markings.vne));
  const redInner = markings === null ? null : polar(C, C, 74, angle(markings.vne));
  const scale = (
    <>
      <Circle cx={C} cy={C} r={98} fill={ink.face} />
      {markings === null
        ? null
        : speedBands(markings).map((band) => (
            <Path
              key={band.color}
              d={arcPath(C, C, band.color === 'white' ? 78 : 86, angle(band.from), angle(band.to))}
              stroke={ink[ARC_COLOR[band.color]]}
              strokeWidth={6}
              fill="none"
            />
          ))}
      {redOuter === null || redInner === null ? null : (
        <Line
          x1={redInner.x}
          y1={redInner.y}
          x2={redOuter.x}
          y2={redOuter.y}
          stroke={ink.arcRed}
          strokeWidth={4}
        />
      )}
      {ticks.map((tick) => {
        const outer = polar(C, C, 94, angle(tick.value));
        const inner = polar(C, C, tick.major ? 82 : 88, angle(tick.value));
        return (
          <Line
            key={tick.value}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            stroke={ink.marking}
            strokeWidth={tick.major ? 2.5 : 1.5}
          />
        );
      })}
      {ticks
        .filter((tick) => tick.major)
        .map((tick) => {
          const at = polar(C, C, 66, angle(tick.value));
          return (
            <SvgText
              key={`label${tick.value}`}
              x={at.x}
              y={at.y + 5}
              fontSize={14}
              fill={ink.marking}
              textAnchor="middle"
            >
              {String(tick.value)}
            </SvgText>
          );
        })}
      <SvgText x={C} y={78} fontSize={14} fill={ink.marking} textAnchor="middle">
        KNOTS
      </SvgText>
    </>
  );
  return (
    <InstrumentFace
      testID="instrument-airspeed"
      label={label}
      status={status}
      width={size}
      height={size}
      viewBox={VB}
      scale={scale}
    >
      {knots === null ? null : (
        <>
          {/* Windows first: the pointers pass over them, as on a real dial. */}
          <DigitalWindow x={C} y={136} width={64} text={String(Math.round(knots))} />
          {machShown(mach) ? (
            <SvgText x={C} y={168} fontSize={14} fill={ink.marking} textAnchor="middle">
              {`M ${mach.toFixed(2)}`}
            </SvgText>
          ) : null}
          <G transform={`rotate(${angle(knots)} ${C} ${C})`}>
            <Line
              x1={C}
              y1={C + 14}
              x2={C}
              y2={14}
              stroke={ink.marking}
              strokeWidth={4}
              strokeLinecap="round"
            />
          </G>
          <Circle cx={C} cy={C} r={6} fill={ink.marking} />
        </>
      )}
    </InstrumentFace>
  );
});
