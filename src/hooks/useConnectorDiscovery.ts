import { useEffect, useSyncExternalStore } from 'react';

import type { DiscoverySnapshot } from '@/application/connector-discovery';
import { useServices } from '@/app/services-context';
import type { ConnectionState } from '@/domain/connection/connection-state';
import { useAppForeground } from '@/hooks/useAppForeground';

/** Discovery runs, and its list is shown, only while a tap on a row could act. */
export function isDiscoveryState(state: ConnectionState): boolean {
  return state === 'disconnected' || state === 'error';
}

export function useConnectorDiscovery(sessionState: ConnectionState): DiscoverySnapshot {
  const { discovery } = useServices();
  const snapshot = useSyncExternalStore(discovery.store.subscribe, discovery.store.getSnapshot);
  const foreground = useAppForeground();
  const shouldScan = foreground && isDiscoveryState(sessionState);

  useEffect(() => {
    if (!shouldScan) {
      return;
    }
    discovery.start();
    return () => discovery.stop();
  }, [discovery, shouldScan]);

  return snapshot;
}
