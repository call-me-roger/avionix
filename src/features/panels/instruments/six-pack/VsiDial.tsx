import React from 'react';
import { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { polar, roundVerticalSpeed, scaleTicks, vsiAngle } from '@/domain/instruments/geometry';
import {
  type InstrumentStatus,
  describeVerticalSpeed,
  groupThousands,
  withStatus,
} from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { DigitalWindow } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 200 };
const C = 100;
const TICKS = scaleTicks(-2000, 2000, 100, 500);
// Between the hub and the two "2" labels at three o'clock, covering neither; wide enough for
// "-1,200" at 14.
const WINDOW_X = 132;
const WINDOW_WIDTH = 48;

/** The dial's labels are thousands of ft/min either way: 500 is ".5", 1,500 is "1.5". */
function thousands(value: number): string {
  return String(Math.abs(value) / 1000).replace(/^0\./, '.');
}

export const VsiDial = React.memo(function VsiDial({
  size,
  status,
  fpm,
}: {
  size: number;
  status: InstrumentStatus;
  fpm: number | null;
}) {
  const ink = useTheme().instrument;
  const label = withStatus('Vertical speed', status, () => describeVerticalSpeed(fpm ?? 0));
  const scale = (
    <>
      <Circle cx={C} cy={C} r={98} fill={ink.face} />
      {TICKS.map((tick) => {
        const outer = polar(C, C, 94, vsiAngle(tick.value));
        const inner = polar(C, C, 94 - (tick.major ? 12 : 6), vsiAngle(tick.value));
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
        const at = polar(C, C, 68, vsiAngle(tick.value));
        return (
          <SvgText
            key={`label${tick.value}`}
            x={at.x}
            y={at.y + 5}
            fontSize={14}
            fill={ink.marking}
            textAnchor="middle"
          >
            {thousands(tick.value)}
          </SvgText>
        );
      })}
      <SvgText x={70} y={64} fontSize={14} fill={ink.marking} textAnchor="middle">
        UP
      </SvgText>
      <SvgText x={70} y={146} fontSize={14} fill={ink.marking} textAnchor="middle">
        DN
      </SvgText>
    </>
  );
  return (
    <InstrumentFace
      testID="instrument-vertical-speed"
      label={label}
      status={status}
      width={size}
      height={size}
      viewBox={VB}
      scale={scale}
    >
      {fpm === null ? null : (
        <>
          {/* Windows first: the pointers pass over them, as on a real dial. */}
          <DigitalWindow
            x={WINDOW_X}
            y={C}
            width={WINDOW_WIDTH}
            text={groupThousands(roundVerticalSpeed(fpm))}
            fontSize={14}
          />
          <G transform={`rotate(${vsiAngle(fpm)} ${C} ${C})`}>
            <Line
              x1={C}
              y1={112}
              x2={C}
              y2={16}
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
