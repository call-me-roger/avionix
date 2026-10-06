import type { loadAvionicsFonts as LoadAvionicsFonts } from '@/platform/fonts';

describe('loadAvionicsFonts', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-font');
  });

  it('resolves true when expo-font loads the avionics families', async () => {
    jest.doMock('expo-font', () => ({ loadAsync: jest.fn().mockResolvedValue(undefined) }));
    const { loadAvionicsFonts } = require('@/platform/fonts') as {
      loadAvionicsFonts: typeof LoadAvionicsFonts;
    };
    await expect(loadAvionicsFonts()).resolves.toBe(true);
  });

  it('resolves false and does not throw when loadAsync rejects', async () => {
    jest.doMock('expo-font', () => ({
      loadAsync: jest.fn().mockRejectedValue(new Error('load failed')),
    }));
    const { loadAvionicsFonts } = require('@/platform/fonts') as {
      loadAvionicsFonts: typeof LoadAvionicsFonts;
    };
    await expect(loadAvionicsFonts()).resolves.toBe(false);
  });

  it('resolves false when expo-font cannot be required', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('expo-font', () => {
        throw new Error('missing');
      });
      const { loadAvionicsFonts } = require('@/platform/fonts') as {
        loadAvionicsFonts: typeof LoadAvionicsFonts;
      };
      await expect(loadAvionicsFonts()).resolves.toBe(false);
    });
  });
});
