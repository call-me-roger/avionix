import { subscribeHardwareKeys } from '@/platform/hardware-keys';

describe('hardware-keys adapter (native)', () => {
  it('returns an unsubscribe function and never calls the handler', () => {
    const handler = jest.fn(() => true);
    const unsubscribe = subscribeHardwareKeys(handler);
    expect(typeof unsubscribe).toBe('function');
    expect(handler).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
