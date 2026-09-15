import type { AvionixError } from '@/domain/errors/avionix-error';

/** Bare DNS-SD service type of the Avionix Connector (`_avionix._tcp` on the wire). */
export const AVIONIX_SERVICE_TYPE = 'avionix';

/** A resolved DNS-SD service as the platform browser reports it. */
export interface BrowsedService {
  /** Instance name, unique on the LAN. */
  name: string;
  /** Advertised hostname, usually with a trailing dot (`sim-pc.local.`); may be empty. */
  host: string;
  port: number;
  /** IPv4 and IPv6 literals, in the order the platform reported them. */
  addresses: string[];
  txt: Record<string, string>;
}

export interface ServiceBrowserListener {
  resolved(service: BrowsedService): void;
  removed(name: string): void;
  error(error: AvionixError): void;
}

/**
 * `available`: a native browser is present. `needsDevBuild`: native platform but the native
 * module is missing (Expo Go). `unsupported`: the platform has no mDNS browsing at all (web).
 */
export type ServiceBrowserAvailability = 'available' | 'needsDevBuild' | 'unsupported';

/** Generic DNS-SD browsing. Nothing here knows about Avionix except the constant above. */
export interface ServiceBrowser {
  readonly availability: ServiceBrowserAvailability;
  /** Starts browsing the bare `type` (e.g. `'avionix'`); the returned function stops it. */
  browse(type: string, listener: ServiceBrowserListener): () => void;
}
