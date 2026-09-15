import { NativeModules } from 'react-native';

import { silentLogger } from '@/infrastructure/logging/logger';
import { createPlatformServiceBrowser } from '@/platform/service-browser';

describe('createPlatformServiceBrowser (native)', () => {
  afterEach(() => {
    delete NativeModules.RNZeroconf;
  });

  it('falls back to the needsDevBuild null browser when the native module is missing', () => {
    expect(createPlatformServiceBrowser(silentLogger).availability).toBe('needsDevBuild');
  });

  it('uses the zeroconf browser when the native module is present', () => {
    NativeModules.RNZeroconf = { scan: () => undefined, stop: () => undefined };
    expect(createPlatformServiceBrowser(silentLogger).availability).toBe('available');
  });
});
