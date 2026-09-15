import { isValidIpv4 } from '@/domain/connection/connection-config';
import type { BrowsedService } from '@/domain/discovery/service-browser';

export interface DiscoveredConnector {
  /** DNS-SD instance name, unique on the LAN; the list key. */
  name: string;
  /** IPv4 address when advertised, else the advertised hostname without its trailing dot. */
  host: string;
  port: number;
  /** From the `pairing` TXT record: `'1'` → true, `'0'` → false, anything else → null. */
  pairingRequired: boolean | null;
}

function pairingFlag(txt: Record<string, string>): boolean | null {
  const value = txt.pairing;
  if (value === '1') {
    return true;
  }
  if (value === '0') {
    return false;
  }
  return null;
}

function usableHost(service: BrowsedService): string | null {
  const ipv4 = service.addresses.find((address) => isValidIpv4(address));
  if (ipv4 !== undefined) {
    return ipv4;
  }
  const hostname = service.host.endsWith('.') ? service.host.slice(0, -1) : service.host;
  return hostname.length > 0 ? hostname : null;
}

/** Null when the service advertises neither an IPv4 address nor a hostname. */
export function discoveredConnectorFrom(service: BrowsedService): DiscoveredConnector | null {
  const host = usableHost(service);
  if (host === null) {
    return null;
  }
  return {
    name: service.name,
    host,
    port: service.port,
    pairingRequired: pairingFlag(service.txt),
  };
}
