import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_PANEL_LAYOUT,
  type PanelLayout,
  loadPanelLayout,
  savePanelLayout,
  setPanelHidden,
} from '@/application/panel-layout';
import type { SettingsStorage } from '@/application/settings-store';

/**
 * The persisted panel layout (F-04 R13). `knownIds` must be a stable reference (a module-level
 * array), or the load re-runs on every render. A change made before the stored layout arrives
 * wins over it (a change that changes nothing does not), the same rule as the theme preference.
 */
export function usePanelLayout(storage: SettingsStorage, knownIds: readonly string[]) {
  const [layout, setLayout] = useState<PanelLayout>(DEFAULT_PANEL_LAYOUT);
  const [ready, setReady] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadPanelLayout(storage, knownIds).then((stored) => {
      if (cancelled) {
        return;
      }
      // Decided in the updater, which React runs after any change queued before it, so a change
      // whose updater has not run yet (and so has not marked `touched`) still wins.
      setLayout((prev) => (touched.current ? prev : stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, knownIds]);

  const update = useCallback(
    (change: (prev: PanelLayout) => PanelLayout) => {
      setLayout((prev) => {
        const next = change(prev);
        if (next !== prev) {
          // Only a real change wins over the stored layout: a no-op (the status bar pressed on
          // Setup before the load lands) must not discard it for the whole launch.
          touched.current = true;
          // Saving from the updater keeps the write in step with the state it came from; a
          // double invocation under StrictMode writes the same value twice, which is harmless.
          void savePanelLayout(storage, next);
        }
        return next;
      });
    },
    [storage],
  );

  const setLast = useCallback(
    (route: string) => update((prev) => (prev.last === route ? prev : { ...prev, last: route })),
    [update],
  );
  const setHidden = useCallback(
    (id: string, hidden: boolean) => update((prev) => setPanelHidden(prev, knownIds, id, hidden)),
    [update, knownIds],
  );

  return { layout, ready, setLast, setHidden };
}
