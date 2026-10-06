import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { type Marker, sourceLabel } from '@/domain/navigation/hsi';
import { deviationOffset } from '@/domain/navigation/hsi-geometry';
import { NOT_LIVE_OPACITY } from '@/features/panels/instruments/InstrumentFace';
import { useSvgFonts } from '@/features/panels/instruments/svg-parts';
import { Flag } from '@/features/panels/navigation/NavFlag';
import {
  MARKER_LETTER,
  deviationWords,
  lateralName,
  markerColour,
  needleColour,
  verticalName,
} from '@/features/panels/navigation/nav-presentation';
import type { NavValues } from '@/features/panels/navigation/useNavValues';
import { useTheme } from '@/theme/theme-context';

/** The attitude display's own viewBox, so the cues share its coordinates. */
const VB = { width: 200, height: 240 };
const CX = 100;
const CY = 120;
/** View units per dot on both deviation scales; each draws two dots a side. */
const PX_PER_DOT = 18;
const DOTS = [-2, -1, 1, 2];
/** The lateral scale, low on the attitude above the radio-altitude box (its top is at 211). */
const LOC_Y = 196;
/** The vertical scale, on the right edge, clear of the wings (they end at 150). */
const GS_X = 186;
const DIAMOND_HALF_H = 7;
const DIAMOND_HALF_W = 6;
/** The marker box, top right, outside the roll arc. */
const MARKER = { x: 170, y: 4, width: 24, height: 20 };
/** The source word, left of the lateral scale and clear of its pegged diamond (from 49). */
const SOURCE_X = 6;
const TEXT_SIZE = 12;

/** What the cues draw, in the spoken order: each part only while it is drawn. */
export function describeNavCues(
  nav: Pick<NavValues, 'source' | 'lateral' | 'glideslope' | 'marker'>,
): string {
  const parts: string[] = [];
  if (nav.lateral.dots !== null) {
    parts.push(`${lateralName(nav.source)} ${deviationWords(nav.lateral.dots, 'right', 'left')}`);
  }
  const vertical = verticalName(nav.source).word;
  if (nav.glideslope.state === 'flagged') {
    parts.push(`${vertical} flagged`);
  } else if (nav.glideslope.state === 'valid' && nav.glideslope.dots !== null) {
    parts.push(`${vertical} ${deviationWords(nav.glideslope.dots, 'up', 'down')}`);
  }
  if (nav.marker !== null) {
    parts.push(`${nav.marker} marker`);
  }
  return parts.join(', ');
}

/** One scale's dots, two a side of the centre along x (lateral) or y (vertical). */
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

/**
 * The PFD's navigation cues (spec §6), drawn over the attitude in its coordinates: the lateral
 * scale low in the centre with its source word, the vertical scale on the right edge, and the
 * marker box top right. They are an overlay, not the attitude's children, so a missing pitch or
 * roll costs only the attitude (a missing feature drops only its cue); like the radio-altitude
 * box they fade with the link. Each cue is drawn only from what `useNavValues` returns: no signal
 * is no scale and no flag (the HSI carries the NAV flag and the "not available" note), and only a
 * flagged vertical path shows its red word, since a pilot on an approach must see why the diamond
 * is gone. The words are spoken in the attitude's label, so the overlay is hidden from screen
 * readers. Props are primitives so it re-renders only when what it draws changes.
 */
export const NavCues = React.memo(function NavCues({
  left,
  width,
  height,
  live,
  source,
  lateralDots,
  glideslope,
  glideslopeDots,
  marker,
}: {
  left: number;
  width: number;
  height: number;
  /** The link's freshness: not live fades the cues, as it does the PFD's boxes. */
  live: boolean;
  source: number | null;
  /** Null unless X-Plane reports a received course (R3). */
  lateralDots: number | null;
  glideslope: NavValues['glideslope']['state'];
  /** Null unless the vertical path is `valid` (R4). */
  glideslopeDots: number | null;
  marker: Marker | null;
}) {
  const theme = useTheme();
  const ink = theme.instrument;
  const fonts = useSvgFonts();
  const lateralShown = lateralDots !== null;
  const verticalShown = glideslope === 'valid' && glideslopeDots !== null;
  if (!lateralShown && !verticalShown && glideslope !== 'flagged' && marker === null) {
    return null;
  }
  const needle = needleColour(source, theme);
  const sourceWord = sourceLabel(source);
  return (
    <View
      testID="pfd-nav-cues"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left,
        top: 0,
        width,
        height,
        opacity: live ? 1 : NOT_LIVE_OPACITY,
      }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${VB.width} ${VB.height}`}>
        {lateralDots === null ? null : (
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
              points={diamondPoints(CX + deviationOffset(lateralDots, PX_PER_DOT), LOC_Y)}
              fill={needle}
            />
            {/* U2: the source in words, never by the needle's colour alone. */}
            {sourceWord === null ? null : (
              <SvgText
                testID="pfd-nav-source"
                x={SOURCE_X}
                y={LOC_Y + 4.5}
                fontSize={TEXT_SIZE}
                fontWeight="bold"
                fill={needle}
                {...fonts.letters}
              >
                {sourceWord}
              </SvgText>
            )}
          </G>
        )}

        {glideslopeDots === null || glideslope !== 'valid' ? null : (
          <G testID="pfd-gs-scale">
            <Line
              x1={GS_X - 6}
              y1={CY}
              x2={GS_X + 6}
              y2={CY}
              stroke={ink.marking}
              strokeWidth={2}
            />
            <ScaleDots along="y" />
            <Polygon
              testID="pfd-gs-diamond"
              points={diamondPoints(GS_X, CY - deviationOffset(glideslopeDots, PX_PER_DOT))}
              fill={needle}
            />
          </G>
        )}
        {glideslope === 'flagged' ? (
          <Flag testID="pfd-gs-flag" x={GS_X} y={CY} word={verticalName(source).flag} />
        ) : null}

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
      </Svg>
    </View>
  );
});
