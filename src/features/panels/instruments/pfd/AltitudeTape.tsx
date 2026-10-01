import React from 'react';
import { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { roundAltitude, tapeTicks } from '@/domain/instruments/geometry';
import {
  type InstrumentStatus,
  describeAltitude,
  groupThousands,
  withStatus,
} from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 60, height: 240 };
const CY = 120;
/** 0.3 units a foot: the tape shows ±400 ft around the readout. */
const PX = 0.3;

/**
 * The altimeter setting is read aloud here and shown in the box below the tape; radio altitude is
 * read aloud here and shown on the attitude display, where airliner PFDs put it. The readout box spans x 1 to 59 so both its side strokes stay inside the
 * tape.
 */
export const AltitudeTape = React.memo(function AltitudeTape({
  width,
  height,
  status,
  feet,
  baroWords,
  radioAltitude,
}: {
  width: number;
  height: number;
  status: InstrumentStatus;
  feet: number | null;
  baroWords: string | null;
  radioAltitude: number | null;
}) {
  const ink = useTheme().instrument;
  const label = withStatus('Altitude', status, () =>
    describeAltitude(feet ?? 0, baroWords, radioAltitude),
  );
  const y = (value: number) => CY - (value - (feet ?? 0)) * PX;
  return (
    <InstrumentFace
      testID="instrument-altitude"
      label={label}
      status={status}
      width={width}
      height={height}
      viewBox={VB}
      scale={<Rect x={0} y={0} width={VB.width} height={VB.height} fill={ink.tape} />}
    >
      {feet === null ? null : (
        <>
          {tapeTicks(feet, 400, 100, 200).map((tick) => (
            <G key={tick.value}>
              <Line
                x1={0}
                y1={y(tick.value)}
                x2={tick.labelled ? 12 : 8}
                y2={y(tick.value)}
                stroke={ink.marking}
                strokeWidth={2}
              />
              {tick.labelled ? (
                <SvgText
                  x={14}
                  y={y(tick.value) + 5}
                  fontSize={14}
                  fill={ink.marking}
                  textAnchor="start"
                >
                  {groupThousands(tick.value)}
                </SvgText>
              ) : null}
            </G>
          ))}
          <Rect
            x={1}
            y={CY - 14}
            width={58}
            height={28}
            fill={ink.face}
            stroke={ink.marking}
            strokeWidth={1.5}
          />
          <SvgText
            x={57}
            y={CY + 6}
            fontSize={16}
            fontWeight="bold"
            fill={ink.marking}
            textAnchor="end"
          >
            {groupThousands(roundAltitude(feet))}
          </SvgText>
        </>
      )}
    </InstrumentFace>
  );
});
