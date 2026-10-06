import React from 'react';
import { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { type InstrumentStatus, describeAttitude, withStatus } from '@/domain/instruments/labels';
import type { Marker } from '@/domain/navigation/hsi';
import { deviationOffset } from '@/domain/navigation/hsi-geometry';
import { AttitudeScene } from '@/features/panels/instruments/AttitudeScene';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { useSvgFonts } from '@/features/panels/instruments/svg-parts';
import {
  Flag,
  MARKER_LETTER,
  deviationWords,
  markerColour,
} from '@/features/panels/navigation/Hsi';
import type { GlideslopeDisplay } from '@/features/panels/navigation/useNavValues';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 200, height: 240 };
const CX = 100;
const CY = 120;
/** View units per dot on both deviation scales; each draws two dots a side. */
const PX_PER_DOT = 18;
const DOTS = [-2, -1, 1, 2];
/** The localizer scale, low on the attitude above the radio-altitude box (its top is at 211). */
const LOC_Y = 196;
/** The glideslope scale, on the right edge, clear of the wings (they end at 150). */
const GS_X = 186;
const DIAMOND_HALF_H = 7;
const DIAMOND_HALF_W = 6;
/** The marker box, top right, outside the roll arc. */
const MARKER = { x: 170, y: 4, width: 24, height: 20 };

/**
 * A received deviation: where the diamond sits in dots, and whether it is stopped at full scale.
 * `null` is no signal, so nothing is drawn (never a centred diamond, R3, R4).
 */
interface Deviation {
  dots: number;
  pegged: boolean;
}

function asDeviation(dots: number | null, pegged: boolean): Deviation | null {
  return dots === null ? null : { dots, pegged };
}

/** One scale's dots, two a side of the centre along x (localizer) or y (glideslope). */
function ScaleDots({ along }: { along: 'x' | 'y' }) {
  const ink = useTheme().instrument;
  return (
    <>
      {DOTS.map((dot) => {
        const offset = deviationOffset(dot, PX_PER_DOT);
        return (
          <Circle
            key={dot}
            cx={along === 'x' ? CX + offset : GS_X}
            cy={along === 'x' ? LOC_Y : CY - offset}
            r={3}
            fill="none"
            stroke={ink.marking}
            strokeWidth={1.5}
          />
        );
      })}
    </>
  );
}

/** A diamond centred on (x, y), as the HSI draws it; its first vertex is the top. */
function diamondPoints(x: number, y: number): string {
  return `${x},${y - DIAMOND_HALF_H} ${x + DIAMOND_HALF_W},${y} ${x},${y + DIAMOND_HALF_H} ${x - DIAMOND_HALF_W},${y}`;
}

/** The attitude's words, then each navigation cue in the order the eye meets it, while drawn. */
function describe(
  pitch: number,
  roll: number,
  localizer: Deviation | null,
  glideslope: GlideslopeDisplay,
  glideslopeDeviation: Deviation | null,
  marker: Marker | null,
): string {
  const parts = [describeAttitude(pitch, roll)];
  if (localizer !== null) {
    parts.push(`localizer ${deviationWords(localizer, 'right', 'left')}`);
  }
  if (glideslope === 'flagged') {
    parts.push('glideslope flagged');
  } else if (glideslopeDeviation !== null) {
    parts.push(`glideslope ${deviationWords(glideslopeDeviation, 'up', 'down')}`);
  }
  if (marker !== null) {
    parts.push(`${marker} marker`);
  }
  return parts.join(', ');
}

/**
 * The attitude with the slip trapezoid under its roll pointer, and the navigation cues of spec §6:
 * the localizer scale low in the centre, the glideslope scale on the right edge, and the marker box
 * top right. Each cue is drawn only from what `useNavValues` returns: no signal is no scale and no
 * flag (the HSI carries the flags and the "not available" note), and only a flagged glideslope
 * shows its red GS word, since a pilot on an ILS must see why the diamond is gone. The cues are the
 * face's children, so they fade with it when not live and are spoken in its label. Props are
 * primitives so this memoised face re-renders only when what it draws changes. Radio altitude is
 * drawn over it by the PFD, so it shows whether or not the attitude has a value.
 */
