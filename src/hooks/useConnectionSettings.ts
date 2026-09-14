import { useCallback, useEffect, useState } from 'react';

import { useServices } from '@/app/services-context';
import {
  DEFAULT_CONNECTION_SETTINGS,
  loadConnectionSettings,
  saveConnectionSettings,
} from '@/application/settings-store';
import { validatePort } from '@/domain/connection/connection-config';

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
      setHost(settings.host);
      setPort(String(settings.port));
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

  return { host, setHost, port, setPort, ready, persist };
}
