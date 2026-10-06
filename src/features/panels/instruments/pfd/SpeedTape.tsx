import React from 'react';
import { G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { formatMach } from '@/domain/autopilot/selectors';
import { clamp, tapeTicks } from '@/domain/instruments/geometry';
import { type InstrumentStatus, describeAirspeed, withStatus } from '@/domain/instruments/labels';
import { type SpeedMarkings, speedBands } from '@/domain/instruments/speed-markings';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import {
  ARC_COLOR,
  tapeBugPoints,
  tapeTargetY,
  useSvgFonts,
} from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 60, height: 240 };
const CY = 120;
/** 3 units a knot: the tape shows ±40 kt around the readout. */
const PX = 3;
/** The selected-speed box across the top of the tape; a bug above the scale parks half under it. */
const SELECTED_HEIGHT = 20;

/**
 * The tape moves under a fixed readout: bands and ticks first, the box last, so the box covers
 * the tick labels passing behind it and the number in it is always the one read. The box starts at
 * x 1 so its left stroke stays inside the tape, as the altitude tape's does. The selected speed,
 * passed only while FLC or the autothrottle holds it, is a cyan box at the top and, in knots, a
 * cyan bug on the tape's right edge, drawn in the altitude tape's order.
 */
export const SpeedTape = React.memo(function SpeedTape({
  width,
  height,
  status,
  knots,
  mach,
  markings,
  selected,
}: {
  width: number;
  height: number;
  status: InstrumentStatus;
  knots: number | null;
  mach: number | null;
  markings: SpeedMarkings | null;
  /** The autopilot's selected speed, in knots or as a Mach number. */
  selected: { value: number; mach: boolean } | null;
}) {
  const ink = useTheme().instrument;
  const { digits } = useSvgFonts();
  const label = withStatus('Airspeed', status, () => {
    const words = describeAirspeed(knots ?? 0, mach);
    if (selected === null) {
      return words;
    }
    return selected.mach
      ? `${words}, selected Mach ${formatMach(selected.value)}`
      : `${words}, selected ${Math.round(selected.value)} knots`;
  });
  const y = (value: number) => CY - (value - (knots ?? 0)) * PX;
  const bandY = (from: number, to: number) => {
    const top = clamp(y(to), 0, VB.height);
    const bottom = clamp(y(from), 0, VB.height);
    return { top, height: Math.max(0, bottom - top) };
  };
  const red = markings === null ? null : bandY(markings.vne, markings.vne + 1000);
  return (
    <InstrumentFace
      testID="instrument-airspeed"
      label={label}
      status={status}
      width={width}
      height={height}
      viewBox={VB}
      scale={<Rect x={0} y={0} width={VB.width} height={VB.height} fill={ink.tape} />}
    >
      {knots === null ? null : (
        <>
          {markings === null
            ? null
            : speedBands(markings).map((band) => {
                const { top, height: bandHeight } = bandY(band.from, band.to);
                const white = band.color === 'white';
                return (
                  <Rect
                    key={band.color}
                    x={white ? 50 : 54}
                    y={top}
                    width={white ? 4 : 6}
                    height={bandHeight}
                    fill={ink[ARC_COLOR[band.color]]}
                  />
                );
              })}
          {red === null ? null : (
            <Rect x={54} y={red.top} width={6} height={red.height} fill={ink.arcRed} />
          )}
          {tapeTicks(knots, 40, 10, 20, 0).map((tick) => (
            <G key={tick.value}>
              <Line
                x1={tick.labelled ? 42 : 48}
                y1={y(tick.value)}
                x2={60}
                y2={y(tick.value)}
                stroke={ink.marking}
                strokeWidth={2}
              />
              {tick.labelled ? (
                <SvgText
                  x={38}
                  y={y(tick.value) + 5}
                  fontSize={14}
                  fill={ink.marking}
                  textAnchor="end"
                  {...digits}
                >
                  {String(tick.value)}
                </SvgText>
              ) : null}
            </G>
          ))}
          <Rect
            x={1}
            y={CY - 14}
            width={49}
            height={28}
            fill={ink.face}
            stroke={ink.marking}
            strokeWidth={1.5}
          />
          <SvgText
            x={46}
            y={CY + 7}
            fontSize={18}
            fontWeight="bold"
            fill={ink.marking}
            textAnchor="end"
            {...digits}
          >
            {String(Math.round(knots))}
          </SvgText>
        </>
      )}
      {selected === null ? null : (
        <>
          {knots === null || selected.mach ? null : (
            <Polygon
              testID="pfd-speed-bug"
              points={tapeBugPoints(
                VB.width,
                -1,
                tapeTargetY(selected.value, knots, PX, CY, SELECTED_HEIGHT),
              )}
              fill={ink.selected}
            />
          )}
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
            testID="pfd-speed-selected"
            x={VB.width / 2}
            y={15}
            fontSize={13}
            fontWeight="bold"
            fill={ink.selected}
            textAnchor="middle"
            {...digits}
          >
            {selected.mach ? `M${formatMach(selected.value)}` : String(Math.round(selected.value))}
          </SvgText>
        </>
      )}
    </InstrumentFace>
  );
});
