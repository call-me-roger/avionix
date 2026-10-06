import React from 'react';
import { G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { roundAltitude, tapeTicks } from '@/domain/instruments/geometry';
import {
  type InstrumentStatus,
  describeAltitude,
  groupThousands,
  withStatus,
} from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { tapeBugPoints, tapeTargetY, useSvgFonts } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 60, height: 240 };
const CY = 120;
/** 0.3 units a foot: the tape shows ±400 ft around the readout. */
const PX = 0.3;
/** The selected-altitude box across the top of the tape; a bug above the scale parks half under it. */
const SELECTED_HEIGHT = 20;

/**
 * The altimeter setting is read aloud here and shown in the box below the tape; radio altitude is
 * read aloud here and shown on the attitude display, where airliner PFDs put it. The readout box spans x 1 to 59 so both its side strokes stay inside the
 * tape. The selected altitude is always shown while X-Plane reports one, as the G1000 does: a cyan
 * box at the top and a cyan bug on the tape's left edge. Off the scale the bug parks half-visible:
 * half under the box above, half off the tape's bottom edge below. It is drawn after the readout
 * so it stays visible on capture, and before the box so a bug parked above sits half under it.
 */
export const AltitudeTape = React.memo(function AltitudeTape({
  width,
  height,
  status,
  feet,
  baroWords,
  radioAltitude,
  selected,
}: {
  width: number;
  height: number;
  status: InstrumentStatus;
  feet: number | null;
  baroWords: string | null;
  radioAltitude: number | null;
  /** The autopilot's selected altitude, ft. */
  selected: number | null;
}) {
  const ink = useTheme().instrument;
  const { digits } = useSvgFonts();
  const selectedText = selected === null ? null : groupThousands(Math.round(selected));
  const label = withStatus('Altitude', status, () => {
    const words = describeAltitude(feet ?? 0, baroWords, radioAltitude);
    return selectedText === null ? words : `${words}, selected ${selectedText} feet`;
  });
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
                  {...digits}
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
            {...digits}
          >
            {groupThousands(roundAltitude(feet))}
          </SvgText>
        </>
      )}
      {selected === null ? null : (
        <>
          {feet === null ? null : (
            <Polygon
              testID="pfd-altitude-bug"
              points={tapeBugPoints(0, 1, tapeTargetY(selected, feet, PX, CY, SELECTED_HEIGHT))}
              fill={ink.selected}
            />
          )}
          {/* x 1 to 59, as the readout box, so the side strokes stay inside the tape. */}
          <Rect
            x={1}
            y={0}
            width={58}
            height={SELECTED_HEIGHT}
            fill={ink.face}
            stroke={ink.selected}
            strokeWidth={1.5}
          />
          <SvgText
            testID="pfd-altitude-selected"
            x={VB.width / 2}
            y={15}
            fontSize={13}
            fontWeight="bold"
            fill={ink.selected}
            textAnchor="middle"
            {...digits}
          >
            {selectedText}
          </SvgText>
        </>
      )}
    </InstrumentFace>
  );
});
