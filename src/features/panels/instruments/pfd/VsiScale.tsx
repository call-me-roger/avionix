import React from 'react';
import { Line, Rect, Text as SvgText } from 'react-native-svg';

import { vsiHundreds, vsiScaleOffset } from '@/domain/instruments/geometry';
import {
  type InstrumentStatus,
  describeVerticalSpeed,
  withStatus,
} from '@/domain/instruments/labels';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 40, height: 240 };
const CY = 120;
// ±2,000 ft/min spans ±96, not the full ±120: the hundreds readout needs the 24 units above and
// below the scale, clear of the "2" labels and of the pointer pegged at either end.
const HALF = 96;
const MARKS = [500, 1000, 2000].flatMap((fpm) => [fpm, -fpm]);
const LABELS = [1000, 2000].flatMap((fpm) => [fpm, -fpm]);

export const VsiScale = React.memo(function VsiScale({
  width,
  height,
  status,
  fpm,
}: {
  width: number;
  height: number;
  status: InstrumentStatus;
  fpm: number | null;
}) {
  const ink = useTheme().instrument;
  const label = withStatus('Vertical speed', status, () => describeVerticalSpeed(fpm ?? 0));
  const scale = (
    <>
      <Rect x={0} y={0} width={VB.width} height={VB.height} fill={ink.tape} />
      <Line x1={28} y1={CY} x2={40} y2={CY} stroke={ink.marking} strokeWidth={2} />
      {MARKS.map((mark) => {
        const y = CY - vsiScaleOffset(mark, HALF);
        return (
          <Line key={mark} x1={32} y1={y} x2={40} y2={y} stroke={ink.marking} strokeWidth={2} />
        );
      })}
      {LABELS.map((mark) => (
        <SvgText
          key={`label${mark}`}
          x={22}
          y={CY - vsiScaleOffset(mark, HALF) + 5}
          fontSize={14}
          fill={ink.marking}
          textAnchor="end"
        >
          {String(Math.abs(mark) / 1000)}
        </SvgText>
      ))}
    </>
  );
  const hundreds = fpm === null ? '' : vsiHundreds(fpm);
  return (
    <InstrumentFace
      testID="instrument-vertical-speed"
      label={label}
      status={status}
      width={width}
      height={height}
      viewBox={VB}
      scale={scale}
    >
      {fpm === null ? null : (
        <>
          {/* The readout first: the pointer passes over it. */}
          {hundreds === '' ? null : (
            <SvgText
              x={20}
              y={fpm > 0 ? 16 : 234}
              fontSize={14}
              fill={ink.marking}
              textAnchor="middle"
            >
              {hundreds}
            </SvgText>
          )}
          <Line
            x1={40}
            y1={CY}
            x2={10}
            y2={CY - vsiScaleOffset(fpm, HALF)}
            stroke={ink.marking}
            strokeWidth={3}
          />
        </>
      )}
    </InstrumentFace>
  );
});
