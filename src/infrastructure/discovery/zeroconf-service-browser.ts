import { z } from 'zod';

import type {
  BrowsedService,
  ServiceBrowser,
  ServiceBrowserListener,
} from '@/domain/discovery/service-browser';
import { AvionixError } from '@/domain/errors/avionix-error';
import type { Logger } from '@/infrastructure/logging/logger';

export type ZeroconfEventName = 'resolved' | 'remove' | 'error';
export type ZeroconfEventHandler = (payload: unknown) => void;
export type ZeroconfImplType = 'NSD' | 'DNSSD';

/** The subset of react-native-zeroconf's `Zeroconf` class this adapter uses. */
export interface ZeroconfLike {
  scan(type: string, protocol: string, domain: string, implType: ZeroconfImplType): void;
  stop(implType: ZeroconfImplType): void;
  on(event: ZeroconfEventName, handler: ZeroconfEventHandler): unknown;
  removeListener(event: ZeroconfEventName, handler: ZeroconfEventHandler): unknown;
  removeDeviceListeners(): void;
}

/**
 * Android only (the library ignores it on iOS). `NSD` is the platform API; `DNSSD` is the
 * library's embedded mDNSResponder, the alternative if NSD misbehaves on a device.
 */
export const ANDROID_IMPL_TYPE: ZeroconfImplType = 'NSD';

/**
 * Shape of a `resolved` event payload from the native side (`name`, `fullName`, `host`, `port`,
 * `addresses`, `txt`). `addresses` and `txt` fall back to empty on any problem so that a
 * strange TXT record cannot hide a connector; `name` and `port` problems drop the payload. `txt`
 * accepts any value per key so that one non-string entry does not drop the whole map (a valid
 * `pairing=1` alongside a stray non-string key is still usable); non-string values are filtered
 * out when building the `BrowsedService`.
 */
export const resolvedServiceSchema = z.object({
  name: z.string().min(1),
  host: z.string().catch(''),
  port: z.number().int().min(1).max(65535),
  addresses: z.array(z.string()).catch([]),
  txt: z.record(z.string(), z.unknown()).catch({}),
});

function stringTxtEntries(txt: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(txt)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function discoveryError(cause: unknown): AvionixError {
  return new AvionixError({
    code: 'DISCOVERY_ERROR',
    message: `Connector discovery failed: ${reason(cause)}`,
    cause,
  });
}

export function createZeroconfServiceBrowser(deps: {
  createZeroconf: () => ZeroconfLike;
  logger: Logger;
}): ServiceBrowser {
  return {
    availability: 'available',
    browse(type: string, listener: ServiceBrowserListener): () => void {
      let stopped = false;
      let zeroconf: ZeroconfLike;
      try {
        zeroconf = deps.createZeroconf();
      } catch (cause) {
        deps.logger.warn('zeroconf unavailable', { reason: reason(cause) });
        listener.error(discoveryError(cause));
        return () => undefined;
      }

      const onResolved: ZeroconfEventHandler = (payload) => {
        if (stopped) {
          return;
        }
        const parsed = resolvedServiceSchema.safeParse(payload);
        if (!parsed.success) {
          deps.logger.warn('dropped a malformed resolved service', {
            issues: parsed.error.issues.map((issue) => issue.path.join('.')),
          });
          return;
        }
        const service: BrowsedService = {
          name: parsed.data.name,
          host: parsed.data.host,
          port: parsed.data.port,
          addresses: parsed.data.addresses,
          txt: stringTxtEntries(parsed.data.txt),
        };
        listener.resolved(service);
      };
      const onRemove: ZeroconfEventHandler = (payload) => {
        if (stopped) {
          return;
        }
        if (typeof payload === 'string' && payload.length > 0) {
          listener.removed(payload);
        }
      };
      const onError: ZeroconfEventHandler = (payload) => {
        if (stopped) {
          return;
        }
        deps.logger.warn('zeroconf reported an error', { reason: reason(payload) });
        listener.error(discoveryError(payload));
      };

      const stop = (): void => {
        if (stopped) {
          return;
        }
        stopped = true;
        try {
          zeroconf.stop(ANDROID_IMPL_TYPE);
        } catch (cause) {
          deps.logger.warn('zeroconf stop failed', { reason: reason(cause) });
        }
        zeroconf.removeListener('resolved', onResolved);
        zeroconf.removeListener('remove', onRemove);
        zeroconf.removeListener('error', onError);
        zeroconf.removeDeviceListeners();
      };

      zeroconf.on('resolved', onResolved);
      zeroconf.on('remove', onRemove);
      zeroconf.on('error', onError);
      try {
        zeroconf.scan(type, 'tcp', 'local.', ANDROID_IMPL_TYPE);
      } catch (cause) {
        deps.logger.warn('zeroconf scan failed', { reason: reason(cause) });
        stop();
        listener.error(discoveryError(cause));
      }
      return stop;
    },
  };
}
