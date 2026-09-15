import { silentLogger } from '@/infrastructure/logging/logger';
import { createPlatformServiceBrowser } from '@/platform/service-browser';

describe('createPlatformServiceBrowser (web)', () => {
  it('is the unsupported null browser', () => {
    const browser = createPlatformServiceBrowser(silentLogger);
    expect(browser.availability).toBe('unsupported');
    const stop = browser.browse('avionix', {
      resolved: () => undefined,
      removed: () => undefined,
      error: () => undefined,
    });
    expect(() => stop()).not.toThrow();
  });
});
