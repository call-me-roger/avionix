import type { haptics as Haptics } from '@/platform/haptics';

function mockHapticsModule() {
  return {
    impactAsync: jest.fn().mockResolvedValue(undefined),
    notificationAsync: jest.fn().mockResolvedValue(undefined),
    ImpactFeedbackStyle: { Light: 'light' },
    NotificationFeedbackType: { Error: 'error' },
  };
}

describe('haptics adapter', () => {
  it('press() calls impactAsync(light)', async () => {
    await jest.isolateModulesAsync(async () => {
      const mock = mockHapticsModule();
      jest.doMock('expo-haptics', () => mock);
      const { haptics } = require('@/platform/haptics') as { haptics: typeof Haptics };
      haptics.press();
      await Promise.resolve();
      expect(mock.impactAsync).toHaveBeenCalledWith('light');
    });
  });

  it('failure() calls notificationAsync(error)', async () => {
    await jest.isolateModulesAsync(async () => {
      const mock = mockHapticsModule();
      jest.doMock('expo-haptics', () => mock);
      const { haptics } = require('@/platform/haptics') as { haptics: typeof Haptics };
      haptics.failure();
      await Promise.resolve();
      expect(mock.notificationAsync).toHaveBeenCalledWith('error');
    });
  });

  it('press() neither throws nor leaves an unhandled rejection when impactAsync rejects', async () => {
    await jest.isolateModulesAsync(async () => {
      const mock = {
        impactAsync: jest.fn().mockRejectedValue(new Error('no native module')),
        notificationAsync: jest.fn().mockResolvedValue(undefined),
        ImpactFeedbackStyle: { Light: 'light' },
        NotificationFeedbackType: { Error: 'error' },
      };
      jest.doMock('expo-haptics', () => mock);
      const { haptics } = require('@/platform/haptics') as { haptics: typeof Haptics };
      expect(() => haptics.press()).not.toThrow();
      // Flush the microtask queue so the rejection above is observed and swallowed.
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('press() and failure() are silent no-ops when expo-haptics cannot be required', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('expo-haptics', () => {
        throw new Error('no native module');
      });
      const { haptics } = require('@/platform/haptics') as { haptics: typeof Haptics };
      expect(() => haptics.press()).not.toThrow();
      expect(() => haptics.failure()).not.toThrow();
      await Promise.resolve();
    });
  });
});
