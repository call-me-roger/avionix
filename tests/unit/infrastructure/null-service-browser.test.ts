import { createNullServiceBrowser } from '@/infrastructure/discovery/null-service-browser';

describe('createNullServiceBrowser', () => {
  it('carries the availability it was given and never calls the listener', () => {
    const browser = createNullServiceBrowser('needsDevBuild');
    expect(browser.availability).toBe('needsDevBuild');
    expect(createNullServiceBrowser('unsupported').availability).toBe('unsupported');
    const listener = { resolved: jest.fn(), removed: jest.fn(), error: jest.fn() };
    const stop = browser.browse('avionix', listener);
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
    expect(listener.resolved).not.toHaveBeenCalled();
    expect(listener.removed).not.toHaveBeenCalled();
    expect(listener.error).not.toHaveBeenCalled();
  });
});
