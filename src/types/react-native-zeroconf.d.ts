declare module 'react-native-zeroconf' {
  export type ZeroconfImplType = 'NSD' | 'DNSSD';

  export const ImplType: { readonly NSD: 'NSD'; readonly DNSSD: 'DNSSD' };

  export type ZeroconfEvent =
    | 'start'
    | 'stop'
    | 'update'
    | 'found'
    | 'resolved'
    | 'remove'
    | 'error'
    | 'published'
    | 'unpublished';

  /**
   * Subset of react-native-zeroconf 0.14.0 (`dist/index.js`) used by Avionix. Event payloads
   * are `unknown` on purpose: they cross from native code and must be validated.
   */
  export default class Zeroconf {
    constructor();
    scan(type?: string, protocol?: string, domain?: string, implType?: ZeroconfImplType): void;
    stop(implType?: ZeroconfImplType): void;
    on(event: ZeroconfEvent, listener: (payload: unknown) => void): this;
    removeListener(event: ZeroconfEvent, listener: (payload: unknown) => void): this;
    removeAllListeners(event?: ZeroconfEvent): this;
    removeDeviceListeners(): void;
    getServices(): Record<string, unknown>;
  }
}
