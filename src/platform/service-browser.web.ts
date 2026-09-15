import type { ServiceBrowser } from '@/domain/discovery/service-browser';
import { createNullServiceBrowser } from '@/infrastructure/discovery/null-service-browser';
import type { Logger } from '@/infrastructure/logging/logger';

/** Browsers cannot browse mDNS. This file must never import react-native-zeroconf. */
export function createPlatformServiceBrowser(logger: Logger): ServiceBrowser {
  logger.debug('connector discovery is unsupported on the web');
  return createNullServiceBrowser('unsupported');
}
