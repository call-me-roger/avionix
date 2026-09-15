import { Platform } from 'react-native';

import type { ConnectionSettings } from '@/application/settings-store';

/**
 * On the web the app is normally served by the Avionix bridge on the X-Plane PC, so the
 * page's own origin is the right default target. Native platforms have no sensible default.
 */
export function platformDefaultConnection(): ConnectionSettings | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) {
    return null;
  }
  const { hostname, port, protocol } = window.location;
  if (hostname.length === 0) {
    return null;
  }
  const parsedPort = Number(port);
  return {
    host: hostname,
    port:
      Number.isInteger(parsedPort) && parsedPort > 0
        ? parsedPort
        : protocol === 'https:'
          ? 443
          : 80,
  };
}
