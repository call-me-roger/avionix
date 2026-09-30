import React from 'react';
import { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { altimeterHands, polar, roundAltitude, scaleTicks } from '@/domain/instruments/geometry';
import {
  type InstrumentStatus,
  describeAltitude,
  groupThousands,
  radioAltitudeShown,
  withStatus,
} from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { DigitalWindow } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 200 };
const C = 100;
/** One turn of the hundreds hand is 1,000 ft; the 1,000 mark would repeat 0. */
const TICKS = scaleTicks(0, 1000, 20, 100).filter((tick) => tick.value < 1000);
const DEG_PER_FOOT = 0.36;
// The windows sit between the scale digits, never over one: the Kollsman window at three o'clock
// inside the 2 and the 3, where a real altimeter has it, and the altitude window above the 4, 5
// and 6.

export const AltimeterDial = React.memo(function AltimeterDial({
  size,
  status,
  feet,
  baroShort,
  baroWords,
  radioAltitude,
}: {
  size: number;
  status: InstrumentStatus;
  feet: number | null;
  baroShort: string | null;
  baroWords: string | null;
  radioAltitude: number | null;
}) {
  const ink = useTheme().instrument;
  const label = withStatus('Altitude', status, () =>
    describeAltitude(feet ?? 0, baroWords, radioAltitude),
  );
  const scale = (
    <>
      <Circle cx={C} cy={C} r={98} fill={ink.face} />
      {TICKS.map((tick) => {
        const deg = tick.value * DEG_PER_FOOT;
        const outer = polar(C, C, 94, deg);
        const inner = polar(C, C, 94 - (tick.major ? 12 : 6), deg);
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
      {TICKS.filter((tick) => tick.major).map((tick) => {
        const at = polar(C, C, 70, tick.value * DEG_PER_FOOT);
        return (
          <SvgText
            key={`label${tick.value}`}
            x={at.x}
            y={at.y + 6}
            fontSize={16}
            fontWeight="bold"
            fill={ink.marking}
            textAnchor="middle"
          >
            {String(tick.value / 100)}
          </SvgText>
        );
      })}
    </>
  );
  const hands = feet === null ? null : altimeterHands(feet);
  return (
    <InstrumentFace
      testID="instrument-altitude"
      label={label}
      status={status}
      width={size}
      height={size}
      viewBox={VB}
      scale={scale}
    >
      {feet === null || hands === null ? null : (
        <>
          <G transform={`rotate(${hands.thousandsDeg} ${C} ${C})`}>
            <Line
              x1={C}
              y1={110}
              x2={C}
              y2={48}
              stroke={ink.marking}
              strokeWidth={8}
              strokeLinecap="round"
            />
          </G>
          <G transform={`rotate(${hands.hundredsDeg} ${C} ${C})`}>
            <Line
              x1={C}
              y1={112}
              x2={C}
              y2={14}
              stroke={ink.marking}
              strokeWidth={3.5}
              strokeLinecap="round"
            />
          </G>
          <Circle cx={C} cy={C} r={6} fill={ink.marking} />
          <DigitalWindow x={C} y={134} width={84} text={groupThousands(roundAltitude(feet))} />
          {baroShort === null ? null : (
            <DigitalWindow x={134} y={C} width={48} text={baroShort} fontSize={14} />
          )}
          {radioAltitudeShown(radioAltitude) ? (
            <SvgText x={C} y={62} fontSize={14} fill={ink.marking} textAnchor="middle">
              {`RA ${Math.round(radioAltitude)}`}
            </SvgText>
          ) : null}
        </>
      )}
    </InstrumentFace>
  );
});
