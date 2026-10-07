import { LEAN_OFF, LeanStore } from '@/features/panels/engines/lean-store';

describe('LeanStore (spec §4.6)', () => {
  it('turns on for an aircraft with no peaks, and off clearing them', () => {
    const store = new LeanStore();
    expect(store.getSnapshot()).toBe(LEAN_OFF);
    store.toggle('C172');
    expect(store.getSnapshot()).toEqual({ on: true, aircraft: 'C172', peaks: {} });
    store.advance('C172', [{ engine: 1, value: 1320 }]);
    store.toggle('C172');
    expect(store.getSnapshot()).toBe(LEAN_OFF);
  });

  it('raises peaks while on, ignores samples while off, and notifies only on a change', () => {
    const store = new LeanStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.advance('C172', [{ engine: 1, value: 1320 }]);
    expect(listener).not.toHaveBeenCalled();
    store.toggle('C172');
    store.advance('C172', [{ engine: 1, value: 1320 }]);
    store.advance('C172', [{ engine: 1, value: 1300 }]);
    expect(store.getSnapshot().peaks).toEqual({ 1: 1320 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('starts fresh for a different aircraft (Review Focus 4)', () => {
    const store = new LeanStore();
    store.toggle('C172');
    store.advance('C172', [{ engine: 1, value: 1350 }]);
    store.advance('PA28', [{ engine: 1, value: 1300 }]);
    expect(store.getSnapshot()).toEqual({ on: true, aircraft: 'PA28', peaks: { 1: 1300 } });
  });

  it('stops notifying an unsubscribed listener', () => {
    const store = new LeanStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.toggle(null);
    expect(listener).not.toHaveBeenCalled();
  });
});
