import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

const VIEW_BOX = '0 0 24 24';

/** An 8-tooth gear outline around a small hole, computed once: alternating outer and inner radii
 * at even angle steps, starting at the top. */
function gearOutline(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  teeth: number,
): string {
  const step = Math.PI / teeth;
  const points: string[] = [];
  for (let i = 0; i < teeth * 2; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    points.push(
      `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return points.join(' ');
}

const GEAR_OUTLINE = gearOutline(12, 12, 10, 7.2, 8);

/**
 * The switcher's 22 dp icons (R-01, spec section 4), each a plain glyph that still reads once
 * the full blue fill is gone: `color` alone (plus shape) tells unselected from selected. An
 * unknown id gets a plain dot rather than a blank tab.
 */
export function PanelIcon({ id, color, size = 22 }: { id: string; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      {renderGlyph(id, color)}
    </Svg>
  );
}

function renderGlyph(id: string, color: string): React.ReactNode {
  switch (id) {
    case 'instruments':
      return (
        <>
          {/* The lower half of the attitude ball, filled faintly to read as "ground". */}
          <Path d="M3 12 A9 9 0 0 0 21 12 Z" fill={color} fillOpacity={0.35} />
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
          <Line x1={3} y1={12} x2={21} y2={12} stroke={color} strokeWidth={2} />
        </>
      );
    case 'radios':
      return (
        <>
          <Path d="M8.54 17 A4 4 0 0 1 15.46 17" stroke={color} strokeWidth={2} fill="none" />
          <Path d="M5.94 15.5 A7 7 0 0 1 18.06 15.5" stroke={color} strokeWidth={2} fill="none" />
          <Path d="M3.34 14 A10 10 0 0 1 20.66 14" stroke={color} strokeWidth={2} fill="none" />
          <Circle cx={12} cy={19} r={1.3} fill={color} />
        </>
      );
    case 'autopilot':
      return (
        <>
          <Rect
            x={2}
            y={6}
            width={20}
            height={12}
            rx={3}
            stroke={color}
            strokeWidth={2}
            fill="none"
          />
          <SvgText x={12} y={15.2} fontSize={9} fontWeight="bold" fill={color} textAnchor="middle">
            AP
          </SvgText>
        </>
      );
    case 'navigation':
      return (
        <>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
          {/* Four ticks, one per cardinal point on the compass rose. */}
          <Line x1={12} y1={3} x2={12} y2={5.5} stroke={color} strokeWidth={2} />
          <Line x1={12} y1={18.5} x2={12} y2={21} stroke={color} strokeWidth={2} />
          <Line x1={3} y1={12} x2={5.5} y2={12} stroke={color} strokeWidth={2} />
          <Line x1={18.5} y1={12} x2={21} y2={12} stroke={color} strokeWidth={2} />
          {/* A course arrow through the centre, pointing north. */}
          <Polygon points="12,5 9.5,12 12,10 14.5,12" fill={color} />
          <Line x1={12} y1={10} x2={12} y2={18} stroke={color} strokeWidth={2} />
        </>
      );
    case 'flight-data':
      return (
        <>
          <Line x1={3} y1={7} x2={21} y2={7} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Line
            x1={3}
            y1={12}
            x2={21}
            y2={12}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Line
            x1={3}
            y1={17}
            x2={21}
            y2={17}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </>
      );
    case 'setup':
      return (
        <>
          <Polygon points={GEAR_OUTLINE} stroke={color} strokeWidth={2} fill="none" />
          <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} fill="none" />
        </>
      );
    default:
      return <Circle cx={12} cy={12} r={3} fill={color} />;
  }
}
