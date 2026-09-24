import { useCallback, useSyncExternalStore } from 'react';

import { useServices } from '@/app/services-context';
import type { SessionSnapshot } from '@/application/session-snapshot';

export function useSimulatorSession() {
  const { session } = useServices();
  const snapshot: SessionSnapshot = useSyncExternalStore(
    session.store.subscribe,
    session.store.getSnapshot,
  );
  const connect = useCallback(
    (host: string, port: string) => session.connect(host, port),
    [session],
  );
  const disconnect = useCallback(() => session.disconnect(), [session]);
  const pair = useCallback((code: string) => session.pair(code), [session]);
  const writeHeading = useCallback((value: number) => session.writeHeading(value), [session]);
  const activateHeadingUp = useCallback(() => session.activateHeadingUp(), [session]);
  const recheckCompatibility = useCallback(() => session.recheckCompatibility(), [session]);
  return {
    snapshot,
    connect,
    disconnect,
    pair,
    writeHeading,
    activateHeadingUp,
    recheckCompatibility,
  };
}
