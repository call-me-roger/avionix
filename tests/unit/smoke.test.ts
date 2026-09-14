describe('node test project', () => {
  it('runs TypeScript and exposes Node networking globals', () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
    expect(typeof fetch).toBe('function');
    expect(typeof WebSocket).toBe('function');
  });
});
