import React from 'react';
import { G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { headingText, headingTickLabel, headingTicks } from '@/domain/instruments/geometry';
import { type InstrumentStatus, describeHeading, withStatus } from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { DigitalWindow } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 40 };
const CX = 100;
/** The tape shows ±30° around the lubber line. */
const PX = 100 / 30;
// The readout's box is 22 tall: centred at 12 it spans y 1 to 23, its stroke inside the tape.
const READOUT_Y = 12;

export const HeadingTape = React.memo(function HeadingTape({
  width,
  height,
  status,
  degrees,
}: {
  width: number;
  height: number;
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
      width={width}
      height={height}
      viewBox={VB}
      scale={<Rect x={0} y={0} width={VB.width} height={VB.height} fill={ink.tape} />}
    >
      {degrees === null ? null : (
        <>
          {headingTicks(degrees, 30).map((tick) => {
            const x = CX + tick.offset * PX;
            return (
              <G key={tick.value}>
                <Line
                  x1={x}
                  y1={40}
                  x2={x}
                  y2={tick.labelled ? 32 : 36}
                  stroke={ink.marking}
                  strokeWidth={2}
                />
                {tick.labelled ? (
                  <SvgText x={x} y={30} fontSize={14} fill={ink.marking} textAnchor="middle">
                    {headingTickLabel(tick.value)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
          {/* The readout covers the labels passing behind it; the lubber line is drawn last. */}
          <DigitalWindow
            x={CX}
            y={READOUT_Y}
            width={48}
            text={headingText(degrees)}
            fontSize={14}
          />
          <Polygon points="100,32 95,40 105,40" fill={ink.pointer} />
        </>
      )}
    </InstrumentFace>
  );
});
