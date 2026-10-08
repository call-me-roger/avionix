import React, { memo, useMemo } from 'react';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import type { Direction } from '@/domain/map/direction';
import type { MapLayers } from '@/features/panels/map/map-layers';
import { type MapView, groupTransform, toScreen } from '@/domain/map/view';
import type { PlanePoint } from '@/domain/map/projection';
import { LAST_KNOWN } from '@/domain/map/messages';
import { useTheme } from '@/theme/theme-context';

/** An aircraft seen from above, nose up, 24 units long, centred on its middle. */
const AIRCRAFT =
  '0,-12 2,-4 11,1 11,3 2,1 2,8 5,10 5,12 0,11 -5,12 -5,10 -2,8 -2,1 -11,3 -11,1 -2,-4';

/** Static layers: they change only with the anchor, the density or the scale. */
const BaseLayers = memo(function BaseLayers({
  layers,
  pxPerNm,
}: {
  layers: MapLayers;
  pxPerNm: number;
}) {
  const { map } = useTheme();
  return (
    <>
      <Path d={layers.land} fill={map.land} fillRule="evenodd" />
      <Path d={layers.lakes} fill={map.water} fillRule="evenodd" />
      <Path
        d={layers.borders}
        stroke={map.border}
        strokeWidth={1 / pxPerNm}
        strokeDasharray={`${4 / pxPerNm} ${3 / pxPerNm}`}
        fill="none"
      />
      {layers.runways.map((runway) => (
        <Line
          key={runway.key}
          testID="map-runway"
          x1={runway.from.x}
          y1={runway.from.y}
          x2={runway.to.x}
          y2={runway.to.y}
          stroke={map.runway}
          strokeWidth={runway.width}
          strokeLinecap="butt"
        />
      ))}
    </>
  );
});

export interface MapCanvasProps {
  width: number;
  height: number;
  view: MapView;
  layers: MapLayers;
  /** The map centre in anchor-plane NM. */
  centre: PlanePoint;
  /** The ownship in anchor-plane NM. */
  ownship: PlanePoint;
  direction: Direction;
  live: boolean;
  outerLabel: string;
  innerLabel: string;
}

export function MapCanvas({
  width,
  height,
  view,
  layers,
  centre,
  ownship,
  direction,
  live,
  outerLabel,
  innerLabel,
}: MapCanvasProps) {
  const { map } = useTheme();
  const own = toScreen(view, { x: ownship.x - centre.x, y: ownship.y - centre.y });
  const symbolAngle = direction.degrees === null ? 0 : direction.degrees + view.rotation;
  const labels = useMemo(
    () =>
      layers.labels.map((label) => ({
        ...label,
        screen: toScreen(view, { x: label.at.x - centre.x, y: label.at.y - centre.y }),
      })),
    [layers.labels, view, centre],
  );
  const ink = live ? map.ownship : map.stale;
  return (
    <Svg testID="map-canvas" width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={map.water} />
      <G transform={groupTransform(view, centre)}>
        <BaseLayers layers={layers} pxPerNm={view.pxPerNm} />
      </G>
      {labels.map((label) => (
        <SvgText
          key={label.key}
          testID="map-airport"
          x={label.screen.x + 6}
          y={label.screen.y - 6}
          fill={map.label}
          fontSize={12}
        >
          {label.ident}
        </SvgText>
      ))}
      <Circle
        testID="map-ring-outer"
        cx={own.x}
        cy={own.y}
        r={view.ringRadiusPx}
        stroke={map.ring}
        strokeWidth={1}
        fill="none"
      />
      <Circle
        testID="map-ring-inner"
        cx={own.x}
        cy={own.y}
        r={view.ringRadiusPx / 2}
        stroke={map.ring}
        strokeWidth={1}
        strokeDasharray="4 4"
        fill="none"
      />
      <SvgText
        testID="map-ring-outer-label"
        x={own.x + view.ringRadiusPx * 0.71 + 4}
        y={own.y - view.ringRadiusPx * 0.71}
        fill={map.ring}
        fontSize={12}
      >
        {outerLabel}
      </SvgText>
      <SvgText
        testID="map-ring-inner-label"
        x={own.x + view.ringRadiusPx * 0.355 + 4}
        y={own.y - view.ringRadiusPx * 0.355}
        fill={map.ring}
        fontSize={12}
      >
        {innerLabel}
      </SvgText>
      {view.trackUp ? (
        <G testID="map-north-arrow" transform={`translate(24 24) rotate(${view.rotation})`}>
          <Polygon points="0,-12 5,4 0,1 -5,4" fill={map.label} />
          <SvgText x={0} y={18} fill={map.label} fontSize={11} textAnchor="middle">
            N
          </SvgText>
        </G>
      ) : null}
      {direction.degrees === null ? (
        <Circle
          testID="map-ownship-circle"
          cx={own.x}
          cy={own.y}
          r={7}
          stroke={ink}
          strokeWidth={2}
          fill={live ? ink : 'none'}
        />
      ) : (
        <G testID="map-ownship" transform={`translate(${own.x} ${own.y}) rotate(${symbolAngle})`}>
          <Polygon points={AIRCRAFT} fill={live ? ink : 'none'} stroke={ink} strokeWidth={1.5} />
        </G>
      )}
      {live ? null : (
        <SvgText
          testID="map-ownship-stale"
          x={own.x}
          y={own.y + 26}
          fill={map.stale}
          fontSize={11}
          textAnchor="middle"
        >
          {LAST_KNOWN}
        </SvgText>
      )}
    </Svg>
  );
}
