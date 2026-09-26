import { useCallback, useSyncExternalStore } from 'react';

import { useServices } from '@/app/services-context';
import type { SessionSnapshot } from '@/application/session-snapshot';
import type { DataRefValue } from '@/domain/simulator/types';

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
  const write = useCallback(
    (featureId: string, name: string, value: DataRefValue) => session.write(featureId, name, value),
    [session],
  );
  const activate = useCallback(
    (featureId: string, name: string, durationSec?: number) =>
      // Forwarded only when given: an explicit `undefined` third argument is a different call
      // than a two-argument one to a mock, and callers that never hold a command must still be
      // able to assert exactly which binding they pressed.
      durationSec === undefined
        ? session.activate(featureId, name)
        : session.activate(featureId, name, durationSec),
    [session],
  );
  const recheckCompatibility = useCallback(() => session.recheckCompatibility(), [session]);
  const setDemand = useCallback(
    (featureIds: readonly string[]) => session.setDemand(featureIds),
    [session],
  );
  return {
    snapshot,
    connect,
    disconnect,
    pair,
    write,
    activate,
    recheckCompatibility,
    setDemand,
  };
}
