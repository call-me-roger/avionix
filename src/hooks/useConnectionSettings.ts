import { useCallback, useEffect, useState } from 'react';

import { useServices } from '@/app/services-context';
import {
  DEFAULT_CONNECTION_SETTINGS,
  loadConnectionSettings,
  saveConnectionSettings,
} from '@/application/settings-store';
import { validatePort } from '@/domain/connection/connection-config';
import { platformDefaultConnection } from '@/platform/default-connection';

export function useConnectionSettings() {
  const { settingsStorage } = useServices();
  const [host, setHost] = useState(DEFAULT_CONNECTION_SETTINGS.host);
  const [port, setPort] = useState(String(DEFAULT_CONNECTION_SETTINGS.port));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadConnectionSettings(settingsStorage).then((settings) => {
      if (cancelled) {
        return;
      }
      const isUnset =
        settings.host === DEFAULT_CONNECTION_SETTINGS.host &&
        settings.port === DEFAULT_CONNECTION_SETTINGS.port;
      const effective = isUnset ? (platformDefaultConnection() ?? settings) : settings;
      setHost(effective.host);
      setPort(String(effective.port));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [settingsStorage]);

  const persist = useCallback(async () => {
    let parsedPort: number;
    try {
      parsedPort = validatePort(port);
    } catch {
      return;
    }
    await saveConnectionSettings(settingsStorage, { host: host.trim(), port: parsedPort });
  }, [host, port, settingsStorage]);

  const setConnection = useCallback(
    async (nextHost: string, nextPort: number) => {
      setHost(nextHost);
      setPort(String(nextPort));
      // Saves the given values, not the closure's state, which still holds the previous form.
      await saveConnectionSettings(settingsStorage, { host: nextHost, port: nextPort });
    },
    [settingsStorage],
  );

  return { host, setHost, port, setPort, ready, persist, setConnection };
}
