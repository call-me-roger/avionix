import { useCallback, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

import type { LatLon } from '@/domain/map/map-data';
import { project, unproject } from '@/domain/map/projection';
import { type MapView, screenDeltaToPlane } from '@/domain/map/view';

/** Spec §4.4 and ruling 7. */
export const AUTO_CENTRE_MS = 30_000;
/** Below this many pixels a touch is a tap, not a drag. */
const DRAG_SLOP_PX = 6;

interface Drag {
  startX: number;
  startY: number;
  /** The centre and anchor when the finger went down: the drag is measured from them. */
  from: LatLon;
  anchor: LatLon;
  moved: boolean;
}

export interface ResponderHandlers {
  onStartShouldSetResponder: () => boolean;
  onResponderGrant: (event: GestureResponderEvent) => void;
  onResponderMove: (event: GestureResponderEvent) => void;
  onResponderRelease: () => void;
  onResponderTerminate: () => void;
}

/**
 * Spec §4.4: a drag moves the map's centre to a geographic point; Centre, or 30 s without a touch,
 * hands it back to the ownship. Local state only: nothing here reaches the simulator.
 */
export function useMapPan({
  now,
  view,
  anchor,
  ownship,
}: {
  now: number;
  view: MapView | null;
  anchor: LatLon | null;
  ownship: LatLon | null;
}): { centre: LatLon | null; panned: boolean; recentre: () => void; handlers: ResponderHandlers } {
  const [panCentre, setPanCentre] = useState<LatLon | null>(null);
  const [lastTouchAt, setLastTouchAt] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Auto-centre: adjusted during render on the panel's own 1 s clock (no timer of our own).
  if (
    panCentre !== null &&
    drag === null &&
    lastTouchAt !== null &&
    now - lastTouchAt >= AUTO_CENTRE_MS
  ) {
    setPanCentre(null);
    setLastTouchAt(null);
  }

  const recentre = useCallback(() => {
    setPanCentre(null);
    setLastTouchAt(null);
  }, []);

  const handlers: ResponderHandlers = {
    onStartShouldSetResponder: () => view !== null && ownship !== null,
    onResponderGrant: (event) => {
      const from = panCentre ?? ownship;
      if (from === null || anchor === null) {
        return;
      }
      setDrag({
        startX: event.nativeEvent.pageX,
        startY: event.nativeEvent.pageY,
        from,
        anchor,
        moved: false,
      });
    },
    onResponderMove: (event) => {
      if (drag === null || view === null) {
        return;
      }
      const dx = event.nativeEvent.pageX - drag.startX;
      const dy = event.nativeEvent.pageY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) {
        return;
      }
      // The map follows the finger, so its centre moves the other way.
      const delta = screenDeltaToPlane(view, dx, dy);
      const start = project(drag.anchor, drag.from);
      setPanCentre(unproject(drag.anchor, { x: start.x - delta.x, y: start.y - delta.y }));
      setLastTouchAt(now);
      if (!drag.moved) {
        setDrag({ ...drag, moved: true });
      }
    },
    onResponderRelease: () => {
      if (drag?.moved) {
        setLastTouchAt(now);
      }
      setDrag(null);
    },
    onResponderTerminate: () => setDrag(null),
  };

  // Without an ownship there is nothing to draw around, panned or not.
  if (ownship === null) {
    return { centre: null, panned: false, recentre, handlers };
  }
  return { centre: panCentre ?? ownship, panned: panCentre !== null, recentre, handlers };
}
