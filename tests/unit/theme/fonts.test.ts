import type { loadAvionicsFonts as LoadAvionicsFonts } from '@/platform/fonts';

describe('typography', () => {
  afterEach(() => {
    jest.dontMock('@expo-google-fonts/b612');
    jest.dontMock('@expo-google-fonts/b612-mono');
    jest.resetModules();
  });

  it('names the B612 families without loading the font packages', () => {
    jest.isolateModules(() => {
      // Importing either package would pull in expo-font eagerly, outside loadAvionicsFonts's catch.
      jest.doMock('@expo-google-fonts/b612', () => {
        throw new Error('font package imported eagerly');
      });
      jest.doMock('@expo-google-fonts/b612-mono', () => {
        throw new Error('font package imported eagerly');
      });
      const { withAvionicsFonts } =
        require('@/theme/typography') as typeof import('@/theme/typography');
      const { lightTheme } = require('@/theme/tokens') as typeof import('@/theme/tokens');
      expect(withAvionicsFonts(lightTheme).typography.fonts).toEqual({
        avionics: 'B612_400Regular',
        avionicsBold: 'B612_700Bold',
        mono: 'B612Mono_400Regular',
        monoBold: 'B612Mono_700Bold',
      });
    });
  });
});

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
