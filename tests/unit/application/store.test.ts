import { Store } from '@/application/store';

describe('Store', () => {
  it('returns the current snapshot and notifies subscribers on change', () => {
    const store = new Store({ count: 0 });
    const seen: number[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot().count));
    store.setState((prev) => ({ count: prev.count + 1 }));
    store.setState((prev) => ({ count: prev.count + 1 }));
    unsubscribe();
    store.setState((prev) => ({ count: prev.count + 1 }));
    expect(seen).toEqual([1, 2]);
    expect(store.getSnapshot()).toEqual({ count: 3 });
  });

  it('skips notification when the updater returns the same reference', () => {
    const store = new Store({ count: 0 });
    const listener = jest.fn();
    store.subscribe(listener);
    store.setState((prev) => prev);
    expect(listener).not.toHaveBeenCalled();
  });
});
