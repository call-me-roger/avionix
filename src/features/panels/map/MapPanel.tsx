import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { headingText } from '@/domain/instruments/geometry';
import { FEATURE_MOVING_MAP, MAP_RANGES, type MapOrientation } from '@/domain/map/catalogue';
import { densityFor } from '@/domain/map/density';
import { type Direction, chooseDirection } from '@/domain/map/direction';
import { type LatLon, cellsAround } from '@/domain/map/map-data';
import { rangeLabel, spokenPosition } from '@/domain/map/map-format';
import { type MapModel, mapModel } from '@/domain/map/map-model';
import {
  MAP_CREDIT,
  TRACK_NOT_AVAILABLE,
  WAITING_FOR_POSITION,
  mapUnavailable,
} from '@/domain/map/messages';
import { project, rangeInNm } from '@/domain/map/projection';
import { mapView, needsReanchor } from '@/domain/map/view';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import type { DistanceUnit } from '@/domain/units/units';
import { MapCanvas } from '@/features/panels/map/MapCanvas';
import { MapReadout } from '@/features/panels/map/MapReadout';
import { useMapPreference } from '@/features/panels/map/MapPreferenceProvider';
import { buildLayers } from '@/features/panels/map/map-layers';
import { mapReader } from '@/features/panels/map/map-reader';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { aircraftName } from '@/features/panels/systems/availability';
import { useUnits } from '@/features/units/UnitsProvider';
import { bundledMapData } from '@/infrastructure/map/bundled-map-data';
import { BodyText } from '@/theme/primitives';
import { useTheme } from '@/theme/theme-context';

export const MAP_PANEL: PanelDescriptor = {
  id: 'map',
  title: 'Map',
  features: [FEATURE_MOVING_MAP],
  supports: EVERYWHERE,
  fillsFrame: true,
};

/** F-13. Read only (R12): nothing here writes or activates. */
export function MapPanel() {
  const { snapshot } = usePanel();
  const model = mapModel(mapReader(snapshot));
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  if (model.status === 'unchecked') {
    return null;
  }
  if (model.status === 'unavailable') {
    return <BodyText testID="map-message">{mapUnavailable(aircraftName(snapshot))}</BodyText>;
  }
  return (
    <MapContent
      model={noFlight ? { ...model, status: 'waiting', position: null } : model}
      noFlight={noFlight}
    />
  );
}

/** Where the layers were built: they are rebuilt only when this changes (spec §4.3). */
interface Anchor {
  at: LatLon;
  rangeNm: number;
  rangeIndex: number;
  pxPerNm: number;
  /** The view's reach when the anchor was set: how far the drawn cells must go. */
  visibleRadiusNm: number;
}

const UNIT_WORD: Record<DistanceUnit, string> = { nm: 'nautical mile', km: 'kilometre' };

/** Spec §4.8: the map is one image with one sentence. */
function describeMap(
  orientation: MapOrientation,
  range: number,
  unitWord: string,
  model: MapModel,
  direction: Direction,
  live: boolean,
): string {
  const parts = [
    `Map, ${orientation === 'track' && direction.degrees !== null ? 'track up' : 'north up'}`,
    `${range} ${unitWord} range`,
  ];
  if (model.position !== null) {
    parts.push(`position ${spokenPosition(model.position.lat, model.position.lon)}`);
  }
  if (direction.degrees !== null) {
    parts.push(`${direction.source} ${headingText(direction.degrees)}`);
  }
  if (!live) {
    parts.push('last known position');
  }
  return parts.join(', ');
}

function MapContent({ model, noFlight }: { model: MapModel; noFlight: boolean }) {
  const theme = useTheme();
  const { link } = usePanel();
  const { units } = useUnits();
  const [preference] = useMapPreference();
  const window = useWindowDimensions();

  // 1. The map area. Until the first layout pass, assume the frame's padding and half the
  // window's height; tests never run a layout pass.
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const { width, height } = measured ?? {
    width: window.width - theme.spacing.lg * 2,
    height: Math.round(window.height * 0.5),
  };

  // 2. Track while moving, heading while standing, with the hysteresis remembered.
  const [wasTrack, setWasTrack] = useState(false);
  const direction = chooseDirection(
    {
      trueTrack: model.trueTrack,
      trueHeading: model.trueHeading,
      groundSpeedKt: model.groundSpeedKt,
    },
    wasTrack,
  );
  const isTrack = direction.source === 'track';
  if (isTrack !== wasTrack) {
    setWasTrack(isTrack);
  }

  // 3. The range, in the pilot's unit, and the density it draws.
  const rangeNm = rangeInNm(preference.range, units.distance);
  const rangeIndex = MAP_RANGES.indexOf(preference.range);

  // 4. The view.
  const view = mapView({
    width,
    height,
    orientation: preference.orientation,
    rangeNm,
    direction: direction.degrees,
  });

  // 5. The anchor, moved only by a quarter-range drift, a range or density change, a new scale,
  // or a view that reaches farther than the cells built for it (a turn to track-up).
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const centre = model.position;
  if (
    centre !== null &&
    view !== null &&
    (anchor === null ||
      needsReanchor(anchor.at, centre, rangeNm) ||
      anchor.rangeNm !== rangeNm ||
      anchor.rangeIndex !== rangeIndex ||
      Math.abs(anchor.pxPerNm - view.pxPerNm) / view.pxPerNm > 0.01 ||
      view.visibleRadiusNm > anchor.visibleRadiusNm * 1.01)
  ) {
    setAnchor({
      at: centre,
      rangeNm,
      rangeIndex,
      pxPerNm: view.pxPerNm,
      visibleRadiusNm: view.visibleRadiusNm,
    });
  }

  // 6. The layers, built only when the anchor moves.
  const layers = useMemo(() => {
    if (anchor === null) {
      return null;
    }
    const keys = cellsAround(anchor.at, anchor.visibleRadiusNm + anchor.rangeNm / 4);
    const data = bundledMapData();
    const cells = keys.map((key) => data.cell(key));
    return buildLayers(cells, keys, anchor.at, densityFor(anchor.rangeIndex), anchor.pxPerNm);
  }, [anchor]);

  // 7. The map, or what stands in for it.
  const drawn = centre !== null && view !== null && anchor !== null && layers !== null;
  let body: React.ReactNode = null;
  if (drawn) {
    body = (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={describeMap(
          preference.orientation,
          preference.range,
          UNIT_WORD[units.distance],
          model,
          direction,
          link.valuesCurrent,
        )}
      >
        <MapCanvas
          width={width}
          height={height}
          view={view}
          layers={layers}
          centre={project(anchor.at, centre)}
          ownship={project(anchor.at, centre)}
          direction={direction}
          live={link.valuesCurrent}
          outerLabel={rangeLabel(preference.range, units.distance)}
          innerLabel={rangeLabel(preference.range / 2, units.distance)}
        />
      </View>
    );
  } else if (centre === null && !noFlight) {
    // With a position but no room yet (a 0×0 layout), the area stays empty: nothing is awaited.
    body = <BodyText testID="map-message">{WAITING_FOR_POSITION}</BodyText>;
  }

  // 8. Under the map.
  return (
    <>
      <View
        testID="map-area"
        style={{ flex: 1 }}
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          setMeasured({ width: w, height: h });
        }}
      >
        {body}
      </View>
      {drawn && direction.source === 'none' ? (
        <BodyText muted>{TRACK_NOT_AVAILABLE}</BodyText>
      ) : null}
      <MapReadout />
      <BodyText muted testID="map-credit">
        {MAP_CREDIT}
      </BodyText>
    </>
  );
}
