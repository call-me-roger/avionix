import React from 'react';
import { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

import {
  headingCardRotation,
  headingText,
  headingTickLabel,
  polar,
  scaleTicks,
} from '@/domain/instruments/geometry';
import { type InstrumentStatus, describeHeading, withStatus } from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { DigitalWindow } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 200 };
const C = 100;
const CARD_TICKS = scaleTicks(0, 355, 5, 10);
const CARD_LABELS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

/**
 * The card turns under a fixed lubber line, so the whole card is a child: with no heading there is
 * no card orientation to show, and a card drawn at north would be a default in the value's place.
 */
export const HeadingIndicator = React.memo(function HeadingIndicator({
  size,
  status,
  degrees,
}: {
  size: number;
  status: InstrumentStatus;
  degrees: number | null;
}) {
  const ink = useTheme().instrument;
  const label = withStatus('Heading', status, () => describeHeading(degrees ?? 0));
  return (
    <InstrumentFace
      testID="instrument-heading"
      label={label}
      status={status}
      width={size}
      height={size}
      viewBox={VB}
      scale={<Circle cx={C} cy={C} r={98} fill={ink.face} />}
    >
      {degrees === null ? null : (
        <>
          <G transform={`rotate(${headingCardRotation(degrees)} ${C} ${C})`}>
            {CARD_TICKS.map((tick) => {
              const outer = polar(C, C, 94, tick.value);
              const inner = polar(C, C, tick.major ? 82 : 88, tick.value);
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
            {CARD_LABELS.map((deg) => (
              <SvgText
                key={deg}
                x={C}
                y={36}
                fontSize={16}
                fontWeight="bold"
                fill={ink.marking}
                textAnchor="middle"
                transform={`rotate(${deg} ${C} ${C})`}
              >
                {headingTickLabel(deg)}
              </SvgText>
            ))}
          </G>
          <Polygon points="100,4 94,16 106,16" fill={ink.pointer} />
          <Line x1={C} y1={78} x2={C} y2={122} stroke={ink.pointer} strokeWidth={4} />
          <Line x1={80} y1={94} x2={120} y2={94} stroke={ink.pointer} strokeWidth={4} />
          <DigitalWindow x={C} y={150} width={56} text={headingText(degrees)} fontSize={16} />
        </>
      )}
    </InstrumentFace>
  );
});
