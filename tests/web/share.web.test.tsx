import { shareText } from '@/platform/share';

describe('shareText on web', () => {
  it('copies to the clipboard', async () => {
    const writeText = jest.fn(async () => undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    });
    await shareText('diagnostics', 'Avionix');
    expect(writeText).toHaveBeenCalledWith('diagnostics');
  });

  it('does not throw when no clipboard is available', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    await expect(shareText('diagnostics', 'Avionix')).resolves.toBeUndefined();
  });
});
