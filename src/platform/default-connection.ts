import { Platform } from 'react-native';

import type { ConnectionSettings } from '@/application/settings-store';

/**
 * On the web the app is normally served by the Avionix bridge on the X-Plane PC, so the
 * page's own origin is the right default target. Native platforms have no sensible default.
 * The bridge only speaks plain http/ws, so a page served over https must get no prefill.
 */
export function platformDefaultConnection(
  location: Pick<Location, 'hostname' | 'port' | 'protocol'> | undefined = typeof window ===
  'undefined'
    ? undefined
    : window.location,
): ConnectionSettings | null {
  if (Platform.OS !== 'web' || location === undefined) {
    return null;
  }
  const { hostname, port, protocol } = location;
  if (protocol !== 'http:' || hostname.length === 0) {
    return null;
  }
  const parsedPort = Number(port);
  return {
    host: hostname,
    port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 80,
  };
}