export const AttitudeDisplay = React.memo(function AttitudeDisplay({
  width,
  height,
  status,
  pitch,
  roll,
  slip,
  needle,
  localizerDots,
  localizerPegged,
  glideslope,
  glideslopeDots,
  glideslopePegged,
  marker,
}: {
  width: number;
  height: number;
  status: InstrumentStatus;
  pitch: number | null;
  roll: number | null;
  slip: number | null;
  /** The source colour, NAV green or GPS magenta, from `needleColour`. */
  needle: string;
  /** Null unless X-Plane reports a received course (R3). */
  localizerDots: number | null;
  localizerPegged: boolean;
  glideslope: GlideslopeDisplay;
  /** Null unless the glideslope is `valid` (R4). */
  glideslopeDots: number | null;
  glideslopePegged: boolean;
  marker: Marker | null;
}) {
  const theme = useTheme();
  const ink = theme.instrument;
  const fonts = useSvgFonts();
  const localizer = asDeviation(localizerDots, localizerPegged);
  const glideslopeDeviation =
    glideslope === 'valid' ? asDeviation(glideslopeDots, glideslopePegged) : null;
  const label = withStatus('Attitude', status, () =>
    describe(pitch ?? 0, roll ?? 0, localizer, glideslope, glideslopeDeviation, marker),
  );
  return (
    <InstrumentFace
      testID="instrument-attitude"
      label={label}
      status={status}
      width={width}
      height={height}
      viewBox={VB}
      scale={<Rect x={0} y={0} width={VB.width} height={VB.height} fill={ink.face} />}
    >
      {pitch === null || roll === null ? null : (
        <AttitudeScene
          pitch={pitch}
          roll={roll}
          slip={slip}
          cx={CX}
          cy={CY}
          pxPerDeg={4.8}
          windowDeg={25}
          bankRadius={92}
          clip={{ kind: 'rect', width: VB.width, height: VB.height }}
        />
      )}

      {localizer === null ? null : (
        <G testID="pfd-loc-scale">
          <Line
            x1={CX}
            y1={LOC_Y - 6}
            x2={CX}
            y2={LOC_Y + 6}
            stroke={ink.marking}
            strokeWidth={2}
          />
          <ScaleDots along="x" />
          <Polygon
            testID="pfd-loc-diamond"
            points={diamondPoints(CX + deviationOffset(localizer.dots, PX_PER_DOT), LOC_Y)}
            fill={needle}
          />
        </G>
      )}

      {glideslopeDeviation === null ? null : (
        <G testID="pfd-gs-scale">
          <Line x1={GS_X - 6} y1={CY} x2={GS_X + 6} y2={CY} stroke={ink.marking} strokeWidth={2} />
          <ScaleDots along="y" />
          <Polygon
            testID="pfd-gs-diamond"
            points={diamondPoints(GS_X, CY - deviationOffset(glideslopeDeviation.dots, PX_PER_DOT))}
            fill={needle}
          />
        </G>
      )}
      {glideslope === 'flagged' ? <Flag testID="pfd-gs-flag" x={GS_X} y={CY} word="GS" /> : null}

      {marker === null ? null : (
        <>
          <Rect
            testID="pfd-marker-box"
            x={MARKER.x}
            y={MARKER.y}
            width={MARKER.width}
            height={MARKER.height}
            rx={3}
            fill={markerColour(marker, theme)}
          />
          <SvgText
            testID="pfd-marker"
            x={MARKER.x + MARKER.width / 2}
            y={MARKER.y + 15}
            fontSize={14}
            fontWeight="bold"
            fill={ink.face}
            textAnchor="middle"
            {...fonts.letters}
          >
            {MARKER_LETTER[marker]}
          </SvgText>
        </>
      )}
    </InstrumentFace>
  );
});
