import { NativeModules } from 'react-native';
import Zeroconf from 'react-native-zeroconf';

import type { ServiceBrowser } from '@/domain/discovery/service-browser';
import { createNullServiceBrowser } from '@/infrastructure/discovery/null-service-browser';
import { createZeroconfServiceBrowser } from '@/infrastructure/discovery/zeroconf-service-browser';
import type { Logger } from '@/infrastructure/logging/logger';

/**
 * Native platforms. react-native-zeroconf reads `NativeModules.RNZeroconf` and only fails when
 * `scan()` is called, so its presence is checked here instead: Expo Go has no native module and
 * gets the null browser tagged `needsDevBuild`. This is the only file that imports the library.
 */
export function createPlatformServiceBrowser(logger: Logger): ServiceBrowser {
  const nativeModules: Record<string, unknown> = NativeModules;
  if (nativeModules.RNZeroconf === undefined || nativeModules.RNZeroconf === null) {
    logger.info('RNZeroconf native module missing; discovery needs a development build');
    return createNullServiceBrowser('needsDevBuild');
  }
  return createZeroconfServiceBrowser({ createZeroconf: () => new Zeroconf(), logger });
}
