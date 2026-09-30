import React, { useId } from 'react';
import { Circle, ClipPath, Defs, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import {
  BANK_MARKS,
  attitudeTransform,
  pitchLadder,
  polar,
  slipOffset,
} from '@/domain/instruments/geometry';
import { useTheme } from '@/theme/theme-context';

type Clip = { kind: 'circle'; r: number } | { kind: 'rect'; width: number; height: number };

interface Props {
  pitch: number;
  roll: number;
  /** The PFD draws slip under the roll pointer; the six-pack leaves it to the turn coordinator. */
  slip: number | null;
  cx: number;
  cy: number;
  pxPerDeg: number;
  windowDeg: number;
  bankRadius: number;
  clip: Clip;
}

const BIG = 2000;

/**
 * Sky, ground and the pitch ladder move together: translated by pitch, then rotated by −roll about
 * the centre. The bank scale and aircraft symbol stay fixed; the roll pointer rotates with the sky.
 */
export function AttitudeScene({
  pitch,
  roll,
  slip,
  cx,
  cy,
  pxPerDeg,
  windowDeg,
  bankRadius,
  clip,
}: Props) {
  const ink = useTheme().instrument;
  const clipId = `attitude${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { rotateDeg, translateY } = attitudeTransform(pitch, roll, pxPerDeg);
  const bank = BANK_MARKS.flatMap((deg) => [deg, -deg]);
  return (
    <>
      <Defs>
        <ClipPath id={clipId}>
          {clip.kind === 'circle' ? (
            <Circle cx={cx} cy={cy} r={clip.r} />
          ) : (
            <Rect x={0} y={0} width={clip.width} height={clip.height} />
          )}
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <G transform={`rotate(${rotateDeg} ${cx} ${cy}) translate(0 ${translateY})`}>
          <Rect x={cx - BIG} y={cy - BIG} width={BIG * 2} height={BIG} fill={ink.sky} />
          <Rect x={cx - BIG} y={cy} width={BIG * 2} height={BIG} fill={ink.ground} />
          <Line x1={cx - BIG} y1={cy} x2={cx + BIG} y2={cy} stroke={ink.horizon} strokeWidth={2} />
          {pitchLadder(pitch, windowDeg).map((mark) => {
            const y = cy - mark.deg * pxPerDeg;
            const half = mark.major ? 30 : 15;
            return (
              <G key={mark.deg}>
                <Line
                  x1={cx - half}
                  y1={y}
                  x2={cx + half}
                  y2={y}
                  stroke={ink.marking}
                  strokeWidth={2}
                />
                {mark.major ? (
                  <>
                    <SvgText
                      x={cx - half - 4}
                      y={y + 5}
                      fontSize={14}
                      fill={ink.marking}
                      textAnchor="end"
                    >
                      {String(Math.abs(mark.deg))}
                    </SvgText>
                    <SvgText
                      x={cx + half + 4}
                      y={y + 5}
                      fontSize={14}
                      fill={ink.marking}
                      textAnchor="start"
                    >
                      {String(Math.abs(mark.deg))}
                    </SvgText>
                  </>
                ) : null}
              </G>
            );
          })}
        </G>
        {bank.map((deg) => {
          const outer = polar(cx, cy, bankRadius, deg);
          const inner = polar(cx, cy, bankRadius - (Math.abs(deg) % 30 === 0 ? 12 : 7), deg);
          return (
            <Line
              key={deg}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke={ink.marking}
              strokeWidth={2}
            />
          );
        })}
        <Polygon
          points={`${cx},${cy - bankRadius} ${cx - 6},${cy - bankRadius - 9} ${cx + 6},${cy - bankRadius - 9}`}
          fill={ink.marking}
        />
        <G transform={`rotate(${rotateDeg} ${cx} ${cy})`}>
          <Polygon
            points={`${cx},${cy - bankRadius + 2} ${cx - 7},${cy - bankRadius + 14} ${cx + 7},${cy - bankRadius + 14}`}
            fill={ink.pointer}
          />
          {slip === null ? null : (
            <Rect
              x={cx - 8 + slipOffset(slip, 8)}
              y={cy - bankRadius + 16}
              width={16}
              height={5}
              fill={ink.pointer}
            />
          )}
        </G>
        <Line
          x1={cx - 50}
          y1={cy}
          x2={cx - 16}
          y2={cy}
          stroke={ink.pointer}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Line
          x1={cx + 16}
          y1={cy}
          x2={cx + 50}
          y2={cy}
          stroke={ink.pointer}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Circle cx={cx} cy={cy} r={3.5} fill={ink.pointer} />
      </G>
    </>
  );
}
