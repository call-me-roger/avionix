import React from 'react';
import { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { headingText, headingTickLabel, polar, scaleTicks } from '@/domain/instruments/geometry';
import { withStatus } from '@/domain/instruments/labels';
import { sourceLabel } from '@/domain/navigation/hsi';
import { cardAngle, deviationOffset } from '@/domain/navigation/hsi-geometry';
import { InstrumentFace } from '@/features/panels/instruments/InstrumentFace';
import { cardLabelFont, countRender, useSvgFonts } from '@/features/panels/instruments/svg-parts';
import { Flag, flagWidth } from '@/features/panels/navigation/NavFlag';
import {
  MARKER_LETTER,
  deviationWords,
  markerColour,
  needleColour,
  verticalName,
} from '@/features/panels/navigation/nav-presentation';
import { type NavValues, useNavValues } from '@/features/panels/navigation/useNavValues';
import { useTheme } from '@/theme/theme-context';

const VB = { width: 240, height: 240 };
const C = 120;
const CARD_R = 104;
/** View units per dot on both deviation scales; the scale draws two dots each side. */
export const PX_PER_DOT = 22;
const DOTS = [-2, -1, 1, 2];
const CARD_TICKS = scaleTicks(0, 355, 5, 10);
const CARD_LABELS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
/** The CDI bar's half length, and the gap between its ends and the fixed course line. */
const CDI_HALF = 35;
const CDI_GAP = 12;
const COURSE_TIP = C - 100;
const COURSE_HEAD_BASE = C - 82;
/** Bearing pointers run from the card edge in to this radius, at both ends. */
const BRG_INNER_R = 70;
const GS_X = 226;
const DIAMOND_HALF_H = 7;
const DIAMOND_HALF_W = 6;
/** Corner text: small enough to stay outside the card in the 16-unit corners it leaves. */
const CORNER_SIZE = 12;
const CORNER_INSET = 6;
const LINE_STEP = 14;
/** The DME time, after the groundspeed on the bottom line: clear of `999 KT` in the corner font. */
const DME_TIME_AFTER_SPEED_X = 60;
/** A flag's box ends one unit inside the face's right edge, as the GS flag at the scale does. */
const flagRightX = (word: string) => VB.width - 1 - flagWidth(word) / 2;
/**
 * The heading bug at north on the card: on the card's edge, notched on its inner side so the
 * card's tick at the selected heading reads between its two prongs. Rotated to its bearing.
 */
const BUG_POINTS = `${C - 8},${C - CARD_R} ${C + 8},${C - CARD_R} ${C + 8},${C - CARD_R + 9} ${C},${C - CARD_R + 4} ${C - 8},${C - CARD_R + 9}`;

/** One sentence, in the order the eye reads the face; a flagged part says so (U5). */
function describeHsi(v: NavValues): string {
  const parts = ['HSI'];
  if (v.heading !== null) {
    parts.push(`heading ${headingText(v.heading)}`);
  }
  parts.push(sourceLabel(v.source) ?? 'source not available');
  if (v.ident !== null) {
    parts.push(v.ident);
  }
  if (v.course === null) {
    // A received course with no course to hang it on: said, never silently dropped.
    if (v.lateral.valid) {
      parts.push('course not available');
    }
  } else {
    parts.push(`course ${headingText(v.course)}`);
    if (v.lateral.dots !== null) {
      parts.push(deviationWords(v.lateral.dots, 'right', 'left'));
    }
    if (v.toFrom !== null) {
      parts.push(v.toFrom);
    }
  }
  if (v.lateral.unavailable) {
    parts.push('course deviation not available on this aircraft');
  } else if (!v.lateral.valid) {
    parts.push('no NAV signal');
  }
  const vertical = verticalName(v.source).word;
  if (v.glideslope.state === 'unavailable') {
    parts.push(`${vertical} not available on this aircraft`);
  } else if (v.glideslope.state === 'flagged') {
    parts.push(`${vertical} flagged`);
  } else if (v.glideslope.dots !== null) {
    parts.push(`${vertical} ${deviationWords(v.glideslope.dots, 'up', 'down')}`);
  }
  if (v.dmeSpoken !== null) {
    parts.push(`DME ${v.dmeSpoken}`);
  }
  if (v.dmeSpeedSpoken !== null) {
    parts.push(v.dmeSpeedSpoken);
  }
  if (v.marker !== null) {
    parts.push(`${v.marker} marker`);
  }
  if (v.headingBug !== null) {
    parts.push(`heading bug ${headingText(v.headingBug)}`);
  }
  return parts.join(', ');
}

/**
 * A bearing pointer at north: the head from the card edge in to `BRG_INNER_R`, an open arrowhead
 * at the edge, and the tail opposite. BRG1 is one line, BRG2 two lines 3 apart (U2: shape, not
 * colour, tells them apart).
 */
function BearingPointer({
  testID,
  double,
  angle,
}: {
  testID: string;
  double: boolean;
  /** Relative to the lubber line, from `cardAngle`. */
  angle: number;
}) {
  const ink = useTheme().instrument;
  const offsets = double ? [-1.5, 1.5] : [0];
  const tip = C - CARD_R + 2;
  const spread = double ? 8 : 6;
  return (
    <G
      testID={testID}
      stroke={ink.selected}
      strokeWidth={2}
      fill="none"
      transform={`rotate(${angle} ${C} ${C})`}
    >
      {offsets.map((dx, index) => (
        <Path
          key={dx}
          testID={`${testID}-line-${index}`}
          d={`M ${C + dx} ${tip} L ${C + dx} ${C - BRG_INNER_R} M ${C + dx} ${C + BRG_INNER_R} L ${C + dx} ${C + CARD_R}`}
          fill="none"
        />
      ))}
      <Path
        d={`M ${C - spread} ${tip + 12} L ${C} ${tip} L ${C + spread} ${tip + 12}`}
        fill="none"
      />
    </G>
  );
}

/**
 * The card's 72 ticks and 12 labels at north-up. Static: built once per theme and font (the only
 * inputs, read from context), never on a needle's or the heading's change; the card's group turns
 * them.
 */
const CardMarks = React.memo(function CardMarks() {
  countRender('hsi-card-marks');
  const ink = useTheme().instrument;
  const fonts = useSvgFonts();
  return (
    <>
      {CARD_TICKS.map((tick) => {
        const outer = polar(C, C, CARD_R, tick.value);
        const inner = polar(C, C, CARD_R - (tick.major ? 12 : 7), tick.value);
        return (
          <Line
            key={tick.value}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            stroke={ink.marking}
            strokeWidth={tick.major ? 2 : 1.5}
          />
        );
      })}
      {CARD_LABELS.map((deg) => (
        <SvgText
          key={deg}
          testID={`hsi-card-label-${deg}`}
          x={C}
          y={C - CARD_R + 30}
          fontSize={14}
          fontWeight="bold"
          fill={ink.marking}
          textAnchor="middle"
          transform={`rotate(${deg} ${C} ${C})`}
          {...cardLabelFont(headingTickLabel(deg), fonts)}
        >
          {headingTickLabel(deg)}
        </SvgText>
      ))}
    </>
  );
});

/** Plain data compared by value, so a fresh `useNavValues` object with the same values is equal. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) =>
      sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

/**
 * A Garmin-style HSI (spec section 3). The card turns under a fixed lubber line and aircraft; the
 * course pointer, CDI and TO/FROM turn with the course, the bearing pointers with their bearings,
 * all by `cardAngle` from the heading. Each validity rule is applied in `useNavValues`: what it
 * returns null is not drawn, and a flagged needle shows its red word instead, never a centred
 * needle (R3, R4, R7). X-Plane's deflections are drawn as given: positive is right and up.
 */
const HsiFace = React.memo(
  function HsiFace({ size, v }: { size: number; v: NavValues }) {
    const theme = useTheme();
    const ink = theme.instrument;
    const fonts = useSvgFonts();
    const needle = needleColour(v.source, theme);
    // An unknown or missing source still says so in words, in the colour that claims no source.
    const source = sourceLabel(v.source) ?? 'SRC ?';
    const label = withStatus('HSI', v.status, () => describeHsi(v));
    const heading = v.heading;
    // TO or FROM is said of the course, so without one neither the arrow nor the word is shown.
    const toFrom = v.course === null ? null : v.toFrom;

    return (
      <InstrumentFace
        testID="instrument-hsi"
        label={label}
        status={v.status}
        width={size}
        height={size}
        viewBox={VB}
        scale={
          <>
            <Rect x={0} y={0} width={VB.width} height={VB.height} rx={12} fill={ink.face} />
            <Circle cx={C} cy={C} r={CARD_R} fill={ink.face} stroke={ink.marking} strokeWidth={1} />
          </>
        }
      >
        {heading === null ? null : (
          <>
            {/* First, so the card's top ticks, the bug and the lubber line draw over the 4 units
              of the box below the card's edge: its letter sits wholly above the card. */}
            {v.marker === null ? null : (
              <>
                <Rect
                  testID="hsi-marker-box"
                  x={C - 14}
                  y={0}
                  width={28}
                  height={20}
                  rx={3}
                  fill={markerColour(v.marker, theme)}
                />
                <SvgText
                  testID="hsi-marker"
                  x={C}
                  y={15}
                  fontSize={14}
                  fontWeight="bold"
                  fill={ink.face}
                  textAnchor="middle"
                  {...fonts.letters}
                >
                  {MARKER_LETTER[v.marker]}
                </SvgText>
              </>
            )}

            <G testID="hsi-card" transform={`rotate(${cardAngle(0, heading)} ${C} ${C})`}>
              <CardMarks />
            </G>

            {v.headingBug === null ? null : (
              <Polygon
                testID="hsi-heading-bug"
                points={BUG_POINTS}
                fill={ink.selected}
                transform={`rotate(${cardAngle(v.headingBug, heading)} ${C} ${C})`}
              />
            )}

            {v.bearing1 === null ? null : (
              <BearingPointer
                testID="hsi-brg1"
                double={false}
                angle={cardAngle(v.bearing1, heading)}
              />
            )}
            {v.bearing2 === null ? null : (
              <BearingPointer testID="hsi-brg2" double angle={cardAngle(v.bearing2, heading)} />
            )}

            {v.course === null ? null : (
              <G
                testID="hsi-course-group"
                transform={`rotate(${cardAngle(v.course, heading)} ${C} ${C})`}
              >
                {DOTS.map((dot) => (
                  <Circle
                    key={dot}
                    cx={C + deviationOffset(dot, PX_PER_DOT)}
                    cy={C}
                    r={3.5}
                    fill="none"
                    stroke={ink.marking}
                    strokeWidth={1.5}
                  />
                ))}
                <Polygon
                  testID="hsi-course-pointer"
                  points={`${C},${COURSE_TIP} ${C - 8},${COURSE_HEAD_BASE} ${C + 8},${COURSE_HEAD_BASE}`}
                  fill={needle}
                />
                <Line
                  x1={C}
                  y1={COURSE_HEAD_BASE}
                  x2={C}
                  y2={C - CDI_HALF - CDI_GAP}
                  stroke={needle}
                  strokeWidth={4}
                />
                <Line
                  x1={C}
                  y1={C + CDI_HALF + CDI_GAP}
                  x2={C}
                  y2={C + CARD_R - 4}
                  stroke={needle}
                  strokeWidth={4}
                />
                {v.lateral.dots === null ? null : (
                  <Line
                    testID="hsi-cdi"
                    x1={C + deviationOffset(v.lateral.dots.dots, PX_PER_DOT)}
                    y1={C - CDI_HALF}
                    x2={C + deviationOffset(v.lateral.dots.dots, PX_PER_DOT)}
                    y2={C + CDI_HALF}
                    stroke={needle}
                    strokeWidth={4}
                  />
                )}
                {v.toFrom === null ? null : (
                  <Polygon
                    testID="hsi-to-from-arrow"
                    points={
                      v.toFrom === 'TO'
                        ? `${C},${C - 34} ${C - 8},${C - 22} ${C + 8},${C - 22}`
                        : `${C},${C + 34} ${C - 8},${C + 22} ${C + 8},${C + 22}`
                    }
                    fill={ink.marking}
                  />
                )}
              </G>
            )}

            {v.lateral.valid ? null : (
              <Flag
                testID="hsi-nav-flag"
                x={C}
                y={C - 32}
                word={v.lateral.unavailable ? 'NAV N/A' : 'NAV'}
              />
            )}

            {v.glideslope.state === 'unavailable' ? (
              // The aircraft lacks a glideslope DataRef: said where the scale would be, so a missing
              // diamond on an approach never reads as no glideslope expected.
              <Flag
                testID="hsi-gs-flag"
                x={flagRightX(`${verticalName(v.source).flag} N/A`)}
                y={C}
                word={`${verticalName(v.source).flag} N/A`}
              />
            ) : null}
            {v.glideslope.state === 'valid' || v.glideslope.state === 'flagged' ? (
              <G testID="hsi-gs-scale">
                <Line
                  x1={GS_X - 6}
                  y1={C}
                  x2={GS_X + 6}
                  y2={C}
                  stroke={ink.marking}
                  strokeWidth={2}
                />
                {DOTS.map((dot) => (
                  <Circle
                    key={dot}
                    cx={GS_X}
                    cy={C - deviationOffset(dot, PX_PER_DOT)}
                    r={3.5}
                    fill="none"
                    stroke={ink.marking}
                    strokeWidth={1.5}
                  />
                ))}
                {v.glideslope.dots === null ? null : (
                  <Polygon
                    testID="hsi-gs-diamond"
                    points={diamondPoints(C - deviationOffset(v.glideslope.dots.dots, PX_PER_DOT))}
                    fill={needle}
                  />
                )}
                {v.glideslope.state === 'flagged' ? (
                  <Flag
                    testID="hsi-gs-flag"
                    x={flagRightX(verticalName(v.source).flag)}
                    y={C}
                    word={verticalName(v.source).flag}
                  />
                ) : null}
              </G>
            ) : null}

            <Polygon
              points={`${C},${C - CARD_R + 1} ${C - 6},${C - CARD_R + 13} ${C + 6},${C - CARD_R + 13}`}
              fill={ink.pointer}
            />
            <Line x1={C} y1={C - 14} x2={C} y2={C + 16} stroke={ink.pointer} strokeWidth={3} />
            <Line
              x1={C - 18}
              y1={C - 2}
              x2={C + 18}
              y2={C - 2}
              stroke={ink.pointer}
              strokeWidth={3}
            />
            <Line
              x1={C - 7}
              y1={C + 13}
              x2={C + 7}
              y2={C + 13}
              stroke={ink.pointer}
              strokeWidth={3}
            />

            <SvgText
              testID="hsi-source"
              x={CORNER_INSET}
              y={16}
              fontSize={CORNER_SIZE}
              fontWeight="bold"
              fill={needle}
              {...fonts.letters}
            >
              {source}
            </SvgText>
            {v.ident === null ? null : (
              <SvgText
                testID="hsi-ident"
                x={CORNER_INSET}
                y={16 + LINE_STEP}
                fontSize={CORNER_SIZE}
                fontWeight="bold"
                fill={ink.marking}
                {...fonts.letters}
              >
                {v.ident}
              </SvgText>
            )}
            {v.course === null ? null : (
              <SvgText
                testID="hsi-course"
                x={VB.width - CORNER_INSET}
                y={16}
                fontSize={CORNER_SIZE}
                fontWeight="bold"
                fill={needle}
                textAnchor="end"
                {...fonts.digits}
              >
                {`CRS ${headingText(v.course)}°`}
              </SvgText>
            )}
            {v.course === null && v.lateral.valid ? (
              // A received course with no course value: flagged where the course is printed, since
              // neither the pointer nor the CDI can be drawn without it.
              <Flag testID="hsi-crs-flag" x={flagRightX('CRS')} y={12} word="CRS" />
            ) : null}
            {v.dme === null ? null : (
              <SvgText
                testID="hsi-dme"
                x={CORNER_INSET}
                y={VB.height - CORNER_INSET - LINE_STEP}
                fontSize={CORNER_SIZE}
                fontWeight="bold"
                fill={ink.marking}
                {...fonts.digits}
              >
                {v.dme}
              </SvgText>
            )}
            {v.dmeSpeed === null ? null : (
              <SvgText
                testID="hsi-dme-speed"
                x={CORNER_INSET}
                y={VB.height - CORNER_INSET}
                fontSize={CORNER_SIZE}
                fontWeight="bold"
                fill={ink.marking}
                {...fonts.digits}
              >
                {v.dmeSpeed}
              </SvgText>
            )}
            {v.dmeTime === null ? null : (
              <SvgText
                testID="hsi-dme-time"
                x={v.dmeSpeed === null ? CORNER_INSET : DME_TIME_AFTER_SPEED_X}
                y={VB.height - CORNER_INSET}
                fontSize={CORNER_SIZE}
                fontWeight="bold"
                fill={ink.marking}
                {...fonts.digits}
              >
                {v.dmeTime}
              </SvgText>
            )}
            {toFrom === null ? null : (
              <SvgText
                testID="hsi-to-from"
                x={VB.width - CORNER_INSET}
                y={VB.height - CORNER_INSET}
                fontSize={CORNER_SIZE}
                fontWeight="bold"
                fill={ink.marking}
                textAnchor="end"
                {...fonts.letters}
              >
                {toFrom}
              </SvgText>
            )}
          </>
        )}
      </InstrumentFace>
    );
  },
  (prev, next) => prev.size === next.size && sameValue(prev.v, next.v),
);

/**
 * The HSI, read once per panel render: its face re-renders only when what it draws changes,
 * as the PFD's faces do, so a telemetry tick for another instrument never redraws it.
 */
export function Hsi({ size }: { size: number }) {
  const v = useNavValues();
  return <HsiFace size={size} v={v} />;
}

/** The glideslope diamond centred on (GS_X, y); its first vertex is the top. */
function diamondPoints(y: number): string {
  return `${GS_X},${y - DIAMOND_HALF_H} ${GS_X + DIAMOND_HALF_W},${y} ${GS_X},${y + DIAMOND_HALF_H} ${GS_X - DIAMOND_HALF_W},${y}`;
}
